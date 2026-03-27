# Management Console UI — Design Spec

**Date:** 2026-03-27
**Scope:** Sub-project 3 of VibeWeb multi-tenant platform
**Status:** Approved

## Overview

A React SPA management console served at `console.vibeweb.localhost`. Provides two interfaces:
1. **Admin Dashboard** — tenant CRUD, session monitoring
2. **Tenant Editing Console** — vibe editor chat with live preview, file explorer, database browser, API management, and settings

Builds on existing backend: Control API (port 1919) for tenant/data operations, Agent Service (port 3003) for Claude Code WebSocket sessions, Preview Server (port 3002) for live reload.

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
        ├── fetch → Control API (vibeweb.localhost)
        │              ├── GET/POST/DELETE /tenants
        │              ├── GET /tenants/:id/auth/claude/status
        │              └── POST /tenants/:id/deploy
        │
        ├── WebSocket → Agent Service (port 3003/ws)
        │              ├── session.start / session.end
        │              └── message / stream
        │
        └── iframe → {subdomain}.vibeweb.localhost?preview=true
                       └── Preview Server (live reload)
```

## Pages & Routes

| Route | Page | Auth | Description |
|-------|------|------|-------------|
| `/login` | LoginPage | None | API key input → authenticate |
| `/admin` | AdminPage | Admin | Tenant list, create/delete, session status |
| `/t/:tenantId/chat` | ChatPage | Tenant | Vibe editor: chat panel + preview/files/db tabs |
| `/t/:tenantId/files` | FilesPage | Tenant | File tree + code viewer |
| `/t/:tenantId/db` | DbPage | Tenant | SQL input + result table |
| `/t/:tenantId/api` | ApiPage | Tenant | Serverless function list + test invoke |
| `/t/:tenantId/settings` | SettingsPage | Tenant | Deploy, Claude OAuth, subdomain |

## URL Routing

| URL | Target |
|-----|--------|
| `console.vibeweb.localhost/*` | Console SPA (this project) |
| `vibeweb.localhost/*` | Control API (existing) |
| `{subdomain}.vibeweb.localhost` | Tenant site (existing) |
| `{subdomain}.vibeweb.localhost?preview=true` | Preview (existing) |

Traefik routes `Host("console.vibeweb.localhost")` to the console Nginx container at priority 200 (higher than tenant routes).

## Authentication

API key-based authentication using existing tenant `api_key` field.

**Flow:**
1. User enters API key on `/login`
2. Frontend calls `GET /auth/validate` with `X-API-Key` header
3. Control API returns tenant info if valid
4. Frontend stores API key + tenant info in `localStorage`
5. All subsequent API calls include `X-API-Key` header
6. Admin access uses a separate admin key (environment variable `ADMIN_API_KEY`)

**Route guards:**
- `/login` — public
- `/admin` — requires admin key
- `/t/:tenantId/*` — requires tenant API key matching that tenant

## Layout

**Theme:** Light/white theme with violet accent color (#7c3aed).

**Global layout:** Tree sidebar (left, fixed 240px) + main area (right, flex).

**Tree sidebar content:**
- Admin login: Admin section (Dashboard, Tenants) + all tenant entries
- Tenant login: only the authenticated tenant's entry

```
▾ Admin           (admin only)
  Dashboard
  Tenants
▾ alice           (current tenant, expanded)
  💬 Chat
  📁 Files
  🗄️ Database
  🔌 API
  ⚙️ Settings
▸ bob             (admin only, collapsed)
```

## Page Details

### ChatPage (`/t/:tenantId/chat`)

Split layout: tabbed main area (left, flex) + chat panel (right, fixed 380px).

**Chat panel (right):**
- Message list with avatar icons (User/Bot)
- Claude responses streamed in real-time with typing indicator
- Tool use indicators shown as inline badges
- Input area: textarea + send button, Ctrl+Enter to send

**WebSocket connection:**
1. On page load, connect to Agent Service WebSocket (`ws://localhost:3003/ws`)
2. Send `session.start` with tenantId
3. Wait for `session.ready`
4. User types message → send `message` with content
5. Receive `stream` events → append to current Claude message
6. Receive `message.done` → mark message complete
7. On page leave, send `session.end`

**Tabbed main area (left):**
- **Preview** (default): iframe loading `{subdomain}.vibeweb.localhost?preview=true`. Auto-refreshes via Preview Server's existing WebSocket live reload.
- **Files**: read-only file tree + syntax-highlighted code viewer (using simple `<pre>` + CSS syntax highlighting). Shows files changed during current session.
- **DB**: quick view of tenant database tables and row counts.

### FilesPage (`/t/:tenantId/files`)

Split layout: file tree (left 30%) + file content (right 70%).

**File tree:**
- Fetched from Control API (new endpoint needed: `GET /tenants/:id/files`)
- Displays `preview/` directory structure
- Click file to view content

**File viewer:**
- Read-only code display with syntax highlighting
- Shows file path, size, last modified

### DbPage (`/t/:tenantId/db`)

Vertical split: SQL input (top) + results (bottom).

**SQL input:**
- Textarea for SQL queries
- "Run" button (Ctrl+Enter shortcut)
- Calls new Control API endpoint: `POST /tenants/:id/db/query` with `{ sql: "SELECT ..." }`

**Results:**
- Table display for SELECT results
- Row count + execution time for mutations
- Error display for invalid queries

**Safety:** Only SELECT queries allowed from the console UI. Mutations go through the vibe editor chat.

### ApiPage (`/t/:tenantId/api`)

**Function list:**
- Table: function name, path, last modified
- Fetched from file listing of `functions/api/`

**Test invoke:**
- Select a function → form with method, path, headers, body
- "Send" button → calls function via Function Runner
- Response display: status, headers, body

### AdminPage (`/admin`)

**Tenant table:**
- Columns: name, subdomain, status, active session, created date
- Actions: view (navigate to `/t/:id/chat`), delete (with confirmation dialog)

**Create tenant:**
- Button opens dialog with subdomain + name inputs
- Calls `POST /tenants`

### SettingsPage (`/t/:tenantId/settings`)

- **Deploy:** Button to deploy preview → public. Shows last deployment date.
- **Claude Connection:** Status indicator (connected/not connected). Connect/disconnect buttons.
- **Subdomain:** Display current subdomain (read-only for now).

## New API Endpoints Needed

These endpoints must be added to Control API:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tenants/:id/files` | List files in tenant's preview/ directory |
| `GET` | `/tenants/:id/files/*` | Read file content |
| `POST` | `/tenants/:id/db/query` | Execute SELECT query on tenant SQLite DB |

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 19 | UI framework |
| Vite | Build tool + dev server |
| React Router v7 | Client-side routing |
| shadcn/ui | UI component library |
| Tailwind CSS | Styling |
| Lucide React | Icons |

## Project Structure

```
packages/console/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── tailwind.config.ts
├── postcss.config.js
├── components.json
├── Dockerfile
└── src/
    ├── main.tsx
    ├── App.tsx               # Router setup
    ├── api.ts                # Control API client (fetch wrapper)
    ├── auth.ts               # Auth state (localStorage + context)
    ├── components/
    │   ├── ui/               # shadcn/ui components
    │   ├── Sidebar.tsx       # Tree sidebar navigation
    │   ├── ChatPanel.tsx     # Chat messages + input
    │   ├── PreviewFrame.tsx  # iframe live preview
    │   ├── FileTree.tsx      # File explorer tree
    │   ├── FileViewer.tsx    # Syntax-highlighted code viewer
    │   ├── DbExplorer.tsx    # SQL input + result table
    │   └── TenantTable.tsx   # Admin tenant list
    └── pages/
        ├── LoginPage.tsx
        ├── AdminPage.tsx
        ├── ChatPage.tsx
        ├── FilesPage.tsx
        ├── DbPage.tsx
        ├── ApiPage.tsx
        └── SettingsPage.tsx
```

## Docker & Traefik

**Console Dockerfile:** Multi-stage build — Vite builds to `/dist`, Nginx serves static files.

**Docker Compose addition:**
```yaml
console:
  build:
    context: .
    dockerfile: packages/console/Dockerfile
  ports:
    - "5173:80"
```

**Traefik dynamic.yml addition:**
```yaml
routers:
  console:
    rule: "Host(`console.vibeweb.localhost`)"
    service: console
    entryPoints:
      - web
    priority: 200

services:
  console:
    loadBalancer:
      servers:
        - url: "http://console:80"
```

## Out of Scope

- User registration / email-password auth (future)
- Multi-user collaboration on same tenant
- File editing directly in console (use vibe editor chat instead)
- DB schema migration UI
- Custom domain management
- Billing / usage tracking
