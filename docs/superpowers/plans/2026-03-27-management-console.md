# Management Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React SPA management console at `console.vibeweb.localhost` with admin dashboard, vibe editor chat, file explorer, database browser, and tenant settings.

**Architecture:** React 19 + Vite SPA served by Nginx, connecting to existing Control API (REST) and Agent Service (WebSocket). Traefik routes `console.vibeweb.localhost` to the console. Authentication via existing tenant `api_key`.

**Tech Stack:** React 19, Vite, React Router v7, shadcn/ui, Tailwind CSS, Lucide React, TypeScript.

---

## File Map

```
packages/console/                    # NEW PACKAGE
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── tailwind.config.ts
├── postcss.config.js
├── components.json
├── Dockerfile
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api.ts
    ├── auth.tsx
    ├── lib/
    │   └── utils.ts                 # shadcn/ui cn() helper
    ├── components/
    │   ├── ui/                      # shadcn/ui primitives
    │   │   ├── button.tsx
    │   │   ├── input.tsx
    │   │   ├── dialog.tsx
    │   │   ├── table.tsx
    │   │   ├── badge.tsx
    │   │   ├── tabs.tsx
    │   │   ├── scroll-area.tsx
    │   │   └── textarea.tsx
    │   ├── Sidebar.tsx
    │   ├── ChatPanel.tsx
    │   ├── PreviewFrame.tsx
    │   ├── FileTree.tsx
    │   ├── FileViewer.tsx
    │   ├── DbExplorer.tsx
    │   └── TenantTable.tsx
    └── pages/
        ├── LoginPage.tsx
        ├── AdminPage.tsx
        ├── ChatPage.tsx
        ├── FilesPage.tsx
        ├── DbPage.tsx
        ├── ApiPage.tsx
        └── SettingsPage.tsx

packages/control-api/src/routes/
    └── files.ts                     # NEW — file listing + content endpoints
    └── db-query.ts                  # NEW — SQL query endpoint

configs/traefik/dynamic.yml          # MODIFIED — console route
docker-compose.yml                   # MODIFIED — console service
```

---

### Task 1: Console Package Scaffolding

**Files:**
- Create: `packages/console/package.json`
- Create: `packages/console/tsconfig.json`
- Create: `packages/console/tsconfig.node.json`
- Create: `packages/console/vite.config.ts`
- Create: `packages/console/index.html`
- Create: `packages/console/tailwind.config.ts`
- Create: `packages/console/postcss.config.js`
- Create: `packages/console/components.json`
- Create: `packages/console/src/main.tsx`
- Create: `packages/console/src/App.tsx`
- Create: `packages/console/src/index.css`
- Create: `packages/console/src/lib/utils.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@vibeweb/console",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "lucide-react": "^0.500.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0",
    "class-variance-authority": "^0.7.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-scroll-area": "^1.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.4.0",
    "vite": "^6.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:1919",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws/agent": {
        target: "ws://localhost:3003",
        ws: true,
        rewrite: (path) => path.replace(/^\/ws\/agent/, "/ws"),
      },
    },
  },
});
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeWeb Console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
} satisfies Config;
```

- [ ] **Step 7: Create postcss.config.js**

```javascript
export default {
  plugins: {},
};
```

- [ ] **Step 8: Create components.json (shadcn/ui config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 9: Create src/index.css**

```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

- [ ] **Step 10: Create src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 11: Create src/main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 12: Create minimal src/App.tsx**

```tsx
export function App() {
  return <div className="p-8 text-xl">VibeWeb Console</div>;
}
```

- [ ] **Step 13: Install dependencies and verify**

Run: `cd packages/console && pnpm install && pnpm build`
Expected: Build succeeds, dist/ directory created

- [ ] **Step 14: Commit**

```bash
git add packages/console/
git commit -m "chore: scaffold console package with Vite + React + Tailwind"
```

---

### Task 2: shadcn/ui Primitives

**Files:**
- Create: `packages/console/src/components/ui/button.tsx`
- Create: `packages/console/src/components/ui/input.tsx`
- Create: `packages/console/src/components/ui/dialog.tsx`
- Create: `packages/console/src/components/ui/table.tsx`
- Create: `packages/console/src/components/ui/badge.tsx`
- Create: `packages/console/src/components/ui/tabs.tsx`
- Create: `packages/console/src/components/ui/scroll-area.tsx`
- Create: `packages/console/src/components/ui/textarea.tsx`

- [ ] **Step 1: Install shadcn/ui components**

Run from `packages/console/`:

```bash
npx shadcn@latest add button input dialog table badge tabs scroll-area textarea --yes
```

If `npx shadcn` doesn't work (no components.json support), create the files manually. Each component is a thin wrapper around Radix UI with Tailwind styling. Use the shadcn/ui source from https://ui.shadcn.com as reference.

- [ ] **Step 2: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 3: Commit**

```bash
git add packages/console/src/components/ui/
git commit -m "feat: add shadcn/ui primitive components"
```

---

### Task 3: Auth Module & API Client

**Files:**
- Create: `packages/console/src/auth.tsx`
- Create: `packages/console/src/api.ts`

- [ ] **Step 1: Create auth.tsx**

```tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  api_key: string;
  status: string;
}

interface AuthState {
  apiKey: string;
  tenant: Tenant | null;
  isAdmin: boolean;
}

interface AuthContextValue {
  auth: AuthState | null;
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "vibeweb_auth";

function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuth(auth: AuthState | null): void {
  if (auth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(loadAuth);

  const login = useCallback(async (apiKey: string): Promise<boolean> => {
    try {
      // Try admin key first
      const adminRes = await fetch("/api/tenants", {
        headers: { "X-API-Key": apiKey },
      });
      if (adminRes.ok) {
        const state: AuthState = { apiKey, tenant: null, isAdmin: true };
        saveAuth(state);
        setAuth(state);
        return true;
      }

      // Try as tenant key — search all tenants isn't available,
      // so we use a dedicated login endpoint
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (loginRes.ok) {
        const tenant = await loginRes.json();
        const state: AuthState = { apiKey, tenant, isAdmin: false };
        saveAuth(state);
        setAuth(state);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    saveAuth(null);
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Create api.ts**

```typescript
function getApiKey(): string {
  try {
    const raw = localStorage.getItem("vibeweb_auth");
    if (!raw) return "";
    return JSON.parse(raw).apiKey ?? "";
  } catch {
    return "";
  }
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  headers.set("X-API-Key", getApiKey());
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`/api${path}`, { ...opts, headers });
}

// Tenants
export async function listTenants() {
  const res = await apiFetch("/tenants");
  return res.json();
}

export async function getTenant(id: string) {
  const res = await apiFetch(`/tenants/${id}`);
  return res.json();
}

export async function createTenant(subdomain: string, name: string) {
  const res = await apiFetch("/tenants", {
    method: "POST",
    body: JSON.stringify({ subdomain, name }),
  });
  return res.json();
}

export async function deleteTenant(id: string) {
  return apiFetch(`/tenants/${id}`, { method: "DELETE" });
}

export async function deployTenant(id: string) {
  const res = await apiFetch(`/tenants/${id}/deploy`, { method: "POST" });
  return res.json();
}

export async function getTenantStatus(id: string) {
  const res = await apiFetch(`/tenants/${id}/status`);
  return res.json();
}

// Files
export async function listFiles(tenantId: string) {
  const res = await apiFetch(`/tenants/${tenantId}/files`);
  return res.json();
}

export async function readFile(tenantId: string, filePath: string) {
  const res = await apiFetch(`/tenants/${tenantId}/files/${filePath}`);
  return res.text();
}

// Database
export async function queryDb(tenantId: string, sql: string) {
  const res = await apiFetch(`/tenants/${tenantId}/db/query`, {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
  return res.json();
}

// OAuth
export async function getOAuthStatus(tenantId: string) {
  const res = await apiFetch(`/tenants/${tenantId}/auth/claude/status`);
  return res.json();
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 4: Commit**

```bash
git add packages/console/src/auth.tsx packages/console/src/api.ts
git commit -m "feat: add auth context and API client for console"
```

---

### Task 4: New Control API Endpoints (Files + DB Query + Login)

**Files:**
- Create: `packages/control-api/src/routes/files.ts`
- Create: `packages/control-api/src/routes/db-query.ts`
- Modify: `packages/control-api/src/routes/auth.ts`
- Modify: `packages/control-api/src/index.ts`
- Create: `packages/control-api/src/__tests__/files.test.ts`
- Create: `packages/control-api/src/__tests__/db-query.test.ts`

- [ ] **Step 1: Write failing test for files routes**

```typescript
// packages/control-api/src/__tests__/files.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileRoutes } from "../routes/files.js";

describe("file routes", () => {
  let tmpDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-files-"));
    const previewPublic = path.join(tmpDir, "tenant-1", "preview", "public");
    const previewFunctions = path.join(tmpDir, "tenant-1", "preview", "functions", "api");
    fs.mkdirSync(previewPublic, { recursive: true });
    fs.mkdirSync(previewFunctions, { recursive: true });
    fs.writeFileSync(path.join(previewPublic, "index.html"), "<h1>Hello</h1>");
    fs.writeFileSync(path.join(previewPublic, "style.css"), "body { color: red; }");
    fs.writeFileSync(path.join(previewFunctions, "hello.js"), "export default () => ({})");

    app = Fastify();
    app.register(fileRoutes, { tenantsDir: tmpDir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET /tenants/:id/files lists files recursively", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/tenant-1/files" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.files).toContainEqual(expect.objectContaining({ path: "public/index.html" }));
    expect(body.files).toContainEqual(expect.objectContaining({ path: "public/style.css" }));
    expect(body.files).toContainEqual(expect.objectContaining({ path: "functions/api/hello.js" }));
  });

  it("GET /tenants/:id/files/:path reads file content", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/tenant-1/files/public/index.html" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("<h1>Hello</h1>");
  });

  it("GET /tenants/:id/files/:path returns 404 for missing file", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/tenant-1/files/public/nope.html" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Implement files.ts**

```typescript
// packages/control-api/src/routes/files.ts
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";

interface FileRoutesOpts {
  tenantsDir: string;
}

interface FileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

export async function fileRoutes(app: FastifyInstance, opts: FileRoutesOpts): Promise<void> {
  const { tenantsDir } = opts;

  app.get<{ Params: { id: string } }>("/tenants/:id/files", async (req, reply) => {
    const previewDir = path.join(tenantsDir, req.params.id, "preview");
    if (!fs.existsSync(previewDir)) return reply.status(404).send({ error: "tenant not found" });

    const files: FileEntry[] = [];
    walkDir(previewDir, previewDir, files);
    return { files };
  });

  app.get<{ Params: { id: string; "*": string } }>("/tenants/:id/files/*", async (req, reply) => {
    const filePath = req.params["*"];
    const fullPath = path.join(tenantsDir, req.params.id, "preview", filePath);

    // Prevent path traversal
    const resolved = path.resolve(fullPath);
    const base = path.resolve(path.join(tenantsDir, req.params.id, "preview"));
    if (!resolved.startsWith(base)) return reply.status(403).send({ error: "forbidden" });

    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      return reply.status(404).send({ error: "file not found" });
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    reply.type("text/plain").send(content);
  });
}

function walkDir(dir: string, baseDir: string, result: FileEntry[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "CLAUDE.md") continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, result);
    } else {
      const stat = fs.statSync(fullPath);
      result.push({ path: relPath, size: stat.size, isDirectory: false });
    }
  }
}
```

- [ ] **Step 3: Write failing test for db-query route**

```typescript
// packages/control-api/src/__tests__/db-query.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { dbQueryRoutes } from "../routes/db-query.js";

describe("db-query routes", () => {
  let tmpDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-dbq-"));
    const dbDir = path.join(tmpDir, "tenant-1", "db");
    fs.mkdirSync(dbDir, { recursive: true });

    const db = new Database(path.join(dbDir, "tenant.db"));
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO users (name) VALUES ('Alice'), ('Bob')");
    db.close();

    app = Fastify();
    app.register(dbQueryRoutes, { tenantsDir: tmpDir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("POST /tenants/:id/db/query executes SELECT", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants/tenant-1/db/query",
      payload: { sql: "SELECT * FROM users" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].name).toBe("Alice");
  });

  it("rejects non-SELECT queries", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants/tenant-1/db/query",
      payload: { sql: "DELETE FROM users" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns error for invalid SQL", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tenants/tenant-1/db/query",
      payload: { sql: "SELECT * FROM nonexistent" },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 4: Implement db-query.ts**

```typescript
// packages/control-api/src/routes/db-query.ts
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

interface DbQueryRoutesOpts {
  tenantsDir: string;
}

export async function dbQueryRoutes(app: FastifyInstance, opts: DbQueryRoutesOpts): Promise<void> {
  const { tenantsDir } = opts;

  app.post<{ Params: { id: string }; Body: { sql: string } }>(
    "/tenants/:id/db/query",
    async (req, reply) => {
      const { sql } = req.body;
      if (!sql) return reply.status(400).send({ error: "sql is required" });

      // Only allow SELECT queries from console
      const trimmed = sql.trim().toUpperCase();
      if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("PRAGMA")) {
        return reply.status(400).send({ error: "only SELECT and PRAGMA queries are allowed" });
      }

      const dbPath = path.join(tenantsDir, req.params.id, "db", "tenant.db");
      if (!fs.existsSync(dbPath)) {
        return reply.status(404).send({ error: "tenant database not found" });
      }

      try {
        const db = new Database(dbPath, { readonly: true });
        const stmt = db.prepare(sql);
        const rows = stmt.all();
        const columns = stmt.columns().map((c) => c.name);
        db.close();
        return { columns, rows, count: rows.length };
      } catch (err) {
        const message = err instanceof Error ? err.message : "query failed";
        return reply.status(400).send({ error: message });
      }
    },
  );
}
```

- [ ] **Step 5: Add login endpoint to auth.ts**

Add to `packages/control-api/src/routes/auth.ts`, inside the `authRoutes` function after the existing `/auth/validate` route:

```typescript
  app.post<{ Body: { api_key: string } }>("/auth/login", async (req, reply) => {
    const { api_key } = req.body;
    if (!api_key) return reply.status(400).send({ error: "api_key is required" });

    // Check admin key
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && api_key === adminKey) {
      return { admin: true };
    }

    // Search for tenant by api_key
    const tenant = db.getTenantByApiKey(api_key);
    if (!tenant) return reply.status(401).send({ error: "invalid api key" });
    return tenant;
  });
```

- [ ] **Step 6: Add getTenantByApiKey to db.ts**

Add to the `Db` interface in `packages/control-api/src/db.ts`:

```typescript
getTenantByApiKey(apiKey: string): Tenant | undefined;
```

Add prepared statement:

```typescript
getTenantByApiKey: db.prepare("SELECT * FROM tenants WHERE api_key = ? AND status != 'deleted'"),
```

Add implementation:

```typescript
getTenantByApiKey(apiKey: string): Tenant | undefined {
  return stmts.getTenantByApiKey.get(apiKey) as Tenant | undefined;
},
```

- [ ] **Step 7: Add listTenants endpoint to tenants.ts**

Add to `packages/control-api/src/routes/tenants.ts`, inside the `tenantRoutes` function:

```typescript
  app.get("/tenants", async (req, reply) => {
    const tenants = db.listTenants();
    return tenants;
  });
```

Add to `Db` interface and implementation in `packages/control-api/src/db.ts`:

Interface:
```typescript
listTenants(): Tenant[];
```

Prepared statement:
```typescript
listTenants: db.prepare("SELECT * FROM tenants WHERE status != 'deleted' ORDER BY created_at DESC"),
```

Implementation:
```typescript
listTenants(): Tenant[] {
  return stmts.listTenants.all() as Tenant[];
},
```

- [ ] **Step 8: Register new routes in index.ts**

Add imports and registrations to `packages/control-api/src/index.ts`:

```typescript
import { fileRoutes } from "./routes/files.js";
import { dbQueryRoutes } from "./routes/db-query.js";
```

```typescript
app.register(fileRoutes, { tenantsDir });
app.register(dbQueryRoutes, { tenantsDir });
```

- [ ] **Step 9: Run all control-api tests**

Run: `cd packages/control-api && node node_modules/vitest/vitest.mjs run`
Expected: All tests pass (previous 16 + 3 files + 3 db-query = 22)

- [ ] **Step 10: Commit**

```bash
git add packages/control-api/src/
git commit -m "feat: add file listing, DB query, and login endpoints to Control API"
```

---

### Task 5: App Shell — Router + Sidebar Layout

**Files:**
- Modify: `packages/console/src/App.tsx`
- Create: `packages/console/src/components/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar.tsx**

```tsx
// packages/console/src/components/Sidebar.tsx
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/auth";
import {
  MessageSquare, FolderOpen, Database, Plug, Settings,
  LayoutDashboard, Users, LogOut, ChevronDown, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TenantNav {
  id: string;
  name: string;
  subdomain: string;
}

export function Sidebar({ tenants }: { tenants: TenantNav[] }) {
  const { auth, logout } = useAuth();
  const location = useLocation();
  const { tenantId } = useParams();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (tenantId) return { [tenantId]: true };
    return {};
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="w-[220px] h-screen bg-zinc-50 dark:bg-zinc-900 border-r flex flex-col">
      <div className="p-4 font-bold text-lg border-b">VibeWeb</div>

      <nav className="flex-1 overflow-y-auto p-2 text-sm">
        {auth?.isAdmin && (
          <div className="mb-2">
            <div className="px-2 py-1 text-xs font-semibold text-zinc-400 uppercase">Admin</div>
            <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" active={isActive("/admin")} />
          </div>
        )}

        {tenants.map((t) => (
          <div key={t.id} className="mb-1">
            <button
              onClick={() => toggleExpand(t.id)}
              className="flex items-center gap-1 w-full px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
            >
              {expanded[t.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-medium truncate">{t.name}</span>
              <span className="ml-auto text-xs text-zinc-400">{t.subdomain}</span>
            </button>

            {expanded[t.id] && (
              <div className="ml-4 mt-1 space-y-0.5">
                <NavItem to={`/t/${t.id}/chat`} icon={MessageSquare} label="Chat" active={isActive(`/t/${t.id}/chat`)} />
                <NavItem to={`/t/${t.id}/files`} icon={FolderOpen} label="Files" active={isActive(`/t/${t.id}/files`)} />
                <NavItem to={`/t/${t.id}/db`} icon={Database} label="Database" active={isActive(`/t/${t.id}/db`)} />
                <NavItem to={`/t/${t.id}/api`} icon={Plug} label="API" active={isActive(`/t/${t.id}/api`)} />
                <NavItem to={`/t/${t.id}/settings`} icon={Settings} label="Settings" active={isActive(`/t/${t.id}/settings`)} />
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-2 border-t">
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded text-sm",
        active ? "bg-zinc-200 dark:bg-zinc-800 font-medium" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Update App.tsx with router and layout**

```tsx
// packages/console/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { LoginPage } from "@/pages/LoginPage";
import { AdminPage } from "@/pages/AdminPage";
import { ChatPage } from "@/pages/ChatPage";
import { FilesPage } from "@/pages/FilesPage";
import { DbPage } from "@/pages/DbPage";
import { ApiPage } from "@/pages/ApiPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { useState, useEffect } from "react";
import { listTenants } from "@/api";

function AppLayout() {
  const { auth } = useAuth();
  const [tenants, setTenants] = useState<{ id: string; name: string; subdomain: string }[]>([]);

  useEffect(() => {
    if (!auth) return;
    if (auth.isAdmin) {
      listTenants().then(setTenants).catch(() => {});
    } else if (auth.tenant) {
      setTenants([{ id: auth.tenant.id, name: auth.tenant.name, subdomain: auth.tenant.subdomain }]);
    }
  }, [auth]);

  if (!auth) return <Navigate to="/login" />;

  return (
    <div className="flex h-screen">
      <Sidebar tenants={tenants} />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/t/:tenantId/chat" element={<ChatPage />} />
            <Route path="/t/:tenantId/files" element={<FilesPage />} />
            <Route path="/t/:tenantId/db" element={<DbPage />} />
            <Route path="/t/:tenantId/api" element={<ApiPage />} />
            <Route path="/t/:tenantId/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Create stub pages so the app compiles**

Create each page file with a minimal placeholder:

```tsx
// packages/console/src/pages/LoginPage.tsx
export function LoginPage() {
  return <div className="p-8">Login</div>;
}
```

```tsx
// packages/console/src/pages/AdminPage.tsx
export function AdminPage() {
  return <div className="p-8">Admin Dashboard</div>;
}
```

```tsx
// packages/console/src/pages/ChatPage.tsx
export function ChatPage() {
  return <div className="p-8">Chat</div>;
}
```

```tsx
// packages/console/src/pages/FilesPage.tsx
export function FilesPage() {
  return <div className="p-8">Files</div>;
}
```

```tsx
// packages/console/src/pages/DbPage.tsx
export function DbPage() {
  return <div className="p-8">Database</div>;
}
```

```tsx
// packages/console/src/pages/ApiPage.tsx
export function ApiPage() {
  return <div className="p-8">API</div>;
}
```

```tsx
// packages/console/src/pages/SettingsPage.tsx
export function SettingsPage() {
  return <div className="p-8">Settings</div>;
}
```

- [ ] **Step 4: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 5: Commit**

```bash
git add packages/console/src/
git commit -m "feat: add app shell with router, sidebar layout, and stub pages"
```

---

### Task 6: Login Page

**Files:**
- Modify: `packages/console/src/pages/LoginPage.tsx`

- [ ] **Step 1: Implement LoginPage**

```tsx
// packages/console/src/pages/LoginPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";

export function LoginPage() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { auth, login } = useAuth();
  const navigate = useNavigate();

  if (auth) {
    if (auth.isAdmin) navigate("/admin", { replace: true });
    else if (auth.tenant) navigate(`/t/${auth.tenant.id}/chat`, { replace: true });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(apiKey.trim());
    setLoading(false);
    if (!ok) {
      setError("Invalid API key");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-zinc-900 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-1">VibeWeb</h1>
        <p className="text-zinc-500 text-sm mb-6">Enter your API key to continue</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key"
              className="w-full px-3 py-2 border rounded-md bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400"
              autoFocus
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 3: Commit**

```bash
git add packages/console/src/pages/LoginPage.tsx
git commit -m "feat: implement login page with API key authentication"
```

---

### Task 7: Admin Dashboard Page

**Files:**
- Modify: `packages/console/src/pages/AdminPage.tsx`
- Create: `packages/console/src/components/TenantTable.tsx`

- [ ] **Step 1: Create TenantTable.tsx**

```tsx
// packages/console/src/components/TenantTable.tsx
import { Link } from "react-router-dom";
import { Trash2, ExternalLink } from "lucide-react";
import { deleteTenant } from "@/api";

interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  status: string;
  created_at: string;
}

export function TenantTable({ tenants, onRefresh }: { tenants: Tenant[]; onRefresh: () => void }) {
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete tenant "${name}"? This cannot be undone.`)) return;
    await deleteTenant(id);
    onRefresh();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-left px-4 py-3 font-medium">Subdomain</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Created</th>
            <th className="text-right px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className="px-4 py-3 font-medium">{t.name}</td>
              <td className="px-4 py-3 text-zinc-500">{t.subdomain}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  t.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-zinc-100 text-zinc-800"
                }`}>
                  {t.status}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-500">{new Date(t.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right space-x-2">
                <Link
                  to={`/t/${t.id}/chat`}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <ExternalLink className="w-3 h-3" /> Open
                </Link>
                <button
                  onClick={() => handleDelete(t.id, t.name)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </td>
            </tr>
          ))}
          {tenants.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No tenants yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Implement AdminPage**

```tsx
// packages/console/src/pages/AdminPage.tsx
import { useState, useEffect, useCallback } from "react";
import { listTenants, createTenant } from "@/api";
import { TenantTable } from "@/components/TenantTable";
import { Plus } from "lucide-react";

export function AdminPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    listTenants().then(setTenants).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    await createTenant(subdomain.trim(), name.trim());
    setCreating(false);
    setShowCreate(false);
    setSubdomain("");
    setName("");
    refresh();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-800/50 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-zinc-500">Subdomain</label>
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="my-site"
              className="w-full px-3 py-2 border rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              autoFocus
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-zinc-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Site"
              className="w-full px-3 py-2 border rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !subdomain.trim() || !name.trim()}
            className="px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      <TenantTable tenants={tenants} onRefresh={refresh} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 4: Commit**

```bash
git add packages/console/src/pages/AdminPage.tsx packages/console/src/components/TenantTable.tsx
git commit -m "feat: implement admin dashboard with tenant table and creation"
```

---

### Task 8: Chat Page with WebSocket + Preview

**Files:**
- Modify: `packages/console/src/pages/ChatPage.tsx`
- Create: `packages/console/src/components/ChatPanel.tsx`
- Create: `packages/console/src/components/PreviewFrame.tsx`

- [ ] **Step 1: Create ChatPanel.tsx**

```tsx
// packages/console/src/components/ChatPanel.tsx
import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolUse?: { tool: string; path?: string }[];
  done: boolean;
}

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
  connected: boolean;
  loading: boolean;
}

export function ChatPanel({ messages, onSend, connected, loading }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !connected || loading) return;
    setInput("");
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full border-r">
      <div className="px-4 py-3 border-b flex items-center gap-2 text-sm font-medium">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-zinc-300"}`} />
        Chat
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}>
              {msg.content}
              {msg.toolUse && msg.toolUse.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.toolUse.map((t, j) => (
                    <div key={j} className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 font-mono">
                      {t.tool}{t.path ? `: ${t.path}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {!msg.done && <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-0.5" />}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-zinc-400 text-sm mt-12">
            Start a conversation to edit your site with AI
          </div>
        )}
      </div>

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "Describe what you want to change... (Ctrl+Enter to send)" : "Connecting..."}
            disabled={!connected}
            className="flex-1 px-3 py-2 border rounded-md bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !connected || loading}
            className="px-3 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 self-end"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PreviewFrame.tsx**

```tsx
// packages/console/src/components/PreviewFrame.tsx
import { useRef } from "react";
import { RefreshCw } from "lucide-react";

export function PreviewFrame({ subdomain }: { subdomain: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const previewUrl = `http://${subdomain}.vibeweb.localhost?preview=true`;

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = previewUrl;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b flex items-center justify-between text-sm">
        <span className="text-zinc-500">{previewUrl}</span>
        <button onClick={handleRefresh} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src={previewUrl}
        className="flex-1 w-full border-0 bg-white"
        title="Preview"
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement ChatPage with WebSocket**

```tsx
// packages/console/src/pages/ChatPage.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ChatPanel } from "@/components/ChatPanel";
import { PreviewFrame } from "@/components/PreviewFrame";
import { FileTree } from "@/components/FileTree";
import { FileViewer } from "@/components/FileViewer";
import { DbExplorer } from "@/components/DbExplorer";
import { getTenant } from "@/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolUse?: { tool: string; path?: string }[];
  done: boolean;
}

export function ChatPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "files" | "db">("preview");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then((t) => setSubdomain(t.subdomain)).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/agent`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "session.start", tenantId }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "session.ready") {
        setSessionId(msg.sessionId);
        setConnected(true);
      } else if (msg.type === "stream") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant" || last.done) {
            return [...prev, { role: "assistant", content: "", toolUse: [], done: false }];
          }

          const updated = [...prev];
          const current = { ...updated[updated.length - 1] };

          if (msg.data?.type === "assistant" || msg.data?.type === "text") {
            current.content += msg.data.content ?? "";
          } else if (msg.data?.type === "tool_use") {
            current.toolUse = [...(current.toolUse ?? []), { tool: msg.data.tool, path: msg.data.path }];
          }

          updated[updated.length - 1] = current;
          return updated;
        });
        setLoading(true);
      } else if (msg.type === "message.done") {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], done: true };
          return updated;
        });
        setLoading(false);
      } else if (msg.type === "error") {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg.error}`, toolUse: [], done: true }]);
        setLoading(false);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setSessionId(null);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "session.end", sessionId }));
      }
      ws.close();
    };
  }, [tenantId]);

  const handleSend = useCallback((content: string) => {
    if (!wsRef.current || !sessionId) return;
    setMessages((prev) => [...prev, { role: "user", content, toolUse: [], done: true }]);
    wsRef.current.send(JSON.stringify({ type: "message", sessionId, content }));
  }, [sessionId]);

  return (
    <div className="flex h-full">
      <div className="w-[35%] min-w-[300px]">
        <ChatPanel messages={messages} onSend={handleSend} connected={connected} loading={loading} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex border-b">
          {(["preview", "files", "db"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                activeTab === tab
                  ? "border-b-2 border-zinc-900 dark:border-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {activeTab === "preview" && subdomain && <PreviewFrame subdomain={subdomain} />}
          {activeTab === "files" && tenantId && <FileTree tenantId={tenantId} />}
          {activeTab === "db" && tenantId && <DbExplorer tenantId={tenantId} />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create stub FileTree, FileViewer, DbExplorer**

These will be fully implemented in later tasks. For now, stubs:

```tsx
// packages/console/src/components/FileTree.tsx
export function FileTree({ tenantId }: { tenantId: string }) {
  return <div className="p-4 text-sm text-zinc-500">File explorer for {tenantId}</div>;
}
```

```tsx
// packages/console/src/components/FileViewer.tsx
export function FileViewer({ tenantId, filePath }: { tenantId: string; filePath: string }) {
  return <div className="p-4 text-sm font-mono">{filePath}</div>;
}
```

```tsx
// packages/console/src/components/DbExplorer.tsx
export function DbExplorer({ tenantId }: { tenantId: string }) {
  return <div className="p-4 text-sm text-zinc-500">Database explorer for {tenantId}</div>;
}
```

- [ ] **Step 5: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 6: Commit**

```bash
git add packages/console/src/
git commit -m "feat: implement chat page with WebSocket, chat panel, and live preview"
```

---

### Task 9: Files Page — File Tree + Viewer

**Files:**
- Modify: `packages/console/src/components/FileTree.tsx`
- Modify: `packages/console/src/components/FileViewer.tsx`
- Modify: `packages/console/src/pages/FilesPage.tsx`

- [ ] **Step 1: Implement FileTree.tsx**

```tsx
// packages/console/src/components/FileTree.tsx
import { useState, useEffect } from "react";
import { listFiles } from "@/api";
import { File, Folder, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileEntry {
  path: string;
  size: number;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  size?: number;
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const existing = current.find((n) => n.name === name);
      if (existing) {
        current = existing.children;
      } else {
        const node: TreeNode = {
          name,
          path: parts.slice(0, i + 1).join("/"),
          children: [],
          isFile,
          size: isFile ? file.size : undefined,
        };
        current.push(node);
        current = node.children;
      }
    }
  }
  return root;
}

export function FileTree({ tenantId, onSelect, selectedPath }: {
  tenantId: string;
  onSelect?: (path: string) => void;
  selectedPath?: string;
}) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["public", "functions"]));

  useEffect(() => {
    listFiles(tenantId).then((data) => setFiles(data.files ?? [])).catch(() => {});
  }, [tenantId]);

  const tree = buildTree(files);

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="p-2 text-sm overflow-y-auto h-full">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onSelect={onSelect}
          selectedPath={selectedPath}
          depth={0}
        />
      ))}
      {files.length === 0 && (
        <div className="text-zinc-400 text-center mt-8">No files</div>
      )}
    </div>
  );
}

function TreeItem({ node, expanded, toggleExpand, onSelect, selectedPath, depth }: {
  node: TreeNode;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  onSelect?: (path: string) => void;
  selectedPath?: string;
  depth: number;
}) {
  const isExpanded = expanded.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div>
      <button
        onClick={() => {
          if (node.isFile) onSelect?.(node.path);
          else toggleExpand(node.path);
        }}
        className={cn(
          "flex items-center gap-1.5 w-full px-2 py-1 rounded text-left hover:bg-zinc-100 dark:hover:bg-zinc-800",
          isSelected && "bg-zinc-200 dark:bg-zinc-700"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.isFile ? (
          <File className="w-3.5 h-3.5 text-zinc-400" />
        ) : isExpanded ? (
          <><ChevronDown className="w-3 h-3" /><Folder className="w-3.5 h-3.5 text-zinc-400" /></>
        ) : (
          <><ChevronRight className="w-3 h-3" /><Folder className="w-3.5 h-3.5 text-zinc-400" /></>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {!node.isFile && isExpanded && node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onSelect={onSelect}
          selectedPath={selectedPath}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement FileViewer.tsx**

```tsx
// packages/console/src/components/FileViewer.tsx
import { useState, useEffect } from "react";
import { readFile } from "@/api";

export function FileViewer({ tenantId, filePath }: { tenantId: string; filePath: string }) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    readFile(tenantId, filePath)
      .then(setContent)
      .catch(() => setContent("Failed to load file"))
      .finally(() => setLoading(false));
  }, [tenantId, filePath]);

  const ext = filePath.split(".").pop() ?? "";
  const langMap: Record<string, string> = {
    html: "html", css: "css", js: "javascript", ts: "typescript", json: "json",
  };
  const lang = langMap[ext] ?? "text";

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b flex items-center justify-between text-sm">
        <span className="font-mono text-zinc-600 dark:text-zinc-400">{filePath}</span>
        <span className="text-xs text-zinc-400 uppercase">{lang}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-zinc-400">Loading...</div>
        ) : (
          <pre className="p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words">
            <code>{content}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement FilesPage**

```tsx
// packages/console/src/pages/FilesPage.tsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { FileTree } from "@/components/FileTree";
import { FileViewer } from "@/components/FileViewer";

export function FilesPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (!tenantId) return null;

  return (
    <div className="flex h-full">
      <div className="w-[30%] min-w-[200px] border-r overflow-hidden">
        <FileTree tenantId={tenantId} onSelect={setSelectedFile} selectedPath={selectedFile ?? undefined} />
      </div>
      <div className="flex-1">
        {selectedFile ? (
          <FileViewer tenantId={tenantId} filePath={selectedFile} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 5: Commit**

```bash
git add packages/console/src/components/FileTree.tsx packages/console/src/components/FileViewer.tsx packages/console/src/pages/FilesPage.tsx
git commit -m "feat: implement file explorer with tree navigation and code viewer"
```

---

### Task 10: Database Page — SQL Explorer

**Files:**
- Modify: `packages/console/src/components/DbExplorer.tsx`
- Modify: `packages/console/src/pages/DbPage.tsx`

- [ ] **Step 1: Implement DbExplorer.tsx**

```tsx
// packages/console/src/components/DbExplorer.tsx
import { useState } from "react";
import { queryDb } from "@/api";
import { Play } from "lucide-react";

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  count: number;
}

export function DbExplorer({ tenantId }: { tenantId: string }) {
  const [sql, setSql] = useState("SELECT name FROM sqlite_master WHERE type='table'");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const runQuery = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await queryDb(tenantId, sql);
      if (data.error) {
        setError(data.error);
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Query failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runQuery();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex gap-2">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-3 py-2 border rounded-md bg-transparent text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
            rows={3}
            placeholder="SELECT * FROM ..."
          />
          <button
            onClick={runQuery}
            disabled={loading || !sql.trim()}
            className="px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 self-start"
          >
            <Play className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
      </div>

      <div className="flex-1 overflow-auto">
        {result && (
          <div>
            <div className="px-4 py-2 text-xs text-zinc-400 border-b">
              {result.count} row{result.count !== 1 ? "s" : ""}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0">
                <tr>
                  {result.columns.map((col) => (
                    <th key={col} className="text-left px-4 py-2 font-medium text-xs uppercase text-zinc-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    {result.columns.map((col) => (
                      <td key={col} className="px-4 py-2 font-mono text-xs">
                        {String(row[col] ?? "NULL")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!result && !error && (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Run a query to see results (Ctrl+Enter)
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement DbPage**

```tsx
// packages/console/src/pages/DbPage.tsx
import { useParams } from "react-router-dom";
import { DbExplorer } from "@/components/DbExplorer";

export function DbPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return <DbExplorer tenantId={tenantId} />;
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 4: Commit**

```bash
git add packages/console/src/components/DbExplorer.tsx packages/console/src/pages/DbPage.tsx
git commit -m "feat: implement database explorer with SQL query and result table"
```

---

### Task 11: API Page + Settings Page

**Files:**
- Modify: `packages/console/src/pages/ApiPage.tsx`
- Modify: `packages/console/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Implement ApiPage**

```tsx
// packages/console/src/pages/ApiPage.tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { listFiles } from "@/api";
import { Plug } from "lucide-react";

interface ApiFunction {
  name: string;
  path: string;
}

export function ApiPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [functions, setFunctions] = useState<ApiFunction[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    listFiles(tenantId).then((data) => {
      const apiFunctions = (data.files ?? [])
        .filter((f: { path: string }) => f.path.startsWith("functions/api/") && f.path.endsWith(".js"))
        .map((f: { path: string }) => {
          const name = f.path.replace("functions/api/", "").replace(".js", "");
          return { name, path: `/api/${name}` };
        });
      setFunctions(apiFunctions);
    }).catch(() => {});
  }, [tenantId]);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">API Endpoints</h1>

      {functions.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Function</th>
                <th className="text-left px-4 py-3 font-medium">Endpoint</th>
              </tr>
            </thead>
            <tbody>
              {functions.map((fn) => (
                <tr key={fn.name} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3 font-mono">{fn.name}</td>
                  <td className="px-4 py-3 font-mono text-zinc-500">{fn.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-400">
          <Plug className="w-8 h-8 mx-auto mb-2" />
          <p>No API functions yet</p>
          <p className="text-xs mt-1">Create functions in /functions/api/ using the chat editor</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement SettingsPage**

```tsx
// packages/console/src/pages/SettingsPage.tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getTenant, getTenantStatus, deployTenant, getOAuthStatus } from "@/api";
import { Rocket, CheckCircle, XCircle } from "lucide-react";

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [oauth, setOAuth] = useState<{ connected: boolean; expires_at: string | null } | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then(setTenant).catch(() => {});
    getTenantStatus(tenantId).then(setStatus).catch(() => {});
    getOAuthStatus(tenantId).then(setOAuth).catch(() => {});
  }, [tenantId]);

  const handleDeploy = async () => {
    if (!tenantId) return;
    setDeploying(true);
    setDeployMsg("");
    try {
      await deployTenant(tenantId);
      setDeployMsg("Deployed successfully!");
      getTenantStatus(tenantId).then(setStatus).catch(() => {});
    } catch {
      setDeployMsg("Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  if (!tenant) return <div className="p-8 text-zinc-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Subdomain */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Subdomain</h2>
        <div className="px-4 py-3 border rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
          <span className="font-mono">{tenant.subdomain}.vibeweb.localhost</span>
        </div>
      </section>

      {/* Deploy */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Deploy</h2>
        <p className="text-sm text-zinc-500 mb-3">
          Push preview changes to the live site.
          {status?.last_deployment && (
            <span> Last deployed: {new Date(status.last_deployment).toLocaleString()}</span>
          )}
        </p>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Rocket className="w-4 h-4" />
          {deploying ? "Deploying..." : "Deploy to Live"}
        </button>
        {deployMsg && <p className="mt-2 text-sm text-green-600">{deployMsg}</p>}
      </section>

      {/* Claude Connection */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Claude Connection</h2>
        <div className="flex items-center gap-2 px-4 py-3 border rounded-lg">
          {oauth?.connected ? (
            <><CheckCircle className="w-5 h-5 text-green-500" /><span className="text-sm">Connected</span></>
          ) : (
            <><XCircle className="w-5 h-5 text-zinc-400" /><span className="text-sm text-zinc-500">Not connected — using fallback API key</span></>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/console && pnpm build`
Expected: Builds without errors

- [ ] **Step 4: Commit**

```bash
git add packages/console/src/pages/ApiPage.tsx packages/console/src/pages/SettingsPage.tsx
git commit -m "feat: implement API listing and settings pages"
```

---

### Task 12: Console Dockerfile + Docker Compose + Traefik

**Files:**
- Create: `packages/console/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `configs/traefik/dynamic.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# packages/console/Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/console/package.json packages/console/

RUN pnpm install --filter @vibeweb/console --frozen-lockfile

COPY packages/console/ packages/console/

WORKDIR /app/packages/console
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/packages/console/dist /usr/share/nginx/html
# SPA fallback: serve index.html for all routes
RUN echo 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 2: Add console service to docker-compose.yml**

Add after `agent-service` service:

```yaml
  console:
    build:
      context: .
      dockerfile: packages/console/Dockerfile
    ports:
      - "5173:80"
```

- [ ] **Step 3: Add console route to Traefik dynamic.yml**

Add router (before the `control-api` router, highest priority):

```yaml
    console:
      rule: "Host(`console.vibeweb.localhost`)"
      service: console
      entryPoints:
        - web
      priority: 200
```

Add service:

```yaml
    console:
      loadBalancer:
        servers:
          - url: "http://console:80"
```

- [ ] **Step 4: Commit**

```bash
git add packages/console/Dockerfile docker-compose.yml configs/traefik/dynamic.yml
git commit -m "feat: add console Docker image and Traefik routing"
```

---

### Task 13: Build & Integration Verification

- [ ] **Step 1: Build all packages**

Run: `pnpm build`
Expected: All 6 packages compile without errors

- [ ] **Step 2: Run all backend tests**

Run: `pnpm test`
Expected: All tests pass across all packages

- [ ] **Step 3: Build all Docker images**

Run: `docker compose build`
Expected: All services build successfully (including console)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix build issues for management console integration"
```
