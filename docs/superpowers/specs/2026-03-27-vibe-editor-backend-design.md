# Vibe Editor Backend — Design Spec

**Date:** 2026-03-27
**Scope:** Sub-project 2 of VibeWeb multi-tenant platform
**Status:** Approved

## Overview

The Vibe Editor Backend enables tenants to modify their sites using natural language through Claude Code CLI. Each editing session runs in an isolated Docker container with Claude Code CLI + a WebSocket bridge server. An Agent Service manages session lifecycles and proxies communication between the user's browser and the session container.

This builds on Sub-project 1's infrastructure: files written to `preview/` trigger the Preview Server's live reload, and deployment uses the existing Control API endpoint.

## Architecture

```
Browser ──WebSocket──▶ Agent Service (port 3003)
                        │
                        ├─ Session Manager
                        │   └─ per-tenant Docker container
                        │       ├── Claude Code CLI
                        │       ├── bridge.js (WebSocket server, port 3100)
                        │       └── /workspace ← volume mount ← preview/
                        │
                        └─ CLAUDE.md Generator

File changes in /workspace ──volume──▶ /data/tenants/{id}/preview/
                                        │
                                        └──▶ Preview Server (live reload)
```

**Request flow:**
1. User sends "change header color to blue" via WebSocket
2. Agent Service proxies to session container's bridge WebSocket
3. Bridge forwards to Claude Code CLI stdin
4. Claude Code edits files in /workspace (= preview/)
5. Preview Server detects changes, pushes live reload to browser
6. Claude Code response streams back through bridge → Agent Service → user

## Components

### 1. Agent Service

New package: `packages/agent-service`

- Node.js + Fastify + ws + dockerode
- Listens on port 3003

**Session lifecycle:**
1. **Start:** User WebSocket connects + sends `session.start` → create container → wait for bridge ready → connect to bridge WebSocket → send `session.ready` to user
2. **Active:** Proxy messages bidirectionally: user WS ↔ bridge WS
3. **End:** User sends `session.end` or 30-minute inactivity timeout → stop/remove container → send `session.closed` to user

**WebSocket protocol (User ↔ Agent Service):**
```json
→ { "type": "session.start", "tenantId": "alice" }
← { "type": "session.ready", "sessionId": "xxx" }

→ { "type": "message", "sessionId": "xxx", "content": "헤더 색상을 파란색으로 바꿔줘" }
← { "type": "stream", "sessionId": "xxx", "data": { "type": "assistant", "content": "..." } }
← { "type": "stream", "sessionId": "xxx", "data": { "type": "tool_use", "tool": "write_file", "path": "..." } }
← { "type": "message.done", "sessionId": "xxx" }

→ { "type": "session.end", "sessionId": "xxx" }
← { "type": "session.closed", "sessionId": "xxx" }
```

**Session management:**
- One session per tenant at a time (prevent concurrent editing conflicts)
- Session metadata stored in SQLite (sessionId, tenantId, containerId, startedAt, status)
- Orphan container cleanup on Agent Service restart (query Docker for `vibeweb.role=agent-session` labels)

### 2. Session Container

Docker image: `vibeweb-session:latest` (built from `session-image/`)

**Image contents:**
- Base: `node:20` (not Alpine — Claude Code CLI needs glibc)
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- better-sqlite3 pre-installed
- npm available for tenant package installs
- `bridge.js` — WebSocket bridge server

**Volume mounts:**
- `/data/tenants/{id}/preview/` → `/workspace` (read-write) — Claude Code working directory
- `/data/tenants/{id}/db/` → `/data/db` (read-write) — tenant SQLite database

**Container constraints:**
- Memory: 512MB
- CPU: 1 core
- Session timeout: 30 minutes of inactivity → auto-terminate
- Network: npm registry access allowed (for package installs), other outbound blocked

**Container labels:**
- `vibeweb.role`: `agent-session`
- `vibeweb.tenant`: `{tenantId}`
- `vibeweb.session`: `{sessionId}`

### 3. Bridge Server (bridge.js)

Runs inside the session container. Bridges WebSocket messages to/from Claude Code CLI.

**Behavior:**
1. Start WebSocket server on port 3100
2. On connection from Agent Service:
   - Spawn Claude Code CLI: `claude --print --output-format stream-json`
   - Working directory: `/workspace`
   - Environment: OAuth token or API key
3. On message from Agent Service:
   - Write to Claude Code stdin
4. On Claude Code stdout (stream-json lines):
   - Parse each JSON line
   - Forward to Agent Service via WebSocket
5. On Claude Code process exit (normal — `--print` mode exits after each response):
   - Keep WebSocket open for next message
   - On next user message, spawn a new `claude --print` process with `--resume` flag to continue conversation context
6. On session end or timeout:
   - Close WebSocket, stop accepting messages

**Claude Code CLI flags:**
- `--print`: non-interactive mode, single message per invocation
- `--output-format stream-json`: structured JSON output for parsing
- `--dangerously-skip-permissions`: skip all permission prompts (safe because container is fully isolated)
- `--resume`: continue previous conversation context (used from 2nd message onward)

### 4. CLAUDE.md Auto-Generation

Generated by Agent Service before container start, placed at `/workspace/CLAUDE.md`.

**Template:**
```markdown
# Tenant: {tenant_name}

## Working Directory Structure
- /workspace/public/     — static files (HTML, CSS, JS, images)
- /workspace/functions/  — serverless API functions (/api/* routes)
- /data/db/tenant.db     — SQLite database

## Rules
- NEVER modify files outside /workspace and /data/db/
- Serverless functions go in /workspace/functions/api/ as .js files
- Function signature: export default async function(req) { return { status, headers, body } }
- DB access: use better-sqlite3, path is /data/db/tenant.db
- npm packages: run npm install in /workspace/functions/

## Current State
### Files
{auto-generated file tree}

### Database Tables
{auto-generated from sqlite_master}

### API Endpoints
{auto-generated from functions/api/*.js}
```

**Auto-refresh:** Generated fresh at session start by reading the actual filesystem and database.

### 5. Claude Authentication via `claude login`

Admin authenticates with Claude via the CLI's interactive OAuth flow. Credentials are stored on a shared volume and mounted into all session containers.

**Flow:**
1. Admin clicks "Connect Claude" in console Settings
2. Console calls `POST /auth/claude/login` on Agent Service
3. Agent Service spawns a temporary session container running `claude login`
4. The CLI outputs an OAuth URL — Agent Service captures it and returns to admin
5. Admin opens the URL in their browser, authenticates with Anthropic
6. Claude CLI saves credentials to `/data/claude-auth/` (shared volume)
7. Agent Service polls for credential file, returns success when found
8. All subsequent session containers mount `/data/claude-auth/` as `/root/.claude/`
9. Claude Code CLI in containers picks up credentials automatically

**Agent Service endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/claude/login` | Start `claude login` in temp container, return OAuth URL |
| `GET` | `/auth/claude/status` | Check if credentials exist on shared volume |
| `DELETE` | `/auth/claude` | Remove stored credentials |

**Credential storage:**
- Stored at `/data/claude-auth/` on host (Docker volume)
- Mounted read-only into session containers as `/root/.claude/`
- Platform-wide (not per-tenant) — one Claude account for all sessions
- Fallback: if `ANTHROPIC_API_KEY` env var is set, it's injected as before

### 6. Sessions Table

New table in the platform SQLite database:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  container_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active, closed, timed_out
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_activity_at TEXT NOT NULL
);
```

## Tech Stack Additions

| Layer | Technology |
|-------|-----------|
| Agent Service | Node.js + Fastify + ws + dockerode |
| Session Image | node:20 + Claude Code CLI + bridge.js |
| OAuth | Fastify routes + AES-256-GCM encryption |

## Project Structure Changes

```
vibeweb/
├── packages/
│   ├── agent-service/          # NEW
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts        # Fastify + WebSocket server, port 3003
│   │       ├── session.ts      # Session lifecycle (create/destroy container)
│   │       ├── proxy.ts        # User WS ↔ bridge WS proxy
│   │       ├── claude-md.ts    # CLAUDE.md auto-generation
│   │       └── __tests__/
│   ├── control-api/            # MODIFIED
│   │   └── src/routes/
│   │       └── oauth.ts        # NEW — OAuth endpoints
│   └── shared/                 # MODIFIED
│       └── src/types.ts        # Session type added
├── session-image/              # NEW
│   ├── Dockerfile
│   └── bridge.js
└── docker-compose.yml          # MODIFIED — agent-service added
```

## Docker Compose Addition

```yaml
agent-service:
  build:
    context: .
    dockerfile: packages/agent-service/Dockerfile
  environment:
    - DATA_DIR=/data
    - TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
  volumes:
    - tenant-data:/data/tenants
    - /var/run/docker.sock:/var/run/docker.sock
  ports:
    - "3003:3003"
  depends_on:
    - control-api
```

## Out of Scope (Future Sub-projects)

- Management console UI (web frontend for chat, file browser, DB explorer)
- Multi-user collaboration (multiple users editing same tenant simultaneously)
- Session history/replay
- Cost tracking per tenant
- Custom domain support
