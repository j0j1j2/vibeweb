# Tenant Site Serving & Isolation Infrastructure — Design Spec

**Date:** 2026-03-27
**Scope:** Sub-project 1 of VibeWeb multi-tenant platform
**Status:** Approved

## Overview

VibeWeb is a multi-tenant platform where each user gets a subdomain and can modify their own site via AI-powered "vibe coding" with Claude agents. This spec covers the foundational infrastructure: serving tenant sites, routing subdomains, executing serverless functions in isolation, and providing live preview during editing.

Subsequent sub-projects will cover: the vibe editor (Claude agent integration), and the admin platform (user auth, billing, dashboard).

## Architecture: Gateway-Centric

A single Traefik gateway routes all requests. Static files are served by a shared Nginx instance. Serverless functions run in per-tenant isolated containers spawned on demand. A Preview Server handles live editing sessions via WebSocket.

### Request Flow

```
Browser ──▶ Traefik Gateway (*.vibeweb.localhost)
              │
              ├─ static ──▶ Site Server (Nginx)
              │               └─ /data/tenants/{id}/public/
              │
              ├─ /api/* ──▶ Function Runner
              │               └─ spawns isolated container per tenant
              │               └─ /data/tenants/{id}/functions/
              │
              ├─ ?preview=true ──▶ Preview Server
              │                     └─ /data/tenants/{id}/preview/public/
              │
              └─ /ws ────▶ Preview Server (WebSocket)
                            └─ live reload for editing sessions

SQLite ← tenant metadata, subdomain mapping
Filesystem ← /data/tenants/{tenant-id}/
```

## Components

### 1. Traefik Gateway

- Wildcard matching on `*.vibeweb.localhost`
- Extracts subdomain from Host header
- ForwardAuth resolves subdomain → tenant UUID, injects as `X-Tenant-Id` header (UUID, not subdomain string)
- Routes by path:
  - `/api/*` → Function Runner
  - `/ws` → Preview Server
  - `?preview=true` → Preview Server (static preview serving)
  - Everything else → Nginx (Site Server)
- ForwardAuth middleware delegates tenant validation to Control API
- Unregistered subdomains get 404
- `vibeweb.localhost` (no subdomain) → Control API (port 1919)

### 2. Site Server (Nginx)

- Serves static files from `/data/tenants/{tenant-id}/public/`
- Reads `X-Tenant-Id` header to determine directory
- Path traversal protection via Nginx config
- No user code execution — pure file serving

### 3. Function Runner

- Node.js service managing isolated container lifecycle via Docker API (dockerode)
- Uses host Docker socket (not Docker-in-Docker)

**Function call flow:**
1. Request arrives with `X-Tenant-Id` header
2. Validates function file exists at `/data/tenants/{id}/functions/api/{path}.js`
3. Creates isolated container:
   - Base image: `vibeweb-runner:node20` (pre-built lightweight image)
   - Mounts `/data/tenants/{id}/functions/` → `/app` (read-only)
   - Mounts `/data/tenants/{id}/db/` → `/data/db` (read-write, tenant's own SQLite DB)
   - Passes request info via environment variables
4. Container executes function, returns response via stdout
5. 10-second timeout, then force kill
6. Response returned to client, container removed

**Container constraints:**
- Memory: 128MB limit
- CPU: 0.5 cores
- Timeout: 10 seconds
- Network: no external outbound access
- Filesystem: tenant functions/ read-only mount, tenant db/ read-write mount

**Function signature:**
```js
// /api/hello.js
export default async function(req) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { message: "Hello!" }
  };
}
```

**Tenant DB access from functions:**
Each tenant gets a SQLite database at `/data/db/tenant.db` inside the function container. Functions can use `better-sqlite3` (bundled in runner image) to read/write:
```js
// /api/notes.js
import Database from "better-sqlite3";
const db = new Database("/data/db/tenant.db");

export default async function(req) {
  if (req.method === "POST") {
    const { title, content } = JSON.parse(req.body);
    db.prepare("INSERT INTO notes (title, content) VALUES (?, ?)").run(title, content);
    return { status: 201, body: { ok: true } };
  }
  const notes = db.prepare("SELECT * FROM notes").all();
  return { status: 200, body: notes };
}
```

### 4. Preview Server

- WebSocket server for live reload during editing
- Also serves static preview files when `?preview=true`

**Live reload flow:**
1. Claude agent writes changes to `preview/` directory
2. chokidar watches `preview/` for file changes
3. WebSocket pushes change notification to tenant's browser
4. Browser reloads: CSS hot-swap, HTML/JS full reload

**Connection isolation:**
- WebSocket connections grouped by tenant-id (room concept)
- One tenant's changes never propagate to another tenant

**Preview vs Deploy:**
- Editing: served from `preview/public/`
- Deploy: atomic copy from `preview/` → `public/` and `functions/`
- Rollback: `public/` backed up before deploy

### 5. Control API

- Node.js + Fastify service
- Manages tenant lifecycle

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tenants` | Create tenant (allocate subdomain, init directories) |
| `GET` | `/tenants/:id` | Get tenant info |
| `DELETE` | `/tenants/:id` | Delete tenant (cleanup directories) |
| `POST` | `/tenants/:id/deploy` | Deploy preview → public |
| `POST` | `/tenants/:id/rollback` | Rollback to previous version |
| `GET` | `/tenants/:id/status` | Site status (deployed version, preview state) |
| `GET` | `/auth/validate` | ForwardAuth endpoint for Traefik (validates tenant exists) |

**Tenant creation:**
1. Validate subdomain (lowercase alphanumeric + hyphens, uniqueness check)
2. Insert tenant record in SQLite
3. Create `/data/tenants/{id}/` directory structure
4. Place default `index.html` template
5. Subdomain immediately accessible

**Auth:** Simple API key for this sub-project. Full user auth in admin platform sub-project.

### 6. SQLite Database

**Schema:**
```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,           -- UUID
  subdomain TEXT UNIQUE NOT NULL, -- e.g. "alice"
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT DEFAULT 'active'   -- active, suspended, deleted
);

CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  deployed_at TEXT NOT NULL,
  backup_path TEXT               -- path to pre-deploy backup
);
```

## Tenant Filesystem Structure

```
/data/tenants/
  └── {tenant-id}/
      ├── public/          # Deployed static files (served by Nginx)
      │   ├── index.html
      │   ├── styles.css
      │   └── assets/
      ├── functions/        # Serverless function code
      │   ├── package.json
      │   └── api/
      │       └── hello.js
      ├── preview/          # Draft changes (not yet deployed)
      │   ├── public/
      │   └── functions/
      ├── db/                # Tenant's own SQLite database(s)
      │   └── tenant.db     # default DB, accessible from serverless functions
      └── metadata.json     # Tenant config
```

## Isolation Model

| Layer | Static Serving | Function Execution |
|-------|---------------|-------------------|
| Process | Shared Nginx | Per-request container |
| Filesystem | Nginx reads only tenant's `public/` via header | Read-only mount of `functions/`, read-write mount of `db/` |
| Network | N/A (no execution) | No external outbound |
| Resources | N/A | 128MB RAM, 0.5 CPU, 10s timeout |
| Path traversal | Nginx config blocks `..` | Container has no access to host FS |

**Local dev:** Docker containers provide isolation.
**Production (future):** Function Runner containers replaced by Firecracker microVMs for VM-level isolation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (all services) |
| Runtime | Node.js 20 |
| API framework | Fastify |
| Database | SQLite (better-sqlite3) |
| WebSocket | ws |
| File watching | chokidar |
| Container management | dockerode |
| Reverse proxy | Traefik v3 |
| Static serving | Nginx |
| Package management | pnpm workspace (monorepo) |

## Project Structure

```
vibeweb/
├── docker-compose.yml
├── packages/
│   ├── control-api/       # Tenant CRUD, deploy, ForwardAuth
│   ├── function-runner/   # Serverless function execution
│   ├── preview-server/    # WebSocket live preview
│   └── shared/            # Common types, utilities
├── configs/
│   ├── traefik/           # Traefik static + dynamic config
│   └── nginx/             # Nginx config template
├── runner-image/          # Lightweight Node.js image for functions
│   └── Dockerfile
└── data/                  # Tenant files (Docker volume)
    └── tenants/
```

## Docker Compose Services

1. **traefik** — Reverse proxy, port 80
2. **nginx** — Static file serving
3. **control-api** — Tenant management API, port 1919
4. **function-runner** — Docker socket mounted, spawns function containers
5. **preview-server** — WebSocket, file watching

## Out of Scope (Future Sub-projects)

- Claude agent integration (vibe editor)
- User authentication and registration
- Admin dashboard UI
- Billing and usage tracking
- Custom domain support
- SSL/TLS (HTTPS)
- Production deployment (Firecracker, Kubernetes, etc.)
