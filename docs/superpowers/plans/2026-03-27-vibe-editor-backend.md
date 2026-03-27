# Vibe Editor Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable tenants to edit their sites via natural language by running Claude Code CLI in per-session Docker containers, with WebSocket communication and OAuth authentication.

**Architecture:** An Agent Service manages session containers (each running Claude Code CLI + a WebSocket bridge). Users connect via WebSocket, messages flow through the bridge to Claude Code, file changes land in the tenant's preview/ directory triggering live reload. OAuth tokens are stored encrypted in the platform DB.

**Tech Stack:** TypeScript, Node.js 20, Fastify, ws, dockerode, Claude Code CLI, AES-256-GCM encryption, Docker.

---

## File Map

```
vibeweb/
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── types.ts              # MODIFIED — add Session, OAuthToken types
│   │       └── constants.ts          # MODIFIED — add AGENT_SERVICE_PORT, SESSION_IMAGE, etc.
│   ├── control-api/
│   │   └── src/
│   │       ├── db.ts                 # MODIFIED — add sessions table, oauth columns, session queries
│   │       └── routes/
│   │           └── oauth.ts          # NEW — OAuth endpoints
│   ├── agent-service/                # NEW PACKAGE
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts              # Fastify + WebSocket server, port 3003
│   │       ├── session.ts            # Session lifecycle (create/destroy container)
│   │       ├── proxy.ts              # User WS ↔ bridge WS proxy
│   │       ├── claude-md.ts          # CLAUDE.md auto-generation
│   │       ├── crypto.ts             # Token encryption/decryption
│   │       └── __tests__/
│   │           ├── session.test.ts
│   │           ├── proxy.test.ts
│   │           ├── claude-md.test.ts
│   │           └── crypto.test.ts
├── session-image/                    # NEW
│   ├── Dockerfile
│   └── bridge.js
└── docker-compose.yml                # MODIFIED — add agent-service
```

---

### Task 1: Shared Types & Constants Update

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/constants.ts`

- [ ] **Step 1: Add Session and OAuth types to types.ts**

Add to the end of `packages/shared/src/types.ts`:

```typescript
export interface Session {
  id: string;
  tenant_id: string;
  container_id: string;
  status: "active" | "closed" | "timed_out";
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
}

export interface WsMessage {
  type: string;
  sessionId?: string;
  tenantId?: string;
  content?: string;
  data?: unknown;
  error?: string;
}
```

- [ ] **Step 2: Add agent-service constants to constants.ts**

Add to the end of `packages/shared/src/constants.ts`:

```typescript
export const AGENT_SERVICE_PORT = 3003;
export const SESSION_IMAGE = "vibeweb-session:latest";
export const SESSION_BRIDGE_PORT = 3100;
export const SESSION_MEMORY_LIMIT = "512m";
export const SESSION_CPU_LIMIT = 1;
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
```

- [ ] **Step 3: Rebuild shared package**

Run: `cd packages/shared && npx tsc`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/constants.ts
git commit -m "feat: add Session types and agent-service constants to shared"
```

---

### Task 2: Agent Service Package Scaffolding

**Files:**
- Create: `packages/agent-service/package.json`
- Create: `packages/agent-service/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@vibeweb/agent-service",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@vibeweb/shared": "workspace:*",
    "fastify": "^5.0.0",
    "ws": "^8.0.0",
    "dockerode": "^4.0.0",
    "better-sqlite3": "^11.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/ws": "^8.0.0",
    "@types/dockerode": "^3.3.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create src directory and install deps**

Run: `mkdir -p packages/agent-service/src/__tests__ && pnpm install`
Expected: dependencies installed, lockfile updated

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/package.json packages/agent-service/tsconfig.json pnpm-lock.yaml
git commit -m "chore: scaffold agent-service package"
```

---

### Task 3: Token Encryption Module

**Files:**
- Create: `packages/agent-service/src/crypto.ts`
- Create: `packages/agent-service/src/__tests__/crypto.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/agent-service/src/__tests__/crypto.test.ts
import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "../crypto.js";

describe("crypto", () => {
  const key = "a".repeat(64); // 32 bytes hex

  it("encrypts and decrypts a token", () => {
    const token = "sk-ant-oauth-test-token-12345";
    const encrypted = encryptToken(token, key);
    expect(encrypted).not.toBe(token);
    expect(encrypted).toContain(":"); // iv:authTag:ciphertext format

    const decrypted = decryptToken(encrypted, key);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertexts for same plaintext", () => {
    const token = "same-token";
    const e1 = encryptToken(token, key);
    const e2 = encryptToken(token, key);
    expect(e1).not.toBe(e2); // different IVs
  });

  it("fails to decrypt with wrong key", () => {
    const token = "secret-token";
    const encrypted = encryptToken(token, key);
    const wrongKey = "b".repeat(64);
    expect(() => decryptToken(encrypted, wrongKey)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: FAIL — `crypto.js` does not exist

- [ ] **Step 3: Implement crypto.ts**

```typescript
// packages/agent-service/src/crypto.ts
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

export function encryptToken(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, "hex");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptToken(encrypted: string, hexKey: string): string {
  const [ivHex, authTagHex, ciphertext] = encrypted.split(":");
  const key = Buffer.from(hexKey, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/crypto.ts packages/agent-service/src/__tests__/crypto.test.ts
git commit -m "feat: add AES-256-GCM token encryption module"
```

---

### Task 4: CLAUDE.md Auto-Generation

**Files:**
- Create: `packages/agent-service/src/claude-md.ts`
- Create: `packages/agent-service/src/__tests__/claude-md.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/agent-service/src/__tests__/claude-md.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateClaudeMd } from "../claude-md.js";

describe("claude-md", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-claudemd-"));
    // Create tenant preview structure
    const previewPublic = path.join(tmpDir, "preview", "public");
    const previewFunctions = path.join(tmpDir, "preview", "functions", "api");
    const dbDir = path.join(tmpDir, "db");
    fs.mkdirSync(previewPublic, { recursive: true });
    fs.mkdirSync(previewFunctions, { recursive: true });
    fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(path.join(previewPublic, "index.html"), "<h1>Hello</h1>");
    fs.writeFileSync(path.join(previewPublic, "style.css"), "body {}");
    fs.writeFileSync(path.join(previewFunctions, "hello.js"), "export default async () => ({})");
    // Create empty sqlite db
    fs.writeFileSync(path.join(dbDir, "tenant.db"), "");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates CLAUDE.md with file tree", () => {
    const md = generateClaudeMd("Test Tenant", path.join(tmpDir, "preview"), path.join(tmpDir, "db"));

    expect(md).toContain("# Tenant: Test Tenant");
    expect(md).toContain("index.html");
    expect(md).toContain("style.css");
    expect(md).toContain("/api/hello");
    expect(md).toContain("NEVER modify files outside");
  });

  it("handles empty directories", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-empty-"));
    fs.mkdirSync(path.join(emptyDir, "preview", "public"), { recursive: true });
    fs.mkdirSync(path.join(emptyDir, "preview", "functions", "api"), { recursive: true });
    fs.mkdirSync(path.join(emptyDir, "db"), { recursive: true });
    fs.writeFileSync(path.join(emptyDir, "db", "tenant.db"), "");

    const md = generateClaudeMd("Empty", path.join(emptyDir, "preview"), path.join(emptyDir, "db"));
    expect(md).toContain("# Tenant: Empty");
    expect(md).toContain("(no files yet)");

    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: FAIL — `claude-md.js` does not exist

- [ ] **Step 3: Implement claude-md.ts**

```typescript
// packages/agent-service/src/claude-md.ts
import fs from "node:fs";
import path from "node:path";

export function generateClaudeMd(
  tenantName: string,
  previewDir: string,
  dbDir: string,
): string {
  const fileTree = buildFileTree(previewDir);
  const apiEndpoints = findApiEndpoints(path.join(previewDir, "functions", "api"));
  const dbTables = readDbTables(path.join(dbDir, "tenant.db"));

  return `# Tenant: ${tenantName}

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
${fileTree || "(no files yet)"}

### API Endpoints
${apiEndpoints || "(no API endpoints yet)"}

### Database Tables
${dbTables || "(no tables yet)"}
`;
}

function buildFileTree(dir: string, prefix: string = ""): string {
  if (!fs.existsSync(dir)) return "";

  const lines: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "CLAUDE.md") continue;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      lines.push(...buildFileTree(path.join(dir, entry.name), relPath).split("\n").filter(Boolean));
    } else {
      lines.push(`- ${relPath}`);
    }
  }

  return lines.join("\n");
}

function findApiEndpoints(apiDir: string): string {
  if (!fs.existsSync(apiDir)) return "";

  const lines: string[] = [];
  const files = fs.readdirSync(apiDir).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const name = file.replace(/\.js$/, "");
    lines.push(`- /api/${name}`);
  }

  return lines.join("\n");
}

function readDbTables(dbPath: string): string {
  if (!fs.existsSync(dbPath)) return "";

  try {
    // Dynamic import to avoid hard dependency when db is empty
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    db.close();

    if (tables.length === 0) return "";

    const lines: string[] = [];
    for (const table of tables) {
      lines.push(`- ${table.name}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: all tests PASS (3 crypto + 2 claude-md)

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/claude-md.ts packages/agent-service/src/__tests__/claude-md.test.ts
git commit -m "feat: add CLAUDE.md auto-generation for tenant context"
```

---

### Task 5: Session Container Image

**Files:**
- Create: `session-image/Dockerfile`
- Create: `session-image/bridge.js`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# session-image/Dockerfile
FROM node:20

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Pre-install better-sqlite3 for tenant functions
WORKDIR /opt/libs
RUN npm install better-sqlite3@11

# Bridge server
COPY bridge.js /opt/bridge/bridge.js

WORKDIR /workspace

EXPOSE 3100

CMD ["node", "/opt/bridge/bridge.js"]
```

- [ ] **Step 2: Create bridge.js**

```javascript
// session-image/bridge.js
// WebSocket bridge: connects Agent Service to Claude Code CLI
// Runs inside the session container.

const { WebSocketServer } = require("ws");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = process.env.BRIDGE_PORT ?? 3100;
const WORKSPACE = process.env.WORKSPACE ?? "/workspace";

const wss = new WebSocketServer({ port: Number(PORT) });
console.log(`Bridge server listening on port ${PORT}`);

let claudeProcess = null;
let conversationId = null;
let ws = null;

wss.on("connection", (socket) => {
  console.log("Agent Service connected");
  ws = socket;

  socket.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "message") {
      runClaude(msg.content);
    } else if (msg.type === "session.end") {
      cleanup();
      socket.close();
    }
  });

  socket.on("close", () => {
    console.log("Agent Service disconnected");
    cleanup();
  });
});

function runClaude(prompt) {
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--dangerously-skip-permissions",
  ];

  // Resume previous conversation if we have one
  if (conversationId) {
    args.push("--resume", conversationId);
  }

  // Append the user prompt
  args.push(prompt);

  console.log(`Spawning claude with args: ${args.join(" ")}`);

  claudeProcess = spawn("claude", args, {
    cwd: WORKSPACE,
    env: {
      ...process.env,
      HOME: "/root",
      NODE_PATH: "/opt/libs/node_modules",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";

  claudeProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();

    // stream-json outputs one JSON object per line
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);

        // Capture conversation ID for --resume
        if (parsed.session_id) {
          conversationId = parsed.session_id;
        }

        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "stream", data: parsed }));
        }
      } catch {
        // Non-JSON line, forward as text
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "stream", data: { type: "text", content: line } }));
        }
      }
    }
  });

  claudeProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    console.error(`Claude stderr: ${text}`);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "stream", data: { type: "error", content: text } }));
    }
  });

  claudeProcess.on("close", (code) => {
    console.log(`Claude process exited with code ${code}`);
    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.session_id) conversationId = parsed.session_id;
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "stream", data: parsed }));
        }
      } catch { /* ignore */ }
    }

    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "message.done" }));
    }
    claudeProcess = null;
  });
}

function cleanup() {
  if (claudeProcess) {
    claudeProcess.kill("SIGTERM");
    claudeProcess = null;
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  cleanup();
  wss.close();
  process.exit(0);
});
```

- [ ] **Step 3: Build the session image**

Run: `docker build -t vibeweb-session:latest session-image/`
Expected: Image built successfully (this will take a while — installs Claude Code CLI)

- [ ] **Step 4: Commit**

```bash
git add session-image/
git commit -m "feat: add session container image with Claude Code CLI and WebSocket bridge"
```

---

### Task 6: Session Manager

**Files:**
- Create: `packages/agent-service/src/session.ts`
- Create: `packages/agent-service/src/__tests__/session.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/agent-service/src/__tests__/session.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../session.js";

// Mock dockerode
vi.mock("dockerode", () => {
  const mockContainer = {
    id: "container-123",
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      State: { Running: true },
      NetworkSettings: { Ports: { "3100/tcp": [{ HostPort: "49152" }] } },
    }),
  };

  return {
    default: vi.fn().mockImplementation(() => ({
      createContainer: vi.fn().mockResolvedValue(mockContainer),
      listContainers: vi.fn().mockResolvedValue([]),
      getContainer: vi.fn().mockReturnValue(mockContainer),
    })),
  };
});

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager("/data/tenants");
  });

  it("creates a session with correct container config", async () => {
    const session = await manager.createSession({
      tenantId: "tenant-abc",
      sessionId: "session-123",
      claudeMdContent: "# Test",
      authToken: "test-token",
    });

    expect(session.containerId).toBe("container-123");
    expect(session.bridgePort).toBeDefined();
  });

  it("prevents duplicate sessions for same tenant", async () => {
    await manager.createSession({
      tenantId: "tenant-abc",
      sessionId: "session-1",
      claudeMdContent: "# Test",
      authToken: "token",
    });

    await expect(
      manager.createSession({
        tenantId: "tenant-abc",
        sessionId: "session-2",
        claudeMdContent: "# Test",
        authToken: "token",
      })
    ).rejects.toThrow("already has an active session");
  });

  it("destroys a session and removes container", async () => {
    await manager.createSession({
      tenantId: "tenant-abc",
      sessionId: "session-1",
      claudeMdContent: "# Test",
      authToken: "token",
    });

    await manager.destroySession("session-1");
    expect(manager.getSession("session-1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: FAIL — `session.js` does not exist

- [ ] **Step 3: Implement session.ts**

```typescript
// packages/agent-service/src/session.ts
import Docker from "dockerode";
import {
  SESSION_IMAGE,
  SESSION_BRIDGE_PORT,
  SESSION_MEMORY_LIMIT,
  SESSION_CPU_LIMIT,
} from "@vibeweb/shared";
import path from "node:path";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export interface CreateSessionOpts {
  tenantId: string;
  sessionId: string;
  claudeMdContent: string;
  authToken: string;
}

export interface SessionInfo {
  sessionId: string;
  tenantId: string;
  containerId: string;
  bridgePort: number;
  startedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private tenantSessions = new Map<string, string>(); // tenantId → sessionId

  constructor(private tenantsDir: string) {}

  async createSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId, sessionId, claudeMdContent, authToken } = opts;

    // One session per tenant
    const existingSessionId = this.tenantSessions.get(tenantId);
    if (existingSessionId && this.sessions.has(existingSessionId)) {
      throw new Error(`Tenant ${tenantId} already has an active session`);
    }

    const previewDir = path.join(this.tenantsDir, tenantId, "preview");
    const dbDir = path.join(this.tenantsDir, tenantId, "db");

    const container = await docker.createContainer({
      Image: SESSION_IMAGE,
      Env: [
        `ANTHROPIC_API_KEY=${authToken}`,
        `BRIDGE_PORT=${SESSION_BRIDGE_PORT}`,
        `WORKSPACE=/workspace`,
      ],
      ExposedPorts: { [`${SESSION_BRIDGE_PORT}/tcp`]: {} },
      HostConfig: {
        Binds: [
          `${previewDir}:/workspace:rw`,
          `${dbDir}:/data/db:rw`,
        ],
        PortBindings: {
          [`${SESSION_BRIDGE_PORT}/tcp`]: [{ HostPort: "0" }], // random host port
        },
        Memory: parseMemoryLimit(SESSION_MEMORY_LIMIT),
        NanoCpus: SESSION_CPU_LIMIT * 1e9,
      },
      Labels: {
        "vibeweb.role": "agent-session",
        "vibeweb.tenant": tenantId,
        "vibeweb.session": sessionId,
      },
    });

    await container.start();

    // Get assigned host port
    const info = await container.inspect();
    const portBindings = info.NetworkSettings.Ports[`${SESSION_BRIDGE_PORT}/tcp`];
    const bridgePort = parseInt(portBindings[0].HostPort, 10);

    const session: SessionInfo = {
      sessionId,
      tenantId,
      containerId: container.id,
      bridgePort,
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.tenantSessions.set(tenantId, sessionId);

    return session;
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const container = docker.getContainer(session.containerId);
      await container.stop().catch(() => {});
      await container.remove().catch(() => {});
    } catch {
      // Container may already be gone
    }

    this.sessions.delete(sessionId);
    this.tenantSessions.delete(session.tenantId);
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByTenant(tenantId: string): SessionInfo | undefined {
    const sessionId = this.tenantSessions.get(tenantId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  async cleanupOrphanContainers(): Promise<void> {
    const containers = await docker.listContainers({
      filters: { label: ["vibeweb.role=agent-session"] },
    });

    for (const containerInfo of containers) {
      const container = docker.getContainer(containerInfo.Id);
      try {
        await container.stop();
        await container.remove();
      } catch {
        // ignore
      }
    }

    this.sessions.clear();
    this.tenantSessions.clear();
  }
}

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 512 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
  return num * (multipliers[unit] ?? 1);
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: all tests PASS (3 crypto + 2 claude-md + 3 session)

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/session.ts packages/agent-service/src/__tests__/session.test.ts
git commit -m "feat: add SessionManager for container lifecycle management"
```

---

### Task 7: WebSocket Proxy

**Files:**
- Create: `packages/agent-service/src/proxy.ts`
- Create: `packages/agent-service/src/__tests__/proxy.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/agent-service/src/__tests__/proxy.test.ts
import { describe, it, expect, vi } from "vitest";
import { SessionProxy } from "../proxy.js";

describe("SessionProxy", () => {
  it("forwards user messages to bridge", () => {
    const userWs = { send: vi.fn(), readyState: 1 } as any;
    const bridgeWs = { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn() } as any;

    const proxy = new SessionProxy("session-1", userWs, bridgeWs);
    proxy.sendToBridge({ type: "message", content: "hello" });

    expect(bridgeWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "message", content: "hello" })
    );
  });

  it("forwards bridge messages to user with sessionId", () => {
    const userWs = { send: vi.fn(), readyState: 1 } as any;
    const bridgeWs = { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn() } as any;

    const proxy = new SessionProxy("session-1", userWs, bridgeWs);
    proxy.handleBridgeMessage(JSON.stringify({ type: "stream", data: { text: "hi" } }));

    expect(userWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "stream", sessionId: "session-1", data: { text: "hi" } })
    );
  });

  it("tracks last activity time", () => {
    const userWs = { send: vi.fn(), readyState: 1 } as any;
    const bridgeWs = { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn() } as any;

    const proxy = new SessionProxy("session-1", userWs, bridgeWs);
    const before = proxy.lastActivityAt;

    // Small delay to ensure different timestamp
    proxy.sendToBridge({ type: "message", content: "test" });
    expect(proxy.lastActivityAt).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: FAIL — `proxy.js` does not exist

- [ ] **Step 3: Implement proxy.ts**

```typescript
// packages/agent-service/src/proxy.ts
import type { WebSocket } from "ws";

export class SessionProxy {
  public lastActivityAt: number;

  constructor(
    private sessionId: string,
    private userWs: WebSocket,
    private bridgeWs: WebSocket,
  ) {
    this.lastActivityAt = Date.now();
  }

  sendToBridge(msg: Record<string, unknown>): void {
    this.lastActivityAt = Date.now();
    if (this.bridgeWs.readyState === 1) {
      this.bridgeWs.send(JSON.stringify(msg));
    }
  }

  handleBridgeMessage(raw: string): void {
    this.lastActivityAt = Date.now();
    try {
      const msg = JSON.parse(raw);
      const enriched = { ...msg, sessionId: this.sessionId };
      if (this.userWs.readyState === 1) {
        this.userWs.send(JSON.stringify(enriched));
      }
    } catch {
      // Forward as-is if not JSON
      if (this.userWs.readyState === 1) {
        this.userWs.send(raw);
      }
    }
  }

  sendToUser(msg: Record<string, unknown>): void {
    const enriched = { ...msg, sessionId: this.sessionId };
    if (this.userWs.readyState === 1) {
      this.userWs.send(JSON.stringify(enriched));
    }
  }

  close(): void {
    if (this.bridgeWs.readyState === 1) {
      this.bridgeWs.close();
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/agent-service && node node_modules/vitest/vitest.mjs run`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/src/proxy.ts packages/agent-service/src/__tests__/proxy.test.ts
git commit -m "feat: add WebSocket proxy for user ↔ bridge communication"
```

---

### Task 8: Agent Service Entry Point

**Files:**
- Create: `packages/agent-service/src/index.ts`
- Create: `packages/agent-service/Dockerfile`

- [ ] **Step 1: Implement index.ts**

```typescript
// packages/agent-service/src/index.ts
import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  AGENT_SERVICE_PORT,
  SESSION_TIMEOUT_MS,
} from "@vibeweb/shared";
import type { WsMessage } from "@vibeweb/shared";
import { SessionManager } from "./session.js";
import { SessionProxy } from "./proxy.js";
import { generateClaudeMd } from "./claude-md.js";
import { decryptToken } from "./crypto.js";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");
const TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "";
const FALLBACK_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const app = Fastify({ logger: true });
const sessionManager = new SessionManager(tenantsDir);
const proxies = new Map<string, SessionProxy>();

app.get("/health", async () => ({ status: "ok" }));

const start = async () => {
  // Cleanup any orphan containers from previous runs
  await sessionManager.cleanupOrphanContainers();

  await app.listen({ port: AGENT_SERVICE_PORT, host: "0.0.0.0" });

  const server = app.server as http.Server;
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (userWs: WebSocket) => {
    app.log.info("User WebSocket connected");
    let currentSessionId: string | null = null;

    userWs.on("message", async (raw) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString());

        if (msg.type === "session.start") {
          await handleSessionStart(userWs, msg.tenantId!);
        } else if (msg.type === "message" && msg.sessionId) {
          handleUserMessage(msg.sessionId, msg);
        } else if (msg.type === "session.end" && msg.sessionId) {
          await handleSessionEnd(msg.sessionId, userWs);
        }

        if (msg.sessionId) currentSessionId = msg.sessionId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        app.log.error(`WebSocket error: ${message}`);
        userWs.send(JSON.stringify({ type: "error", error: message }));
      }
    });

    userWs.on("close", async () => {
      app.log.info("User WebSocket disconnected");
      if (currentSessionId) {
        const proxy = proxies.get(currentSessionId);
        if (proxy) proxy.close();
        proxies.delete(currentSessionId);
        await sessionManager.destroySession(currentSessionId);
      }
    });
  });

  // Timeout watchdog — check every minute
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, proxy] of proxies) {
      if (now - proxy.lastActivityAt > SESSION_TIMEOUT_MS) {
        app.log.info(`Session ${sessionId} timed out`);
        proxy.sendToUser({ type: "session.closed", reason: "timeout" });
        proxy.close();
        proxies.delete(sessionId);
        sessionManager.destroySession(sessionId);
      }
    }
  }, 60_000);

  app.log.info("Agent Service ready");
};

async function handleSessionStart(userWs: WebSocket, tenantId: string): Promise<void> {
  const sessionId = uuidv4();

  // Resolve auth token (OAuth or fallback)
  const authToken = resolveAuthToken(tenantId);
  if (!authToken) {
    userWs.send(JSON.stringify({
      type: "error",
      error: "No Claude authentication configured. Connect your Claude account first.",
    }));
    return;
  }

  // Generate CLAUDE.md
  const previewDir = path.join(tenantsDir, tenantId, "preview");
  const dbDir = path.join(tenantsDir, tenantId, "db");
  const claudeMd = generateClaudeMd(tenantId, previewDir, dbDir);

  // Write CLAUDE.md to preview dir so it's in the container's /workspace
  const fs = await import("node:fs");
  fs.writeFileSync(path.join(previewDir, "CLAUDE.md"), claudeMd);

  // Create session container
  const session = await sessionManager.createSession({
    tenantId,
    sessionId,
    claudeMdContent: claudeMd,
    authToken,
  });

  // Wait for bridge to be ready (retry connection)
  const bridgeUrl = `ws://localhost:${session.bridgePort}`;
  const bridgeWs = await connectWithRetry(bridgeUrl, 10, 500);

  // Create proxy
  const proxy = new SessionProxy(sessionId, userWs, bridgeWs);

  bridgeWs.on("message", (data: Buffer) => {
    proxy.handleBridgeMessage(data.toString());
  });

  bridgeWs.on("close", () => {
    app.log.info(`Bridge WebSocket closed for session ${sessionId}`);
  });

  proxies.set(sessionId, proxy);

  userWs.send(JSON.stringify({ type: "session.ready", sessionId }));
}

function handleUserMessage(sessionId: string, msg: WsMessage): void {
  const proxy = proxies.get(sessionId);
  if (!proxy) return;
  proxy.sendToBridge({ type: "message", content: msg.content });
}

async function handleSessionEnd(sessionId: string, userWs: WebSocket): Promise<void> {
  const proxy = proxies.get(sessionId);
  if (proxy) {
    proxy.sendToBridge({ type: "session.end" });
    proxy.close();
    proxies.delete(sessionId);
  }
  await sessionManager.destroySession(sessionId);
  userWs.send(JSON.stringify({ type: "session.closed", sessionId }));
}

function resolveAuthToken(tenantId: string): string | null {
  // TODO: In Task 9, this will look up encrypted OAuth token from DB
  // For now, use fallback API key
  if (FALLBACK_API_KEY) return FALLBACK_API_KEY;
  return null;
}

async function connectWithRetry(url: string, maxRetries: number, delayMs: number): Promise<WebSocket> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
      });
    } catch {
      if (i === maxRetries - 1) throw new Error(`Failed to connect to bridge at ${url}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Unreachable");
}

start();
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
# packages/agent-service/Dockerfile
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent-service/package.json packages/agent-service/

RUN pnpm install --filter @vibeweb/agent-service --prod --frozen-lockfile

COPY packages/shared/dist/ packages/shared/dist/
COPY packages/agent-service/dist/ packages/agent-service/dist/

WORKDIR /app/packages/agent-service

CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Verify build**

Run: `cd packages/shared && npx tsc && cd ../agent-service && npx tsc`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/src/index.ts packages/agent-service/Dockerfile
git commit -m "feat: add Agent Service entry point with WebSocket handling and session orchestration"
```

---

### Task 9: OAuth Routes in Control API

**Files:**
- Modify: `packages/control-api/src/db.ts`
- Create: `packages/control-api/src/routes/oauth.ts`
- Modify: `packages/control-api/src/index.ts`
- Create: `packages/control-api/src/__tests__/oauth.test.ts`

- [ ] **Step 1: Add OAuth columns and sessions table to db.ts**

Add to the `db.exec` call in `packages/control-api/src/db.ts`, after the deployments table:

```sql
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      container_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      last_activity_at TEXT NOT NULL
    );
```

Add these columns to the tenants table (use a migration-safe approach):

```typescript
// Add after db.exec(...) in createDb:
try {
  db.exec("ALTER TABLE tenants ADD COLUMN claude_oauth_token TEXT");
} catch { /* column already exists */ }
try {
  db.exec("ALTER TABLE tenants ADD COLUMN claude_token_expires_at TEXT");
} catch { /* column already exists */ }
```

Add new methods to the Db interface and implementation:

```typescript
// Add to Db interface:
setOAuthToken(tenantId: string, encryptedToken: string, expiresAt: string): void;
getOAuthToken(tenantId: string): { claude_oauth_token: string | null; claude_token_expires_at: string | null } | undefined;
clearOAuthToken(tenantId: string): void;
```

Add prepared statements:

```typescript
setOAuthToken: db.prepare("UPDATE tenants SET claude_oauth_token = ?, claude_token_expires_at = ?, updated_at = ? WHERE id = ?"),
getOAuthToken: db.prepare("SELECT claude_oauth_token, claude_token_expires_at FROM tenants WHERE id = ?"),
clearOAuthToken: db.prepare("UPDATE tenants SET claude_oauth_token = NULL, claude_token_expires_at = NULL, updated_at = ? WHERE id = ?"),
```

Add implementations:

```typescript
setOAuthToken(tenantId: string, encryptedToken: string, expiresAt: string): void {
  stmts.setOAuthToken.run(encryptedToken, expiresAt, new Date().toISOString(), tenantId);
},
getOAuthToken(tenantId: string): { claude_oauth_token: string | null; claude_token_expires_at: string | null } | undefined {
  return stmts.getOAuthToken.get(tenantId) as { claude_oauth_token: string | null; claude_token_expires_at: string | null } | undefined;
},
clearOAuthToken(tenantId: string): void {
  stmts.clearOAuthToken.run(new Date().toISOString(), tenantId);
},
```

- [ ] **Step 2: Write failing test for OAuth routes**

```typescript
// packages/control-api/src/__tests__/oauth.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDb, type Db } from "../db.js";
import { oauthRoutes } from "../routes/oauth.js";

describe("oauth routes", () => {
  let tmpDir: string;
  let db: Db;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-oauth-"));
    db = createDb(path.join(tmpDir, "test.db"));
    app = Fastify();
    app.register(oauthRoutes, { db, tokenEncryptionKey: "a".repeat(64) });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET /tenants/:id/auth/claude/status returns not_connected initially", async () => {
    const tenant = db.createTenant({ subdomain: "oauth-test", name: "OAuth Test" });
    const res = await app.inject({
      method: "GET",
      url: `/tenants/${tenant.id}/auth/claude/status`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().connected).toBe(false);
  });

  it("DELETE /tenants/:id/auth/claude clears token", async () => {
    const tenant = db.createTenant({ subdomain: "oauth-del", name: "Del" });
    db.setOAuthToken(tenant.id, "encrypted-token", "2026-12-31T00:00:00Z");

    const res = await app.inject({
      method: "DELETE",
      url: `/tenants/${tenant.id}/auth/claude`,
    });
    expect(res.statusCode).toBe(204);

    const token = db.getOAuthToken(tenant.id);
    expect(token?.claude_oauth_token).toBeNull();
  });
});
```

- [ ] **Step 3: Implement oauth.ts**

```typescript
// packages/control-api/src/routes/oauth.ts
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";

interface OAuthRoutesOpts {
  db: Db;
  tokenEncryptionKey: string;
}

export async function oauthRoutes(app: FastifyInstance, opts: OAuthRoutesOpts): Promise<void> {
  const { db } = opts;

  // Start OAuth flow — redirects to Claude OAuth page
  app.get<{ Params: { id: string } }>("/tenants/:id/auth/claude", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });

    // TODO: Implement actual Claude OAuth URL generation when OAuth provider details are available
    // For now, return the endpoint info
    return reply.status(501).send({
      error: "OAuth flow not yet implemented. Use ANTHROPIC_API_KEY environment variable as fallback.",
    });
  });

  // OAuth callback
  app.get<{ Params: { id: string }; Querystring: { code?: string } }>(
    "/tenants/:id/auth/claude/callback",
    async (req, reply) => {
      const tenant = db.getTenantById(req.params.id);
      if (!tenant) return reply.status(404).send({ error: "tenant not found" });

      const { code } = req.query;
      if (!code) return reply.status(400).send({ error: "missing authorization code" });

      // TODO: Exchange code for token when OAuth provider details are available
      return reply.status(501).send({ error: "OAuth token exchange not yet implemented" });
    },
  );

  // Check connection status
  app.get<{ Params: { id: string } }>("/tenants/:id/auth/claude/status", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });

    const tokenData = db.getOAuthToken(req.params.id);
    const connected = !!tokenData?.claude_oauth_token;
    const expiresAt = tokenData?.claude_token_expires_at ?? null;

    return { connected, expires_at: expiresAt };
  });

  // Disconnect Claude account
  app.delete<{ Params: { id: string } }>("/tenants/:id/auth/claude", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });

    db.clearOAuthToken(req.params.id);
    return reply.status(204).send();
  });
}
```

- [ ] **Step 4: Register OAuth routes in control-api index.ts**

Add to `packages/control-api/src/index.ts`:

```typescript
import { oauthRoutes } from "./routes/oauth.js";
```

And register it:

```typescript
app.register(oauthRoutes, { db, tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "" });
```

- [ ] **Step 5: Run tests**

Run: `cd packages/control-api && node node_modules/vitest/vitest.mjs run`
Expected: all tests PASS (previous 14 + 2 new oauth = 16)

- [ ] **Step 6: Commit**

```bash
git add packages/control-api/src/db.ts packages/control-api/src/routes/oauth.ts packages/control-api/src/index.ts packages/control-api/src/__tests__/oauth.test.ts
git commit -m "feat: add OAuth routes and session/token DB schema to Control API"
```

---

### Task 10: Docker Compose Update

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add agent-service to docker-compose.yml**

Add this service after `preview-server`:

```yaml
  agent-service:
    build:
      context: .
      dockerfile: packages/agent-service/Dockerfile
    environment:
      - DATA_DIR=/data
      - TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
    volumes:
      - tenant-data:/data/tenants
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "3003:3003"
    depends_on:
      - control-api
```

- [ ] **Step 2: Add agent-service route to Traefik dynamic.yml**

Add router in `configs/traefik/dynamic.yml`:

```yaml
    # Agent Service: subdomain + /agent/ws path
    agent-ws:
      rule: "HostRegexp(`{subdomain:[a-z0-9-]+}.vibeweb.localhost`) && PathPrefix(`/agent`)"
      service: agent-service
      entryPoints:
        - web
      middlewares:
        - tenant-auth
      priority: 90
```

Add service:

```yaml
    agent-service:
      loadBalancer:
        servers:
          - url: "http://agent-service:3003"
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml configs/traefik/dynamic.yml
git commit -m "feat: add agent-service to Docker Compose and Traefik routing"
```

---

### Task 11: Build & Integration Verification

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: all 5 packages compile without errors

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: all tests pass across all packages

- [ ] **Step 3: Build session image**

Run: `docker build -t vibeweb-session:latest session-image/`
Expected: image builds successfully

- [ ] **Step 4: Build all compose services**

Run: `docker compose build`
Expected: all 6 services build successfully

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix build issues for vibe editor backend integration"
```

---

### Task 12: Agent Service Smoke Test

**Files:**
- Create: `scripts/agent-smoke-test.sh`

- [ ] **Step 1: Write smoke test**

```bash
#!/usr/bin/env bash
# scripts/agent-smoke-test.sh
# Smoke test for the Agent Service (requires ANTHROPIC_API_KEY)
set -euo pipefail

API="http://localhost:1919"
AGENT="ws://localhost:3003/ws"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; exit 1; }

echo "=== Agent Service Smoke Test ==="
echo ""

# 1. Health check
echo "1. Agent Service health check..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3003/health")
[ "$STATUS" = "200" ] && pass "Agent Service is healthy" || fail "Agent health check (got $STATUS)"

# 2. Create a test tenant
echo "2. Creating test tenant..."
TENANT=$(curl -s -X POST "$API/tenants" \
  -H "Content-Type: application/json" \
  -d '{"subdomain":"agenttest","name":"Agent Test"}')
TENANT_ID=$(echo "$TENANT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
[ -n "$TENANT_ID" ] && pass "Tenant created: $TENANT_ID" || fail "Tenant creation"

# 3. Check OAuth status (should be not connected)
echo "3. Checking OAuth status..."
OAUTH=$(curl -s "$API/tenants/$TENANT_ID/auth/claude/status")
echo "$OAUTH" | grep -q '"connected":false' && pass "OAuth not connected (expected)" || fail "OAuth status"

echo ""
echo "=== Agent smoke test passed! ==="
echo ""
echo "To test a full session, ensure ANTHROPIC_API_KEY is set and use a WebSocket client:"
echo "  wscat -c $AGENT"
echo '  > {"type":"session.start","tenantId":"'"$TENANT_ID"'"}'

# Cleanup
curl -s -X DELETE "$API/tenants/$TENANT_ID" > /dev/null
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/agent-smoke-test.sh`

- [ ] **Step 3: Commit**

```bash
git add scripts/agent-smoke-test.sh
git commit -m "feat: add agent service smoke test script"
```
