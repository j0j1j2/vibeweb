# Management Console UI — Design Spec

**Date:** 2026-03-27
**Scope:** Sub-project 3 of VibeWeb multi-tenant platform
**Status:** Approved (updated with implementation changes)

## Overview

A React SPA management console served at `console.vibeweb.localhost`. Provides two interfaces:
1. **Admin Dashboard** — tenant CRUD, per-tenant Claude connection management
2. **Tenant Editing Console** — vibe editor chat with live preview, file explorer, database browser, API management, and deploy settings

Builds on existing backend: Control API (port 1919) for tenant/data operations, Agent Service (port 3003) for Claude Code WebSocket sessions and Claude OAuth, Preview Server (port 3002) for live reload.

## Architecture

```
console.vibeweb.localhost
        │
        ▼
    Traefik (priority 200)
        │
        ▼
    Console SPA (Nginx, port 5173)
        │
        ├── /api/* → Control API (port 1919)
        │              ├── GET/POST/DELETE /tenants
        │              ├── POST /auth/login
        │              ├── POST /tenants/:id/deploy
        │              ├── GET /tenants/:id/files
        │              └── POST /tenants/:id/db/query
        │
        ├── /agent-api/* → Agent Service (port 3003)
        │              ├── POST /auth/claude/:tenantId/login
        │              ├── POST /auth/claude/:tenantId/code
        │              ├── GET /auth/claude/:tenantId/status
        │              └── DELETE /auth/claude/:tenantId
        │
        ├── /ws/agent → Agent Service WebSocket (port 3003/ws)
        │              ├── session.start / session.end
        │              └── message / stream
        │
        └── iframe → {subdomain}.vibeweb.localhost?preview=true
                       └── Preview Server (live reload)
```

**Nginx proxy config (`configs/console-nginx.conf`):**
- `/api/` → `http://control-api:1919/`
- `/agent-api/` → `http://agent-service:3003/`
- `/ws/agent` → `ws://agent-service:3003/ws` (WebSocket upgrade)
- `/` → SPA fallback (`index.html`)

## Pages & Routes

| Route | Page | Chat Panel | Description |
|-------|------|------------|-------------|
| `/login` | LoginPage | No | API key input → authenticate |
| `/admin` | AdminPage | No | Tenant list, create/delete, per-tenant Claude connection |
| `/t/:tenantId/preview` | PreviewPage | Yes | Live preview iframe |
| `/t/:tenantId/view` | ViewPage | Yes | Frontend page management — list HTML pages, preview selected |
| `/t/:tenantId/files` | FilesPage | Yes | File tree + code viewer |
| `/t/:tenantId/db` | DbPage | Yes | SQL query explorer |
| `/t/:tenantId/api` | ApiPage | Yes | Serverless function list |
| `/t/:tenantId/settings` | SettingsPage | No | Deploy, subdomain info |

**Chat panel** (380px, right side) appears on all tenant pages except Settings. A shared `ChatLayout` wrapper manages the WebSocket session and renders the chat panel alongside the page content. The session persists across page navigation within the same tenant.

## Authentication

API key-based authentication using existing tenant `api_key` field.

**Flow:**
1. User enters API key on `/login`
2. Frontend calls `POST /auth/login` with `{ api_key: "..." }`
3. Control API returns tenant info (or `{ admin: true }` for admin key)
4. Frontend stores API key + tenant info in `localStorage`
5. All subsequent API calls include `X-API-Key` header
6. Admin access uses `ADMIN_API_KEY` environment variable (default: `vibeweb-admin-secret`)

**Route guards:**
- `/login` — public
- `/admin` — requires admin key
- `/t/:tenantId/*` — requires tenant API key matching that tenant

## Layout

**Theme:** Light/white theme with violet accent color (`#7c3aed`).

**Global layout:** Tree sidebar (left, fixed 240px) + main area (right, flex).

**Tree sidebar content:**
- Admin login: Platform section (Dashboard) + all tenant entries
- Tenant login: only the authenticated tenant's entry

```
▾ Platform         (admin only)
  Dashboard
▾ alice           (current tenant, expanded)
  🖥️ Preview
  🎨 View
  📁 Files
  🗄️ Database
  🔌 API
  ⚙️ Settings
▸ bob             (admin only, collapsed)
```

Each page (except Settings) has a shared chat panel on the right for vibe editing.

## Page Details

### AdminPage (`/admin`)

**Tenant table with integrated Claude connection management:**
- Columns: Name, Subdomain, Claude (connection status), Status, Actions
- Claude column shows Connected/Not connected badge — clicking expands inline OAuth panel
- Actions: Open (→ Chat), Delete (with confirmation)

**Per-tenant Claude OAuth (admin-only):**
- Expand a tenant row → "Connect Claude Account" button
- Starts `claude auth login` in a temp Docker container
- Returns OAuth URL → admin opens in browser → authenticates
- Callback shows authorization code → admin pastes into console
- Code submitted to Agent Service → piped to container stdin → credentials saved
- Credentials stored at `/data/tenants/{id}/claude-auth/` per tenant

**Create tenant:**
- "New Tenant" button → inline form with subdomain + name inputs

### PreviewPage (`/t/:tenantId/preview`)

Full-screen iframe preview of the tenant site (`{subdomain}.vibeweb.localhost?preview=true`). URL bar with refresh + external link buttons. Auto-refreshes via Preview Server's live reload. Chat panel on right for making changes.

### ViewPage (`/t/:tenantId/view`)

Frontend page management. Left sidebar lists all HTML pages from `public/`. Selecting a page shows its preview in the main area. Chat panel on right for editing the selected page visually.

### FilesPage (`/t/:tenantId/files`)

Split layout: file tree (left 240px) + code viewer (right). Read-only display with syntax highlighting. Chat panel on right for making file changes.

### DbPage (`/t/:tenantId/db`)

SQL query textarea (Ctrl+Enter to run) + result table. Only SELECT/PRAGMA queries allowed. Chat panel on right for database operations.

### ApiPage (`/t/:tenantId/api`)

Lists serverless functions from `functions/api/*.js`. Table: function name, endpoint path. Chat panel on right for creating/editing functions.

### SettingsPage (`/t/:tenantId/settings`)

- **Subdomain:** Display current subdomain (read-only)
- **Deploy:** Button to deploy preview → public. Shows last deployment date.
- No chat panel. Claude connection managed from Admin Dashboard.

### Shared Chat Panel (ChatLayout)

All pages except Settings are wrapped in `ChatLayout`, which:
1. Establishes a WebSocket connection to Agent Service (`/ws/agent`)
2. Sends `session.start` with tenantId on mount
3. Renders the chat panel (380px right) alongside page content
4. Provides `ChatContext` with subdomain and connection state
5. Sends `session.end` on unmount

## API Endpoints

**Control API (proxied via `/api/`):**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Authenticate with API key or admin key |
| `GET` | `/tenants` | List all tenants (admin) |
| `POST` | `/tenants` | Create tenant |
| `GET` | `/tenants/:id` | Get tenant details |
| `DELETE` | `/tenants/:id` | Delete tenant |
| `POST` | `/tenants/:id/deploy` | Deploy preview → public |
| `GET` | `/tenants/:id/status` | Tenant status + last deployment |
| `GET` | `/tenants/:id/files` | List files in preview/ directory |
| `GET` | `/tenants/:id/files/*` | Read file content |
| `POST` | `/tenants/:id/db/query` | Execute SELECT query on tenant SQLite DB |

**Agent Service (proxied via `/agent-api/`):**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/claude/:tenantId/login` | Start claude auth login, return OAuth URL |
| `POST` | `/auth/claude/:tenantId/code` | Submit authorization code to complete login |
| `GET` | `/auth/claude/:tenantId/status` | Check if tenant has Claude credentials |
| `DELETE` | `/auth/claude/:tenantId` | Remove tenant's Claude credentials |

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 19 | UI framework |
| Vite | Build tool + dev server |
| React Router v7 | Client-side routing |
| shadcn/ui | UI component library |
| Tailwind CSS v4 | Styling |
| Lucide React | Icons |

## Project Structure

```
packages/console/
├── package.json
├── tsconfig.json
├── vite.config.ts          # Vite config with /api + /agent-api + /ws proxies
├── index.html
├── tailwind.config.ts
├── postcss.config.js
├── components.json         # shadcn/ui config
├── Dockerfile              # Multi-stage: Vite build → Nginx serve
└── src/
    ├── main.tsx
    ├── App.tsx              # Router + AuthProvider + AppLayout
    ├── api.ts               # Control API + Agent Service client
    ├── auth.tsx             # Auth context (localStorage + React context)
    ├── lib/utils.ts         # cn() helper
    ├── components/
    │   ├── ui/              # shadcn/ui components (button, input, dialog, etc.)
    │   ├── Sidebar.tsx      # Tree sidebar (Platform + Sites sections)
    │   ├── ChatLayout.tsx   # Shared WebSocket session + chat panel wrapper
    │   ├── ChatPanel.tsx    # Chat messages + input (right panel)
    │   ├── PreviewFrame.tsx # iframe live preview with URL bar
    │   ├── FileTree.tsx     # Hierarchical file tree
    │   ├── FileViewer.tsx   # Read-only code viewer
    │   └── DbExplorer.tsx   # SQL input + result table
    └── pages/
        ├── LoginPage.tsx    # API key login
        ├── AdminPage.tsx    # Tenant table + inline Claude auth per tenant
        ├── PreviewPage.tsx  # Live preview + chat
        ├── ViewPage.tsx     # Frontend page management + chat
        ├── FilesPage.tsx    # File explorer + chat
        ├── DbPage.tsx       # SQL explorer + chat
        ├── ApiPage.tsx      # Function list + chat
        └── SettingsPage.tsx # Subdomain + deploy (no chat)

configs/
└── console-nginx.conf      # Nginx: SPA fallback + /api + /agent-api + /ws proxies
```

## Docker & Traefik

**Console Dockerfile:** Multi-stage build — Vite builds to `/dist`, Nginx serves with custom `console-nginx.conf`.

**Docker Compose:**
```yaml
console:
  build:
    context: .
    dockerfile: packages/console/Dockerfile
  ports:
    - "5173:80"
```

**Traefik routing:**
```yaml
routers:
  console:
    rule: "Host(`console.vibeweb.localhost`)"
    service: console
    entryPoints:
      - web
    priority: 200
```

## Out of Scope

- User registration / email-password auth (future)
- Multi-user collaboration on same tenant
- File editing directly in console (use vibe editor chat instead)
- DB schema migration UI
- Custom domain management
- Billing / usage tracking
