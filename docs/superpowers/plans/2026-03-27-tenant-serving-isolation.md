# Tenant Site Serving & Isolation Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational multi-tenant infrastructure — subdomain routing, static site serving, isolated serverless function execution, live preview, and tenant lifecycle management — all running locally via Docker Compose.

**Architecture:** Gateway-centric. Traefik routes wildcard subdomains. Shared Nginx serves static files. Per-request Docker containers isolate serverless function execution. A WebSocket-based Preview Server enables live editing. A Control API manages tenant CRUD and deployment.

**Tech Stack:** TypeScript, Node.js 20, Fastify, SQLite (better-sqlite3), ws, chokidar, dockerode, Traefik v3, Nginx, pnpm monorepo, Docker Compose.

---

## File Map

```
vibeweb/
├── package.json                          # pnpm workspace root
├── pnpm-workspace.yaml                   # workspace config
├── tsconfig.base.json                    # shared TS config
├── docker-compose.yml                    # all 5 services
├── .gitignore
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types.ts                  # Tenant, Deployment, FunctionRequest/Response types
│   │       ├── constants.ts              # paths, limits, defaults
│   │       └── tenant-fs.ts              # filesystem helpers (init dirs, atomic copy, backup)
│   ├── control-api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts                  # Fastify server entry, port 1919
│   │       ├── db.ts                     # SQLite setup, migrations, queries
│   │       ├── routes/
│   │       │   ├── tenants.ts            # CRUD + deploy + rollback + status
│   │       │   └── auth.ts               # ForwardAuth endpoint
│   │       └── __tests__/
│   │           ├── db.test.ts
│   │           ├── tenants.test.ts
│   │           └── auth.test.ts
│   ├── function-runner/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts                  # Fastify server entry
│   │       ├── container.ts              # dockerode container lifecycle
│   │       ├── runner.ts                 # request → container → response orchestration
│   │       └── __tests__/
│   │           ├── container.test.ts
│   │           └── runner.test.ts
│   └── preview-server/
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       └── src/
│           ├── index.ts                  # HTTP + WebSocket server entry
│           ├── watcher.ts                # chokidar file watcher per tenant
│           ├── rooms.ts                  # WebSocket room management
│           ├── static.ts                 # preview static file serving
│           └── __tests__/
│               ├── watcher.test.ts
│               ├── rooms.test.ts
│               └── static.test.ts
├── configs/
│   ├── traefik/
│   │   ├── traefik.yml                   # static config (entrypoints, providers)
│   │   └── dynamic.yml                   # routers, services, middlewares
│   └── nginx/
│       └── nginx.conf                    # tenant-aware static serving
├── runner-image/
│   ├── Dockerfile                        # lightweight Node.js 20 Alpine image with better-sqlite3
│   └── entrypoint.js                     # loads function module, executes, writes stdout
└── data/
    └── tenants/                          # created at runtime
```

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/control-api/package.json`
- Create: `packages/control-api/tsconfig.json`
- Create: `packages/function-runner/package.json`
- Create: `packages/function-runner/tsconfig.json`
- Create: `packages/preview-server/package.json`
- Create: `packages/preview-server/tsconfig.json`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "vibeweb",
  "private": true,
  "scripts": {
    "build": "pnpm -r run build",
    "dev": "pnpm -r --parallel run dev",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
data/tenants/
*.db
.superpowers/
```

- [ ] **Step 5: Create packages/shared/package.json**

```json
{
  "name": "@vibeweb/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 6: Create packages/shared/tsconfig.json**

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

- [ ] **Step 7: Create packages/control-api/package.json**

```json
{
  "name": "@vibeweb/control-api",
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
    "better-sqlite3": "^11.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 8: Create packages/control-api/tsconfig.json**

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

- [ ] **Step 9: Create packages/function-runner/package.json**

```json
{
  "name": "@vibeweb/function-runner",
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
    "dockerode": "^4.0.0"
  },
  "devDependencies": {
    "@types/dockerode": "^3.3.0",
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 10: Create packages/function-runner/tsconfig.json**

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

- [ ] **Step 11: Create packages/preview-server/package.json**

```json
{
  "name": "@vibeweb/preview-server",
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
    "@fastify/static": "^8.0.0",
    "ws": "^8.0.0",
    "chokidar": "^4.0.0"
  },
  "devDependencies": {
    "@types/ws": "^8.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 12: Create packages/preview-server/tsconfig.json**

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

- [ ] **Step 13: Install dependencies**

Run: `pnpm install`
Expected: lockfile created, all packages linked

- [ ] **Step 14: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore packages/*/package.json packages/*/tsconfig.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with 4 packages"
```

---

### Task 2: Shared Types & Filesystem Helpers

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/tenant-fs.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/__tests__/tenant-fs.test.ts`

- [ ] **Step 1: Write types.ts**

```typescript
export interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  api_key: string;
  created_at: string;
  updated_at: string;
  status: "active" | "suspended" | "deleted";
}

export interface Deployment {
  id: string;
  tenant_id: string;
  deployed_at: string;
  backup_path: string | null;
}

export interface CreateTenantRequest {
  subdomain: string;
  name: string;
}

export interface FunctionRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

export interface FunctionResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
```

- [ ] **Step 2: Write constants.ts**

```typescript
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? "/data";
export const TENANTS_DIR = path.join(DATA_DIR, "tenants");

export const CONTROL_API_PORT = 1919;
export const FUNCTION_RUNNER_PORT = 3001;
export const PREVIEW_SERVER_PORT = 3002;

export const FUNCTION_TIMEOUT_MS = 10_000;
export const FUNCTION_MEMORY_LIMIT = "128m";
export const FUNCTION_CPU_LIMIT = 0.5;

export const RUNNER_IMAGE = "vibeweb-runner:node20";

export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const SUBDOMAIN_MAX_LENGTH = 63;
```

- [ ] **Step 3: Write failing test for tenant-fs**

```typescript
// packages/shared/src/__tests__/tenant-fs.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initTenantDir, getTenantPaths, atomicDeploy } from "../tenant-fs.js";

describe("tenant-fs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getTenantPaths", () => {
    it("returns correct paths for a tenant id", () => {
      const paths = getTenantPaths(tmpDir, "tenant-123");
      expect(paths.root).toBe(path.join(tmpDir, "tenant-123"));
      expect(paths.public).toBe(path.join(tmpDir, "tenant-123", "public"));
      expect(paths.functions).toBe(path.join(tmpDir, "tenant-123", "functions"));
      expect(paths.db).toBe(path.join(tmpDir, "tenant-123", "db"));
      expect(paths.preview).toBe(path.join(tmpDir, "tenant-123", "preview"));
      expect(paths.previewPublic).toBe(path.join(tmpDir, "tenant-123", "preview", "public"));
      expect(paths.previewFunctions).toBe(path.join(tmpDir, "tenant-123", "preview", "functions"));
    });
  });

  describe("initTenantDir", () => {
    it("creates full directory structure with default index.html", () => {
      const paths = getTenantPaths(tmpDir, "tenant-abc");
      initTenantDir(paths);

      expect(fs.existsSync(paths.public)).toBe(true);
      expect(fs.existsSync(paths.functions)).toBe(true);
      expect(fs.existsSync(paths.previewPublic)).toBe(true);
      expect(fs.existsSync(paths.previewFunctions)).toBe(true);
      expect(fs.existsSync(paths.db)).toBe(true);
      expect(fs.existsSync(path.join(paths.db, "tenant.db"))).toBe(true);
      expect(fs.existsSync(path.join(paths.functions, "api"))).toBe(true);

      const indexHtml = fs.readFileSync(path.join(paths.public, "index.html"), "utf-8");
      expect(indexHtml).toContain("<!DOCTYPE html>");
    });
  });

  describe("atomicDeploy", () => {
    it("copies preview to public and creates backup", () => {
      const paths = getTenantPaths(tmpDir, "tenant-deploy");
      initTenantDir(paths);

      // Put something in public (will be backed up)
      fs.writeFileSync(path.join(paths.public, "index.html"), "<h1>Old</h1>");

      // Put new content in preview
      fs.writeFileSync(path.join(paths.previewPublic, "index.html"), "<h1>New</h1>");
      fs.mkdirSync(path.join(paths.previewFunctions, "api"), { recursive: true });
      fs.writeFileSync(path.join(paths.previewFunctions, "api", "test.js"), "export default async () => ({})");

      const backupPath = atomicDeploy(paths);

      // New content is now in public
      const deployed = fs.readFileSync(path.join(paths.public, "index.html"), "utf-8");
      expect(deployed).toBe("<h1>New</h1>");

      // Function was deployed
      const fn = fs.readFileSync(path.join(paths.functions, "api", "test.js"), "utf-8");
      expect(fn).toContain("export default");

      // Backup exists
      expect(backupPath).toBeTruthy();
      expect(fs.existsSync(backupPath!)).toBe(true);
      const backed = fs.readFileSync(path.join(backupPath!, "public", "index.html"), "utf-8");
      expect(backed).toBe("<h1>Old</h1>");
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/shared && npx vitest run`
Expected: FAIL — `tenant-fs.js` does not exist

- [ ] **Step 5: Implement tenant-fs.ts**

```typescript
// packages/shared/src/tenant-fs.ts
import fs from "node:fs";
import path from "node:path";

export interface TenantPaths {
  root: string;
  public: string;
  functions: string;
  db: string;
  preview: string;
  previewPublic: string;
  previewFunctions: string;
}

export function getTenantPaths(baseDir: string, tenantId: string): TenantPaths {
  const root = path.join(baseDir, tenantId);
  return {
    root,
    public: path.join(root, "public"),
    functions: path.join(root, "functions"),
    db: path.join(root, "db"),
    preview: path.join(root, "preview"),
    previewPublic: path.join(root, "preview", "public"),
    previewFunctions: path.join(root, "preview", "functions"),
  };
}

const DEFAULT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Site</title>
</head>
<body>
  <h1>Welcome to your site!</h1>
  <p>Start editing to make it yours.</p>
</body>
</html>`;

export function initTenantDir(paths: TenantPaths): void {
  fs.mkdirSync(paths.public, { recursive: true });
  fs.mkdirSync(path.join(paths.functions, "api"), { recursive: true });
  fs.mkdirSync(paths.db, { recursive: true });
  fs.mkdirSync(paths.previewPublic, { recursive: true });
  fs.mkdirSync(paths.previewFunctions, { recursive: true });
  fs.writeFileSync(path.join(paths.public, "index.html"), DEFAULT_INDEX_HTML);

  // Initialize empty tenant SQLite database
  const dbPath = path.join(paths.db, "tenant.db");
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, "");
  }
}

export function atomicDeploy(paths: TenantPaths): string | null {
  let backupPath: string | null = null;

  // Backup current public + functions if they have content
  if (fs.existsSync(paths.public) && fs.readdirSync(paths.public).length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = path.join(paths.root, `backup-${timestamp}`);
    fs.mkdirSync(path.join(backupPath, "public"), { recursive: true });
    fs.mkdirSync(path.join(backupPath, "functions"), { recursive: true });
    copyDirSync(paths.public, path.join(backupPath, "public"));
    copyDirSync(paths.functions, path.join(backupPath, "functions"));
  }

  // Copy preview → public/functions
  if (fs.existsSync(paths.previewPublic)) {
    clearDirSync(paths.public);
    copyDirSync(paths.previewPublic, paths.public);
  }
  if (fs.existsSync(paths.previewFunctions)) {
    clearDirSync(paths.functions);
    copyDirSync(paths.previewFunctions, paths.functions);
  }

  return backupPath;
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function clearDirSync(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(entryPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(entryPath);
    }
  }
}
```

- [ ] **Step 6: Write index.ts barrel export**

```typescript
// packages/shared/src/index.ts
export * from "./types.js";
export * from "./constants.js";
export * from "./tenant-fs.js";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run`
Expected: 3 tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared types, constants, and tenant filesystem helpers"
```

---

### Task 3: Control API — Database Layer

**Files:**
- Create: `packages/control-api/src/db.ts`
- Create: `packages/control-api/src/__tests__/db.test.ts`

- [ ] **Step 1: Write failing test for db**

```typescript
// packages/control-api/src/__tests__/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDb, type Db } from "../db.js";

describe("db", () => {
  let tmpDir: string;
  let db: Db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-db-"));
    db = createDb(path.join(tmpDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("tenants", () => {
    it("creates and retrieves a tenant", () => {
      const tenant = db.createTenant({ subdomain: "alice", name: "Alice Site" });
      expect(tenant.subdomain).toBe("alice");
      expect(tenant.name).toBe("Alice Site");
      expect(tenant.status).toBe("active");
      expect(tenant.api_key).toBeTruthy();

      const found = db.getTenantById(tenant.id);
      expect(found).toEqual(tenant);
    });

    it("finds tenant by subdomain", () => {
      const tenant = db.createTenant({ subdomain: "bob", name: "Bob Site" });
      const found = db.getTenantBySubdomain("bob");
      expect(found?.id).toBe(tenant.id);
    });

    it("rejects duplicate subdomains", () => {
      db.createTenant({ subdomain: "dupe", name: "First" });
      expect(() => db.createTenant({ subdomain: "dupe", name: "Second" })).toThrow();
    });

    it("deletes a tenant (soft delete)", () => {
      const tenant = db.createTenant({ subdomain: "del", name: "Delete Me" });
      db.deleteTenant(tenant.id);
      const found = db.getTenantById(tenant.id);
      expect(found?.status).toBe("deleted");
    });
  });

  describe("deployments", () => {
    it("records a deployment", () => {
      const tenant = db.createTenant({ subdomain: "dep", name: "Deploy Test" });
      const deployment = db.recordDeployment(tenant.id, "/backup/path");
      expect(deployment.tenant_id).toBe(tenant.id);
      expect(deployment.backup_path).toBe("/backup/path");

      const latest = db.getLatestDeployment(tenant.id);
      expect(latest?.id).toBe(deployment.id);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/control-api && npx vitest run`
Expected: FAIL — `db.js` does not exist

- [ ] **Step 3: Implement db.ts**

```typescript
// packages/control-api/src/db.ts
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";
import type { Tenant, Deployment, CreateTenantRequest } from "@vibeweb/shared";

export interface Db {
  createTenant(req: CreateTenantRequest): Tenant;
  getTenantById(id: string): Tenant | undefined;
  getTenantBySubdomain(subdomain: string): Tenant | undefined;
  deleteTenant(id: string): void;
  recordDeployment(tenantId: string, backupPath: string | null): Deployment;
  getLatestDeployment(tenantId: string): Deployment | undefined;
  close(): void;
}

export function createDb(dbPath: string): Db {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      subdomain TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      deployed_at TEXT NOT NULL,
      backup_path TEXT
    );
  `);

  const stmts = {
    insertTenant: db.prepare(
      `INSERT INTO tenants (id, subdomain, name, api_key, created_at, updated_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`
    ),
    getTenantById: db.prepare("SELECT * FROM tenants WHERE id = ?"),
    getTenantBySubdomain: db.prepare("SELECT * FROM tenants WHERE subdomain = ? AND status != 'deleted'"),
    deleteTenant: db.prepare("UPDATE tenants SET status = 'deleted', updated_at = ? WHERE id = ?"),
    insertDeployment: db.prepare(
      "INSERT INTO deployments (id, tenant_id, deployed_at, backup_path) VALUES (?, ?, ?, ?)"
    ),
    getLatestDeployment: db.prepare(
      "SELECT * FROM deployments WHERE tenant_id = ? ORDER BY deployed_at DESC LIMIT 1"
    ),
  };

  return {
    createTenant(req: CreateTenantRequest): Tenant {
      const id = uuidv4();
      const api_key = crypto.randomBytes(32).toString("hex");
      const now = new Date().toISOString();
      stmts.insertTenant.run(id, req.subdomain, req.name, api_key, now, now);
      return { id, subdomain: req.subdomain, name: req.name, api_key, created_at: now, updated_at: now, status: "active" };
    },
    getTenantById(id: string): Tenant | undefined {
      return stmts.getTenantById.get(id) as Tenant | undefined;
    },
    getTenantBySubdomain(subdomain: string): Tenant | undefined {
      return stmts.getTenantBySubdomain.get(subdomain) as Tenant | undefined;
    },
    deleteTenant(id: string): void {
      stmts.deleteTenant.run(new Date().toISOString(), id);
    },
    recordDeployment(tenantId: string, backupPath: string | null): Deployment {
      const id = uuidv4();
      const now = new Date().toISOString();
      stmts.insertDeployment.run(id, tenantId, now, backupPath);
      return { id, tenant_id: tenantId, deployed_at: now, backup_path: backupPath };
    },
    getLatestDeployment(tenantId: string): Deployment | undefined {
      return stmts.getLatestDeployment.get(tenantId) as Deployment | undefined;
    },
    close(): void {
      db.close();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/control-api && npx vitest run`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/control-api/src/db.ts packages/control-api/src/__tests__/db.test.ts
git commit -m "feat: add SQLite database layer for tenant and deployment management"
```

---

### Task 4: Control API — Routes

**Files:**
- Create: `packages/control-api/src/routes/tenants.ts`
- Create: `packages/control-api/src/routes/auth.ts`
- Create: `packages/control-api/src/index.ts`
- Create: `packages/control-api/src/__tests__/tenants.test.ts`
- Create: `packages/control-api/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing test for tenant routes**

```typescript
// packages/control-api/src/__tests__/tenants.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDb, type Db } from "../db.js";
import { tenantRoutes } from "../routes/tenants.js";

describe("tenant routes", () => {
  let tmpDir: string;
  let db: Db;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-routes-"));
    db = createDb(path.join(tmpDir, "test.db"));
    const tenantsDir = path.join(tmpDir, "tenants");
    fs.mkdirSync(tenantsDir, { recursive: true });

    app = Fastify();
    app.register(tenantRoutes, { db, tenantsDir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("POST /tenants creates a tenant", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { subdomain: "alice", name: "Alice Site" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.subdomain).toBe("alice");
    expect(body.api_key).toBeTruthy();

    // Verify directory was created
    expect(fs.existsSync(path.join(tmpDir, "tenants", body.id, "public", "index.html"))).toBe(true);
  });

  it("POST /tenants rejects invalid subdomain", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { subdomain: "INVALID!", name: "Bad" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /tenants/:id returns tenant", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { subdomain: "bob", name: "Bob Site" },
    });
    const tenant = create.json();

    const res = await app.inject({ method: "GET", url: `/tenants/${tenant.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().subdomain).toBe("bob");
  });

  it("GET /tenants/:id returns 404 for missing tenant", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /tenants/:id soft-deletes tenant", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { subdomain: "del", name: "Del" },
    });
    const tenant = create.json();

    const res = await app.inject({ method: "DELETE", url: `/tenants/${tenant.id}` });
    expect(res.statusCode).toBe(204);

    const get = await app.inject({ method: "GET", url: `/tenants/${tenant.id}` });
    expect(get.json().status).toBe("deleted");
  });

  it("POST /tenants/:id/deploy copies preview to public", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/tenants",
      payload: { subdomain: "deploy", name: "Deploy Test" },
    });
    const tenant = create.json();

    // Write to preview
    const previewPublic = path.join(tmpDir, "tenants", tenant.id, "preview", "public");
    fs.writeFileSync(path.join(previewPublic, "index.html"), "<h1>Deployed!</h1>");

    const res = await app.inject({ method: "POST", url: `/tenants/${tenant.id}/deploy` });
    expect(res.statusCode).toBe(200);

    const deployed = fs.readFileSync(
      path.join(tmpDir, "tenants", tenant.id, "public", "index.html"),
      "utf-8"
    );
    expect(deployed).toBe("<h1>Deployed!</h1>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/control-api && npx vitest run`
Expected: FAIL — `routes/tenants.js` does not exist

- [ ] **Step 3: Implement tenants.ts routes**

```typescript
// packages/control-api/src/routes/tenants.ts
import type { FastifyInstance } from "fastify";
import {
  SUBDOMAIN_REGEX,
  SUBDOMAIN_MAX_LENGTH,
  getTenantPaths,
  initTenantDir,
  atomicDeploy,
} from "@vibeweb/shared";
import type { Db } from "../db.js";

interface TenantRoutesOpts {
  db: Db;
  tenantsDir: string;
}

export async function tenantRoutes(app: FastifyInstance, opts: TenantRoutesOpts): Promise<void> {
  const { db, tenantsDir } = opts;

  app.post<{ Body: { subdomain: string; name: string } }>("/tenants", async (req, reply) => {
    const { subdomain, name } = req.body;

    if (!subdomain || !name) {
      return reply.status(400).send({ error: "subdomain and name are required" });
    }
    if (!SUBDOMAIN_REGEX.test(subdomain) || subdomain.length > SUBDOMAIN_MAX_LENGTH) {
      return reply.status(400).send({ error: "invalid subdomain format" });
    }

    const existing = db.getTenantBySubdomain(subdomain);
    if (existing) {
      return reply.status(409).send({ error: "subdomain already taken" });
    }

    const tenant = db.createTenant({ subdomain, name });
    const paths = getTenantPaths(tenantsDir, tenant.id);
    initTenantDir(paths);

    return reply.status(201).send(tenant);
  });

  app.get<{ Params: { id: string } }>("/tenants/:id", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: "tenant not found" });
    }
    return tenant;
  });

  app.delete<{ Params: { id: string } }>("/tenants/:id", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: "tenant not found" });
    }
    db.deleteTenant(req.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/tenants/:id/deploy", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant || tenant.status !== "active") {
      return reply.status(404).send({ error: "tenant not found" });
    }

    const paths = getTenantPaths(tenantsDir, tenant.id);
    const backupPath = atomicDeploy(paths);
    const deployment = db.recordDeployment(tenant.id, backupPath);

    return { deployment };
  });

  app.post<{ Params: { id: string } }>("/tenants/:id/rollback", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant || tenant.status !== "active") {
      return reply.status(404).send({ error: "tenant not found" });
    }

    const latest = db.getLatestDeployment(tenant.id);
    if (!latest?.backup_path) {
      return reply.status(400).send({ error: "no backup available" });
    }

    const paths = getTenantPaths(tenantsDir, tenant.id);
    const fs = await import("node:fs");
    const path = await import("node:path");

    // Restore backup to public
    const backupPublic = path.join(latest.backup_path, "public");
    const backupFunctions = path.join(latest.backup_path, "functions");

    if (fs.existsSync(backupPublic)) {
      fs.rmSync(paths.public, { recursive: true, force: true });
      fs.cpSync(backupPublic, paths.public, { recursive: true });
    }
    if (fs.existsSync(backupFunctions)) {
      fs.rmSync(paths.functions, { recursive: true, force: true });
      fs.cpSync(backupFunctions, paths.functions, { recursive: true });
    }

    return { message: "rolled back", backup_used: latest.backup_path };
  });

  app.get<{ Params: { id: string } }>("/tenants/:id/status", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: "tenant not found" });
    }

    const latest = db.getLatestDeployment(tenant.id);
    const paths = getTenantPaths(tenantsDir, tenant.id);
    const fs = await import("node:fs");

    const hasPreview = fs.existsSync(paths.previewPublic) &&
      fs.readdirSync(paths.previewPublic).length > 0;

    return {
      tenant_id: tenant.id,
      subdomain: tenant.subdomain,
      status: tenant.status,
      last_deployment: latest?.deployed_at ?? null,
      has_preview: hasPreview,
    };
  });
}
```

- [ ] **Step 4: Write failing test for auth route**

```typescript
// packages/control-api/src/__tests__/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDb, type Db } from "../db.js";
import { authRoutes } from "../routes/auth.js";

describe("auth routes", () => {
  let tmpDir: string;
  let db: Db;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-auth-"));
    db = createDb(path.join(tmpDir, "test.db"));
    app = Fastify();
    app.register(authRoutes, { db });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 200 with X-Tenant-Id for valid subdomain", async () => {
    const tenant = db.createTenant({ subdomain: "valid", name: "Valid" });

    const res = await app.inject({
      method: "GET",
      url: "/auth/validate",
      headers: { "x-forwarded-host": "valid.vibeweb.localhost" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-tenant-id"]).toBe(tenant.id);
  });

  it("returns 404 for unknown subdomain", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/validate",
      headers: { "x-forwarded-host": "unknown.vibeweb.localhost" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for bare domain (no subdomain)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/validate",
      headers: { "x-forwarded-host": "vibeweb.localhost" },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 5: Implement auth.ts**

```typescript
// packages/control-api/src/routes/auth.ts
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";

interface AuthRoutesOpts {
  db: Db;
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOpts): Promise<void> {
  const { db } = opts;

  app.get("/auth/validate", async (req, reply) => {
    const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
    if (!forwardedHost) {
      return reply.status(400).send({ error: "missing x-forwarded-host header" });
    }

    // Extract subdomain from "alice.vibeweb.localhost"
    const parts = forwardedHost.split(".");
    if (parts.length < 3) {
      // Bare domain like "vibeweb.localhost" — no subdomain
      return reply.status(404).send({ error: "no subdomain" });
    }

    const subdomain = parts[0];
    const tenant = db.getTenantBySubdomain(subdomain);
    if (!tenant) {
      return reply.status(404).send({ error: "tenant not found" });
    }

    reply.header("x-tenant-id", tenant.id);
    return reply.status(200).send({ ok: true });
  });
}
```

- [ ] **Step 6: Implement index.ts (server entry)**

```typescript
// packages/control-api/src/index.ts
import Fastify from "fastify";
import path from "node:path";
import fs from "node:fs";
import { CONTROL_API_PORT, TENANTS_DIR } from "@vibeweb/shared";
import { createDb } from "./db.js";
import { tenantRoutes } from "./routes/tenants.js";
import { authRoutes } from "./routes/auth.js";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");
const dbPath = path.join(DATA_DIR, "vibeweb.db");

fs.mkdirSync(tenantsDir, { recursive: true });

const db = createDb(dbPath);
const app = Fastify({ logger: true });

app.register(tenantRoutes, { db, tenantsDir });
app.register(authRoutes, { db });

app.get("/health", async () => ({ status: "ok" }));

const start = async () => {
  try {
    await app.listen({ port: CONTROL_API_PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

- [ ] **Step 7: Run all tests**

Run: `cd packages/control-api && npx vitest run`
Expected: 8 tests PASS (5 tenant routes + 3 auth)

- [ ] **Step 8: Commit**

```bash
git add packages/control-api/src/
git commit -m "feat: add Control API with tenant CRUD, deploy, rollback, and ForwardAuth"
```

---

### Task 5: Function Runner Image

**Files:**
- Create: `runner-image/Dockerfile`
- Create: `runner-image/entrypoint.js`

- [ ] **Step 1: Create runner Dockerfile**

```dockerfile
# runner-image/Dockerfile
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Pre-install better-sqlite3 so tenant functions can use it
RUN npm install better-sqlite3@11 && rm -rf /root/.npm

# Non-root user for security
RUN adduser -D -u 1001 runner
USER runner

COPY --chown=runner:runner entrypoint.js /usr/local/bin/entrypoint.js

ENTRYPOINT ["node", "/usr/local/bin/entrypoint.js"]
```

- [ ] **Step 2: Create entrypoint.js**

```javascript
// runner-image/entrypoint.js
// Runs inside the isolated container. Loads the target function module,
// executes it with the request from env vars, writes response to stdout.

const path = require("node:path");

async function main() {
  const fnPath = process.env.FUNCTION_PATH;
  if (!fnPath) {
    writeResponse({ status: 500, headers: {}, body: { error: "FUNCTION_PATH not set" } });
    return;
  }

  const fullPath = path.join("/app", fnPath);

  let handler;
  try {
    const mod = await import(fullPath);
    handler = mod.default ?? mod;
  } catch (err) {
    writeResponse({ status: 500, headers: {}, body: { error: `Failed to load function: ${err.message}` } });
    return;
  }

  if (typeof handler !== "function") {
    writeResponse({ status: 500, headers: {}, body: { error: "Module does not export a function" } });
    return;
  }

  const req = {
    method: process.env.REQ_METHOD ?? "GET",
    path: process.env.REQ_PATH ?? "/",
    query: JSON.parse(process.env.REQ_QUERY ?? "{}"),
    headers: JSON.parse(process.env.REQ_HEADERS ?? "{}"),
    body: process.env.REQ_BODY ?? "",
  };

  try {
    const result = await handler(req);
    writeResponse({
      status: result.status ?? 200,
      headers: result.headers ?? {},
      body: result.body ?? null,
    });
  } catch (err) {
    writeResponse({ status: 500, headers: {}, body: { error: `Function error: ${err.message}` } });
  }
}

function writeResponse(res) {
  // Write JSON to stdout — the Function Runner reads this
  process.stdout.write(JSON.stringify(res) + "\n");
}

main();
```

- [ ] **Step 3: Build the runner image**

Run: `docker build -t vibeweb-runner:node20 runner-image/`
Expected: Image built successfully

- [ ] **Step 4: Test the runner image manually**

Run:
```bash
mkdir -p /tmp/test-fn/api
echo 'export default async (req) => ({ status: 200, body: { hello: "world" } })' > /tmp/test-fn/api/hello.js
docker run --rm -v /tmp/test-fn:/app:ro -e FUNCTION_PATH=api/hello.js vibeweb-runner:node20
```
Expected: `{"status":200,"headers":{},"body":{"hello":"world"}}`

- [ ] **Step 5: Commit**

```bash
git add runner-image/
git commit -m "feat: add isolated function runner Docker image"
```

---

### Task 6: Function Runner Service

**Files:**
- Create: `packages/function-runner/src/container.ts`
- Create: `packages/function-runner/src/runner.ts`
- Create: `packages/function-runner/src/index.ts`
- Create: `packages/function-runner/src/__tests__/runner.test.ts`
- Create: `packages/function-runner/Dockerfile`

- [ ] **Step 1: Write container.ts (Docker API wrapper)**

```typescript
// packages/function-runner/src/container.ts
import Docker from "dockerode";
import {
  RUNNER_IMAGE,
  FUNCTION_TIMEOUT_MS,
  FUNCTION_MEMORY_LIMIT,
  FUNCTION_CPU_LIMIT,
} from "@vibeweb/shared";
import type { FunctionRequest, FunctionResponse } from "@vibeweb/shared";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export interface RunFunctionOpts {
  tenantId: string;
  functionPath: string;
  functionsDir: string;
  dbDir: string;
  request: FunctionRequest;
}

export async function runInContainer(opts: RunFunctionOpts): Promise<FunctionResponse> {
  const { tenantId, functionPath, functionsDir, dbDir, request } = opts;

  const container = await docker.createContainer({
    Image: RUNNER_IMAGE,
    Env: [
      `FUNCTION_PATH=${functionPath}`,
      `REQ_METHOD=${request.method}`,
      `REQ_PATH=${request.path}`,
      `REQ_QUERY=${JSON.stringify(request.query)}`,
      `REQ_HEADERS=${JSON.stringify(request.headers)}`,
      `REQ_BODY=${request.body}`,
    ],
    HostConfig: {
      Binds: [`${functionsDir}:/app:ro`, `${dbDir}:/data/db:rw`],
      Memory: parseMemoryLimit(FUNCTION_MEMORY_LIMIT),
      NanoCpus: FUNCTION_CPU_LIMIT * 1e9,
      NetworkMode: "none",
      AutoRemove: true,
      ReadonlyRootfs: false, // db/ needs write access; rootfs is still safe since only db/ is rw-mounted
    },
    Labels: {
      "vibeweb.tenant": tenantId,
      "vibeweb.role": "function-runner",
    },
  });

  await container.start();

  // Wait for completion with timeout
  const result = await Promise.race([
    waitForContainer(container),
    timeout(FUNCTION_TIMEOUT_MS, container),
  ]);

  return result;
}

async function waitForContainer(container: Docker.Container): Promise<FunctionResponse> {
  await container.wait();

  const logs = await container.logs({ stdout: true, stderr: true });
  const output = logs.toString("utf-8").trim();

  // Docker multiplexed stream headers are 8 bytes per frame — strip them
  const lines = output.split("\n");
  const lastLine = lines[lines.length - 1];

  // Try to find valid JSON in the output (skip stream header bytes)
  const jsonMatch = lastLine.match(/\{.*\}/);
  if (!jsonMatch) {
    return { status: 500, headers: {}, body: { error: "No response from function" } };
  }

  try {
    return JSON.parse(jsonMatch[0]) as FunctionResponse;
  } catch {
    return { status: 500, headers: {}, body: { error: "Invalid response from function" } };
  }
}

async function timeout(ms: number, container: Docker.Container): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(async () => {
      try {
        await container.kill();
      } catch {
        // Container may have already exited
      }
      reject(new Error("Function execution timed out"));
    }, ms);
  });
}

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 128 * 1024 * 1024; // default 128MB
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
  return num * (multipliers[unit] ?? 1);
}
```

- [ ] **Step 2: Write runner.ts (request orchestration)**

```typescript
// packages/function-runner/src/runner.ts
import path from "node:path";
import fs from "node:fs";
import { TENANTS_DIR } from "@vibeweb/shared";
import type { FunctionRequest, FunctionResponse } from "@vibeweb/shared";
import { runInContainer } from "./container.js";

export async function handleFunctionRequest(
  tenantId: string,
  apiPath: string,
  request: FunctionRequest,
  tenantsDir: string,
): Promise<FunctionResponse> {
  // Resolve function file path
  const functionPath = `api/${apiPath}.js`;
  const functionsDir = path.join(tenantsDir, tenantId, "functions");
  const dbDir = path.join(tenantsDir, tenantId, "db");
  const fullPath = path.join(functionsDir, functionPath);

  // Validate path doesn't escape functions directory
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(functionsDir))) {
    return { status: 403, headers: {}, body: { error: "Forbidden" } };
  }

  // Check function exists
  if (!fs.existsSync(fullPath)) {
    return { status: 404, headers: {}, body: { error: `Function not found: ${apiPath}` } };
  }

  try {
    return await runInContainer({
      tenantId,
      functionPath,
      functionsDir,
      dbDir,
      request,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("timed out")) {
      return { status: 504, headers: {}, body: { error: "Function execution timed out" } };
    }
    return { status: 500, headers: {}, body: { error: message } };
  }
}
```

- [ ] **Step 3: Write index.ts (server entry)**

```typescript
// packages/function-runner/src/index.ts
import Fastify from "fastify";
import path from "node:path";
import { FUNCTION_RUNNER_PORT } from "@vibeweb/shared";
import { handleFunctionRequest } from "./runner.js";
import type { FunctionRequest } from "@vibeweb/shared";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");

const app = Fastify({ logger: true });

app.all<{ Params: { "*": string } }>("/api/*", async (req, reply) => {
  const tenantId = req.headers["x-tenant-id"] as string | undefined;
  if (!tenantId) {
    return reply.status(400).send({ error: "missing x-tenant-id header" });
  }

  const apiPath = req.params["*"];
  const fnRequest: FunctionRequest = {
    method: req.method,
    path: req.url,
    query: req.query as Record<string, string>,
    headers: req.headers as Record<string, string>,
    body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""),
  };

  const result = await handleFunctionRequest(tenantId, apiPath, fnRequest, tenantsDir);

  reply.status(result.status);
  for (const [key, value] of Object.entries(result.headers)) {
    reply.header(key, value);
  }
  return result.body;
});

app.get("/health", async () => ({ status: "ok" }));

const start = async () => {
  try {
    await app.listen({ port: FUNCTION_RUNNER_PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

- [ ] **Step 4: Write Dockerfile for function-runner**

```dockerfile
# packages/function-runner/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY dist/ ./dist/

CMD ["node", "dist/index.js"]
```

- [ ] **Step 5: Write integration test (mocked Docker)**

```typescript
// packages/function-runner/src/__tests__/runner.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleFunctionRequest } from "../runner.js";
import type { FunctionRequest } from "@vibeweb/shared";

describe("runner", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-runner-"));
    // Create a tenant with a function
    const fnDir = path.join(tmpDir, "test-tenant", "functions", "api");
    fs.mkdirSync(fnDir, { recursive: true });
    fs.writeFileSync(
      path.join(fnDir, "hello.js"),
      'export default async (req) => ({ status: 200, body: { msg: "hi" } })'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseReq: FunctionRequest = {
    method: "GET",
    path: "/api/hello",
    query: {},
    headers: {},
    body: "",
  };

  it("returns 404 for nonexistent function", async () => {
    const result = await handleFunctionRequest("test-tenant", "nonexistent", baseReq, tmpDir);
    expect(result.status).toBe(404);
  });

  it("returns 403 for path traversal attempt", async () => {
    const result = await handleFunctionRequest("test-tenant", "../../etc/passwd", baseReq, tmpDir);
    expect(result.status).toBe(403);
  });

  // NOTE: Full container integration test requires Docker running.
  // Run manually: cd packages/function-runner && npx vitest run --reporter=verbose
  // The container test below only runs when DOCKER_TEST=1 is set.
  it.skipIf(!process.env.DOCKER_TEST)("executes function in container", async () => {
    const result = await handleFunctionRequest("test-tenant", "hello", baseReq, tmpDir);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ msg: "hi" });
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd packages/function-runner && npx vitest run`
Expected: 2 tests PASS (path traversal + 404), 1 skipped (Docker)

- [ ] **Step 7: Commit**

```bash
git add packages/function-runner/
git commit -m "feat: add Function Runner service with container isolation"
```

---

### Task 7: Preview Server

**Files:**
- Create: `packages/preview-server/src/rooms.ts`
- Create: `packages/preview-server/src/watcher.ts`
- Create: `packages/preview-server/src/static.ts`
- Create: `packages/preview-server/src/index.ts`
- Create: `packages/preview-server/src/__tests__/rooms.test.ts`
- Create: `packages/preview-server/src/__tests__/static.test.ts`
- Create: `packages/preview-server/Dockerfile`

- [ ] **Step 1: Write failing test for rooms**

```typescript
// packages/preview-server/src/__tests__/rooms.test.ts
import { describe, it, expect, vi } from "vitest";
import { RoomManager } from "../rooms.js";

describe("RoomManager", () => {
  it("adds and removes connections by tenant", () => {
    const manager = new RoomManager();
    const mockWs1 = { send: vi.fn(), readyState: 1 } as any;
    const mockWs2 = { send: vi.fn(), readyState: 1 } as any;

    manager.join("tenant-a", mockWs1);
    manager.join("tenant-a", mockWs2);
    expect(manager.getConnections("tenant-a")).toHaveLength(2);

    manager.leave("tenant-a", mockWs1);
    expect(manager.getConnections("tenant-a")).toHaveLength(1);
  });

  it("broadcasts only to the specified tenant", () => {
    const manager = new RoomManager();
    const wsA = { send: vi.fn(), readyState: 1 } as any;
    const wsB = { send: vi.fn(), readyState: 1 } as any;

    manager.join("tenant-a", wsA);
    manager.join("tenant-b", wsB);

    manager.broadcast("tenant-a", JSON.stringify({ type: "reload", path: "/index.html" }));

    expect(wsA.send).toHaveBeenCalledOnce();
    expect(wsB.send).not.toHaveBeenCalled();
  });

  it("skips closed connections during broadcast", () => {
    const manager = new RoomManager();
    const open = { send: vi.fn(), readyState: 1 } as any;
    const closed = { send: vi.fn(), readyState: 3 } as any;

    manager.join("tenant-a", open);
    manager.join("tenant-a", closed);

    manager.broadcast("tenant-a", "test");

    expect(open.send).toHaveBeenCalledOnce();
    expect(closed.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/preview-server && npx vitest run`
Expected: FAIL — `rooms.js` does not exist

- [ ] **Step 3: Implement rooms.ts**

```typescript
// packages/preview-server/src/rooms.ts
import type { WebSocket } from "ws";

export class RoomManager {
  private rooms = new Map<string, Set<WebSocket>>();

  join(tenantId: string, ws: WebSocket): void {
    if (!this.rooms.has(tenantId)) {
      this.rooms.set(tenantId, new Set());
    }
    this.rooms.get(tenantId)!.add(ws);
  }

  leave(tenantId: string, ws: WebSocket): void {
    const room = this.rooms.get(tenantId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(tenantId);
      }
    }
  }

  getConnections(tenantId: string): WebSocket[] {
    return Array.from(this.rooms.get(tenantId) ?? []);
  }

  broadcast(tenantId: string, message: string): void {
    const room = this.rooms.get(tenantId);
    if (!room) return;

    for (const ws of room) {
      // WebSocket.OPEN === 1
      if (ws.readyState === 1) {
        ws.send(message);
      }
    }
  }
}
```

- [ ] **Step 4: Run rooms tests**

Run: `cd packages/preview-server && npx vitest run`
Expected: 3 tests PASS

- [ ] **Step 5: Write failing test for static preview serving**

```typescript
// packages/preview-server/src/__tests__/static.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { previewStaticRoutes } from "../static.js";

describe("preview static serving", () => {
  let tmpDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-preview-"));
    // Create a tenant preview directory
    const previewDir = path.join(tmpDir, "test-tenant", "preview", "public");
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(path.join(previewDir, "index.html"), "<h1>Preview!</h1>");
    fs.writeFileSync(path.join(previewDir, "style.css"), "body { color: red }");

    app = Fastify();
    app.register(previewStaticRoutes, { tenantsDir: tmpDir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves preview index.html for tenant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/",
      headers: { "x-tenant-id": "test-tenant" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<h1>Preview!</h1>");
  });

  it("serves preview CSS", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/style.css",
      headers: { "x-tenant-id": "test-tenant" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("color: red");
  });

  it("returns 400 without x-tenant-id", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for missing file", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/nonexistent.html",
      headers: { "x-tenant-id": "test-tenant" },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 6: Implement static.ts**

```typescript
// packages/preview-server/src/static.ts
import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

interface PreviewStaticOpts {
  tenantsDir: string;
}

export async function previewStaticRoutes(app: FastifyInstance, opts: PreviewStaticOpts): Promise<void> {
  const { tenantsDir } = opts;

  app.get<{ Params: { "*": string } }>("/*", async (req, reply) => {
    const tenantId = req.headers["x-tenant-id"] as string | undefined;
    if (!tenantId) {
      return reply.status(400).send({ error: "missing x-tenant-id header" });
    }

    let filePath = req.url.split("?")[0];
    if (filePath === "/" || filePath === "") filePath = "/index.html";

    const previewPublic = path.join(tenantsDir, tenantId, "preview", "public");
    const fullPath = path.resolve(path.join(previewPublic, filePath));

    // Path traversal check
    if (!fullPath.startsWith(path.resolve(previewPublic))) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      return reply.status(404).send({ error: "Not found" });
    }

    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    reply.header("content-type", contentType);
    return reply.send(fs.readFileSync(fullPath));
  });
}
```

- [ ] **Step 7: Implement watcher.ts**

```typescript
// packages/preview-server/src/watcher.ts
import chokidar from "chokidar";
import path from "node:path";
import type { RoomManager } from "./rooms.js";

export class TenantWatcher {
  private watchers = new Map<string, chokidar.FSWatcher>();

  constructor(
    private tenantsDir: string,
    private rooms: RoomManager,
  ) {}

  watch(tenantId: string): void {
    if (this.watchers.has(tenantId)) return;

    const previewDir = path.join(this.tenantsDir, tenantId, "preview");
    const watcher = chokidar.watch(previewDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    watcher.on("all", (event, filePath) => {
      const relative = path.relative(previewDir, filePath);
      const ext = path.extname(filePath);

      this.rooms.broadcast(tenantId, JSON.stringify({
        type: ext === ".css" ? "css-update" : "reload",
        path: relative,
        event,
      }));
    });

    this.watchers.set(tenantId, watcher);
  }

  unwatch(tenantId: string): void {
    const watcher = this.watchers.get(tenantId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(tenantId);
    }
  }

  unwatchAll(): void {
    for (const [id] of this.watchers) {
      this.unwatch(id);
    }
  }
}
```

- [ ] **Step 8: Implement index.ts (server entry with WebSocket)**

```typescript
// packages/preview-server/src/index.ts
import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import http from "node:http";
import { PREVIEW_SERVER_PORT } from "@vibeweb/shared";
import { RoomManager } from "./rooms.js";
import { TenantWatcher } from "./watcher.js";
import { previewStaticRoutes } from "./static.js";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");

const app = Fastify({ logger: true });

app.register(previewStaticRoutes, { tenantsDir });
app.get("/health", async () => ({ status: "ok" }));

const rooms = new RoomManager();
const watcher = new TenantWatcher(tenantsDir, rooms);

const start = async () => {
  await app.listen({ port: PREVIEW_SERVER_PORT, host: "0.0.0.0" });

  // Attach WebSocket server to the same HTTP server
  const server = app.server as http.Server;
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req) => {
    // Extract tenant-id from query param: /ws?tenant=xxx
    const url = new URL(req.url ?? "", `http://localhost`);
    const tenantId = url.searchParams.get("tenant");

    if (!tenantId) {
      ws.close(4000, "missing tenant parameter");
      return;
    }

    rooms.join(tenantId, ws);
    watcher.watch(tenantId);

    ws.on("close", () => {
      rooms.leave(tenantId, ws);
    });
  });

  app.log.info("Preview server with WebSocket ready");
};

start();
```

- [ ] **Step 9: Write Dockerfile**

```dockerfile
# packages/preview-server/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY dist/ ./dist/

CMD ["node", "dist/index.js"]
```

- [ ] **Step 10: Run tests**

Run: `cd packages/preview-server && npx vitest run`
Expected: 7 tests PASS (3 rooms + 4 static)

- [ ] **Step 11: Commit**

```bash
git add packages/preview-server/
git commit -m "feat: add Preview Server with WebSocket rooms, file watcher, and static serving"
```

---

### Task 8: Nginx Configuration

**Files:**
- Create: `configs/nginx/nginx.conf`

- [ ] **Step 1: Write nginx.conf**

```nginx
# configs/nginx/nginx.conf
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;

    server {
        listen 80;
        server_name _;

        # Tenant ID injected by Traefik ForwardAuth as X-Tenant-Id header
        set $tenant_id $http_x_tenant_id;

        # Block requests without tenant ID
        if ($tenant_id = "") {
            return 400 '{"error": "missing tenant id"}';
        }

        # Serve static files from tenant's public directory
        root /data/tenants/$tenant_id/public;

        # Path traversal protection
        location ~ /\.\. {
            deny all;
            return 403;
        }

        location / {
            try_files $uri $uri/ /index.html;
        }

        # Security headers
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add configs/nginx/
git commit -m "feat: add tenant-aware Nginx configuration"
```

---

### Task 9: Traefik Configuration

**Files:**
- Create: `configs/traefik/traefik.yml`
- Create: `configs/traefik/dynamic.yml`

- [ ] **Step 1: Write traefik.yml (static config)**

```yaml
# configs/traefik/traefik.yml
api:
  dashboard: true
  insecure: true

entryPoints:
  web:
    address: ":80"

providers:
  file:
    filename: /etc/traefik/dynamic.yml
    watch: true

log:
  level: INFO
```

- [ ] **Step 2: Write dynamic.yml (routers, services, middleware)**

```yaml
# configs/traefik/dynamic.yml
http:
  middlewares:
    # ForwardAuth: validates tenant exists, injects X-Tenant-Id
    tenant-auth:
      forwardAuth:
        address: "http://control-api:1919/auth/validate"
        authResponseHeaders:
          - "X-Tenant-Id"

  routers:
    # Control API: bare domain (no subdomain)
    control-api:
      rule: "Host(`vibeweb.localhost`)"
      service: control-api
      entryPoints:
        - web

    # Function Runner: subdomain + /api/* path
    function-runner:
      rule: "HostRegexp(`{subdomain:[a-z0-9-]+}.vibeweb.localhost`) && PathPrefix(`/api/`)"
      service: function-runner
      entryPoints:
        - web
      middlewares:
        - tenant-auth

    # Preview Server: subdomain + /ws path (WebSocket)
    preview-ws:
      rule: "HostRegexp(`{subdomain:[a-z0-9-]+}.vibeweb.localhost`) && PathPrefix(`/ws`)"
      service: preview-server
      entryPoints:
        - web
      middlewares:
        - tenant-auth

    # Preview Server: subdomain + ?preview=true query
    preview-static:
      rule: "HostRegexp(`{subdomain:[a-z0-9-]+}.vibeweb.localhost`) && Query(`preview=true`)"
      service: preview-server
      entryPoints:
        - web
      middlewares:
        - tenant-auth
      priority: 100

    # Nginx: subdomain, everything else (lowest priority)
    site-server:
      rule: "HostRegexp(`{subdomain:[a-z0-9-]+}.vibeweb.localhost`)"
      service: site-server
      entryPoints:
        - web
      middlewares:
        - tenant-auth
      priority: 1

  services:
    control-api:
      loadBalancer:
        servers:
          - url: "http://control-api:1919"

    function-runner:
      loadBalancer:
        servers:
          - url: "http://function-runner:3001"

    preview-server:
      loadBalancer:
        servers:
          - url: "http://preview-server:3002"

    site-server:
      loadBalancer:
        servers:
          - url: "http://nginx:80"
```

- [ ] **Step 3: Commit**

```bash
git add configs/traefik/
git commit -m "feat: add Traefik config with wildcard subdomain routing and ForwardAuth"
```

---

### Task 10: Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `packages/control-api/Dockerfile`

- [ ] **Step 1: Write control-api Dockerfile**

```dockerfile
# packages/control-api/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY dist/ ./dist/

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Write docker-compose.yml**

```yaml
# docker-compose.yml
services:
  traefik:
    image: traefik:v3.0
    ports:
      - "80:80"
      - "8080:8080"   # Dashboard
    volumes:
      - ./configs/traefik/traefik.yml:/etc/traefik/traefik.yml:ro
      - ./configs/traefik/dynamic.yml:/etc/traefik/dynamic.yml:ro
    depends_on:
      control-api:
        condition: service_started

  nginx:
    image: nginx:alpine
    volumes:
      - ./configs/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - tenant-data:/data/tenants:ro

  control-api:
    build:
      context: packages/control-api
    environment:
      - DATA_DIR=/data
    ports:
      - "1919:1919"
    volumes:
      - app-data:/data

  function-runner:
    build:
      context: packages/function-runner
    environment:
      - DATA_DIR=/data
    volumes:
      - tenant-data:/data/tenants:ro
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - control-api

  preview-server:
    build:
      context: packages/preview-server
    environment:
      - DATA_DIR=/data
    volumes:
      - tenant-data:/data/tenants

volumes:
  app-data:
    driver: local
  tenant-data:
    driver: local
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml packages/control-api/Dockerfile
git commit -m "feat: add Docker Compose with all 5 services"
```

---

### Task 11: End-to-End Smoke Test

**Files:**
- Create: `scripts/smoke-test.sh`

- [ ] **Step 1: Write smoke test script**

```bash
#!/usr/bin/env bash
# scripts/smoke-test.sh
# End-to-end smoke test for the vibeweb platform
set -euo pipefail

API="http://localhost:1919"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; exit 1; }

echo "=== VibeWeb Smoke Test ==="
echo ""

# 1. Health check
echo "1. Health check..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/health")
[ "$STATUS" = "200" ] && pass "Control API is healthy" || fail "Control API health check (got $STATUS)"

# 2. Create tenant
echo "2. Creating tenant 'testsite'..."
TENANT=$(curl -s -X POST "$API/tenants" \
  -H "Content-Type: application/json" \
  -d '{"subdomain":"testsite","name":"Test Site"}')
TENANT_ID=$(echo "$TENANT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
[ -n "$TENANT_ID" ] && pass "Tenant created: $TENANT_ID" || fail "Tenant creation failed"

# 3. Get tenant
echo "3. Getting tenant..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API/tenants/$TENANT_ID")
[ "$STATUS" = "200" ] && pass "Tenant retrieved" || fail "Get tenant (got $STATUS)"

# 4. Access tenant site via subdomain
echo "4. Accessing tenant site via subdomain..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: testsite.vibeweb.localhost" "http://localhost")
[ "$STATUS" = "200" ] && pass "Site accessible via subdomain" || fail "Subdomain access (got $STATUS)"

# 5. Verify default index.html content
echo "5. Checking default page content..."
BODY=$(curl -s -H "Host: testsite.vibeweb.localhost" "http://localhost")
echo "$BODY" | grep -q "Welcome to your site" && pass "Default page served" || fail "Default page content"

# 6. Tenant status
echo "6. Checking tenant status..."
STATUS_BODY=$(curl -s "$API/tenants/$TENANT_ID/status")
echo "$STATUS_BODY" | grep -q '"has_preview":false' && pass "Status correct" || fail "Status check"

# 7. Delete tenant
echo "7. Deleting tenant..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/tenants/$TENANT_ID")
[ "$STATUS" = "204" ] && pass "Tenant deleted" || fail "Tenant deletion (got $STATUS)"

# 8. Verify deleted tenant subdomain returns 404
echo "8. Verifying deleted tenant returns 404..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: testsite.vibeweb.localhost" "http://localhost")
[ "$STATUS" = "404" ] && pass "Deleted tenant returns 404" || fail "Deleted tenant still accessible (got $STATUS)"

echo ""
echo "=== All smoke tests passed! ==="
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x scripts/smoke-test.sh`

- [ ] **Step 3: Build and start all services**

Run: `pnpm build && docker compose build && docker compose up -d`
Expected: All 5 services start

- [ ] **Step 4: Wait for services and run smoke test**

Run: `sleep 5 && ./scripts/smoke-test.sh`
Expected: All 8 checks PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-test.sh
git commit -m "feat: add end-to-end smoke test script"
```

---

### Task 12: Final Cleanup & Documentation

- [ ] **Step 1: Verify all unit tests pass**

Run: `pnpm test`
Expected: All tests across all packages PASS

- [ ] **Step 2: Verify docker compose up brings everything up**

Run: `docker compose down && docker compose up -d && sleep 5 && ./scripts/smoke-test.sh`
Expected: Clean start, all smoke tests PASS

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup for tenant serving and isolation infrastructure"
```
