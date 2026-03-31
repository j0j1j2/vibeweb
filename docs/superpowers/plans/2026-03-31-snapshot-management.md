# Snapshot Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add git-based snapshot management with a console UI tab for creating, tagging, and restoring snapshots of tenant preview directories.

**Architecture:** Each tenant's `preview/` directory becomes a git repo. Control-API exposes snapshot CRUD endpoints that shell out to `git`. The console gets a new Snapshots tab in the sidebar with a timeline UI. Nginx and the preview-server watcher are updated to ignore `.git`.

**Tech Stack:** git CLI (via `child_process.execFile`), Fastify routes, React + lucide-react + i18next

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/control-api/src/git.ts` | Git CLI wrapper utilities |
| Create | `packages/control-api/src/routes/snapshots.ts` | Snapshot API endpoints |
| Create | `packages/console/src/pages/SnapshotsPage.tsx` | Snapshots tab UI |
| Modify | `packages/control-api/src/index.ts:22` | Register snapshot routes |
| Modify | `packages/control-api/src/routes/tenants.ts:47-54` | Add auto-commit on deploy |
| Modify | `packages/shared/src/tenant-fs.ts:63-69` | Add git init to `initTenantDir` |
| Modify | `packages/console/src/App.tsx:57` | Add snapshots route |
| Modify | `packages/console/src/components/Sidebar.tsx:63` | Add snapshots nav item |
| Modify | `packages/console/src/api.ts` | Add snapshot API functions |
| Modify | `packages/console/src/i18n/ko.json` | Korean snapshot strings |
| Modify | `packages/console/src/i18n/en.json` | English snapshot strings |
| Modify | `packages/preview-server/src/watcher.ts:13` | Ignore `.git` in chokidar |
| Modify | `configs/nginx/nginx.conf` | Block `.git` access |
| Modify | `packages/control-api/Dockerfile` | Install git in Alpine image |

---

### Task 1: Git utility module

**Files:**
- Create: `packages/control-api/src/git.ts`

- [ ] **Step 1: Create git.ts with core utilities**

```typescript
// packages/control-api/src/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10_000 });
  return stdout.trim();
}

export async function ensureGitRepo(previewDir: string): Promise<void> {
  const gitDir = path.join(previewDir, ".git");
  if (fs.existsSync(gitDir)) return;
  await git(previewDir, ["init"]);
  await git(previewDir, ["config", "user.name", "vibeweb"]);
  await git(previewDir, ["config", "user.email", "vibeweb@local"]);
  const gitignorePath = path.join(previewDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "node_modules/\n");
  }
  await git(previewDir, ["add", "-A"]);
  await git(previewDir, ["commit", "-m", "Initial commit", "--allow-empty"]);
}

export async function autoCommitIfDirty(previewDir: string, message: string): Promise<string | null> {
  await ensureGitRepo(previewDir);
  const status = await git(previewDir, ["status", "--porcelain"]);
  if (!status) return null;
  await git(previewDir, ["add", "-A"]);
  await git(previewDir, ["commit", "-m", message]);
  const hash = await git(previewDir, ["rev-parse", "HEAD"]);
  return hash;
}

export interface SnapshotInfo {
  hash: string;
  message: string;
  created_at: string;
  tags: string[];
  is_deploy: boolean;
}

export async function listSnapshots(previewDir: string, limit: number = 50, offset: number = 0): Promise<SnapshotInfo[]> {
  await ensureGitRepo(previewDir);
  const skip = offset > 0 ? `--skip=${offset}` : "";
  const args = ["log", `--max-count=${limit}`, "--format=%H%n%s%n%aI", "--decorate=no"];
  if (skip) args.push(skip);
  const raw = await git(previewDir, args);
  if (!raw) return [];

  // Get all tags and their commit hashes
  let tagMap: Record<string, string[]> = {};
  try {
    const tagOutput = await git(previewDir, ["tag", "--format=%(refname:short) %(objectname:short)", "-l"]);
    for (const line of tagOutput.split("\n").filter(Boolean)) {
      const spaceIdx = line.indexOf(" ");
      if (spaceIdx === -1) continue;
      const tag = line.slice(0, spaceIdx);
      const shortHash = line.slice(spaceIdx + 1);
      if (!tagMap[shortHash]) tagMap[shortHash] = [];
      tagMap[shortHash].push(tag);
    }
  } catch { /* no tags */ }

  const lines = raw.split("\n");
  const snapshots: SnapshotInfo[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const hash = lines[i];
    const message = lines[i + 1];
    const created_at = lines[i + 2];
    const shortHash = hash.slice(0, 7);
    const tags = tagMap[shortHash] ?? [];
    // Also check full hash matches for safety
    for (const [key, val] of Object.entries(tagMap)) {
      if (hash.startsWith(key) && key !== shortHash) {
        tags.push(...val);
      }
    }
    const is_deploy = message.startsWith("deploy-") || tags.some(t => t.startsWith("deploy-"));
    snapshots.push({ hash, message, created_at, tags: [...new Set(tags)], is_deploy });
  }
  return snapshots;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/control-api/tsconfig.json 2>&1 | head -20`
Expected: No errors related to git.ts

- [ ] **Step 3: Commit**

```bash
git add packages/control-api/src/git.ts
git commit -m "feat: add git utility module for snapshot management"
```

---

### Task 2: Snapshot API routes

**Files:**
- Create: `packages/control-api/src/routes/snapshots.ts`
- Modify: `packages/control-api/src/index.ts:22`

- [ ] **Step 1: Create snapshots.ts route file**

```typescript
// packages/control-api/src/routes/snapshots.ts
import type { FastifyInstance } from "fastify";
import { getTenantPaths } from "@vibeweb/shared";
import { ensureGitRepo, autoCommitIfDirty, listSnapshots, git } from "../git.js";
import type { Db } from "../db.js";

interface SnapshotRoutesOpts { db: Db; tenantsDir: string; }

const TAG_RE = /^[\w\u3131-\uD79D\s.\-]{1,50}$/;

export async function snapshotRoutes(app: FastifyInstance, opts: SnapshotRoutesOpts): Promise<void> {
  const { db, tenantsDir } = opts;

  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    "/tenants/:id/snapshots",
    async (req, reply) => {
      const tenant = db.getTenantById(req.params.id);
      if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
      const paths = getTenantPaths(tenantsDir, tenant.id);
      const limit = Math.min(parseInt(req.query.limit ?? "50", 10) || 50, 100);
      const offset = parseInt(req.query.offset ?? "0", 10) || 0;
      const snapshots = await listSnapshots(paths.preview, limit, offset);
      return { snapshots };
    }
  );

  app.post<{ Params: { id: string }; Body: { message?: string } }>(
    "/tenants/:id/snapshots",
    async (req, reply) => {
      const tenant = db.getTenantById(req.params.id);
      if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
      const paths = getTenantPaths(tenantsDir, tenant.id);
      const message = req.body?.message || "Manual snapshot";
      const hash = await autoCommitIfDirty(paths.preview, message);
      if (!hash) return reply.status(409).send({ error: "No changes to snapshot" });
      return reply.status(201).send({
        snapshot: { hash, message, created_at: new Date().toISOString(), tags: [], is_deploy: false },
      });
    }
  );

  app.post<{ Params: { id: string; hash: string } }>(
    "/tenants/:id/snapshots/:hash/restore",
    async (req, reply) => {
      const tenant = db.getTenantById(req.params.id);
      if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
      const paths = getTenantPaths(tenantsDir, tenant.id);
      await ensureGitRepo(paths.preview);
      const hash = req.params.hash;
      // Validate hash exists
      try {
        await git(paths.preview, ["cat-file", "-t", hash]);
      } catch {
        return reply.status(404).send({ error: "Snapshot not found" });
      }
      // Auto-save current state before restore
      await autoCommitIfDirty(paths.preview, `Auto-save before restore to ${hash.slice(0, 7)}`);
      // Restore files from target commit
      await git(paths.preview, ["checkout", hash, "--", "."]);
      // Commit the restored state
      await git(paths.preview, ["add", "-A"]);
      const restoreMsg = `Restored to ${hash.slice(0, 7)}`;
      try {
        await git(paths.preview, ["commit", "-m", restoreMsg]);
      } catch {
        // Nothing changed (restoring to current state)
      }
      const newHash = await git(paths.preview, ["rev-parse", "HEAD"]);
      return { message: restoreMsg, snapshot: { hash: newHash, message: restoreMsg, created_at: new Date().toISOString(), tags: [], is_deploy: false } };
    }
  );

  app.post<{ Params: { id: string; hash: string }; Body: { tag: string } }>(
    "/tenants/:id/snapshots/:hash/tag",
    async (req, reply) => {
      const tenant = db.getTenantById(req.params.id);
      if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
      const tag = req.body?.tag;
      if (!tag || !TAG_RE.test(tag)) return reply.status(400).send({ error: "Invalid tag name" });
      const paths = getTenantPaths(tenantsDir, tenant.id);
      await ensureGitRepo(paths.preview);
      try {
        await git(paths.preview, ["tag", tag, req.params.hash]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("already exists")) return reply.status(409).send({ error: "Tag already exists" });
        throw err;
      }
      return reply.status(201).send({ tag, hash: req.params.hash });
    }
  );

  app.delete<{ Params: { id: string; tag: string } }>(
    "/tenants/:id/snapshots/tags/:tag",
    async (req, reply) => {
      const tenant = db.getTenantById(req.params.id);
      if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
      const paths = getTenantPaths(tenantsDir, tenant.id);
      await ensureGitRepo(paths.preview);
      try {
        await git(paths.preview, ["tag", "-d", req.params.tag]);
      } catch {
        return reply.status(404).send({ error: "Tag not found" });
      }
      return { message: "Tag deleted" };
    }
  );
}
```

- [ ] **Step 2: Register snapshot routes in control-api index.ts**

In `packages/control-api/src/index.ts`, add the import and registration:

```typescript
// Add import after line 9 (after db-query import):
import { snapshotRoutes } from "./routes/snapshots.js";

// Add registration after line 26 (after dbQueryRoutes):
app.register(snapshotRoutes, { db, tenantsDir });
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/control-api/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/control-api/src/routes/snapshots.ts packages/control-api/src/index.ts
git commit -m "feat: add snapshot API routes (list, create, restore, tag, untag)"
```

---

### Task 3: Deploy auto-commit integration

**Files:**
- Modify: `packages/control-api/src/routes/tenants.ts:47-54`

- [ ] **Step 1: Add auto-commit to deploy route**

In `packages/control-api/src/routes/tenants.ts`, modify the deploy handler:

```typescript
// Add import at top of file, after existing imports:
import { ensureGitRepo, autoCommitIfDirty, git } from "../git.js";
```

Replace the deploy handler (lines 47-54) with:

```typescript
  app.post<{ Params: { id: string } }>("/tenants/:id/deploy", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
    const paths = getTenantPaths(tenantsDir, tenant.id);
    // Auto-commit preview state before deploy
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const commitMsg = `deploy-${timestamp}`;
    await ensureGitRepo(paths.preview);
    await autoCommitIfDirty(paths.preview, commitMsg);
    // Tag the deploy commit
    const head = await git(paths.preview, ["rev-parse", "HEAD"]);
    try { await git(paths.preview, ["tag", commitMsg, head]); } catch { /* tag may exist */ }
    // Perform the actual deploy
    const backupPath = atomicDeploy(paths);
    const deployment = db.recordDeployment(tenant.id, backupPath);
    return { deployment };
  });
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/control-api/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/control-api/src/routes/tenants.ts
git commit -m "feat: auto-commit and tag preview on deploy"
```

---

### Task 4: Git init on tenant creation

**Files:**
- Modify: `packages/shared/src/tenant-fs.ts:63-69`

- [ ] **Step 1: Add git init to initTenantDir**

In `packages/shared/src/tenant-fs.ts`, add git init at the end of `initTenantDir`:

```typescript
// Add import at top of file:
import { execFileSync } from "node:child_process";
```

Add at the end of the `initTenantDir` function body, after the `tenant.db` creation block:

```typescript
  // Initialize git repo in preview directory
  try {
    execFileSync("git", ["init"], { cwd: paths.preview });
    execFileSync("git", ["config", "user.name", "vibeweb"], { cwd: paths.preview });
    execFileSync("git", ["config", "user.email", "vibeweb@local"], { cwd: paths.preview });
    fs.writeFileSync(path.join(paths.preview, ".gitignore"), "node_modules/\n");
    execFileSync("git", ["add", "-A"], { cwd: paths.preview });
    execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: paths.preview });
  } catch {
    // git may not be available in all environments
  }
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/tenant-fs.ts
git commit -m "feat: initialize git repo in preview dir on tenant creation"
```

---

### Task 5: Infra changes (nginx, chokidar, Dockerfile)

**Files:**
- Modify: `configs/nginx/nginx.conf`
- Modify: `packages/preview-server/src/watcher.ts:13`
- Modify: `packages/control-api/Dockerfile`

- [ ] **Step 1: Block .git access in nginx**

In `configs/nginx/nginx.conf`, add a location block after the `location ~ /\.\.` block:

```nginx
        location ~ /\.git {
            deny all;
            return 404;
        }
```

- [ ] **Step 2: Ignore .git in chokidar watcher**

In `packages/preview-server/src/watcher.ts`, modify line 13:

Change:
```typescript
    const watcher = chokidar.watch(previewDir, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200 } });
```

To:
```typescript
    const watcher = chokidar.watch(previewDir, { ignoreInitial: true, ignored: /(^|[/\\])\.git/, awaitWriteFinish: { stabilityThreshold: 200 } });
```

- [ ] **Step 3: Install git in control-api Dockerfile**

In `packages/control-api/Dockerfile`, add `apk add git` after `FROM`:

Change:
```dockerfile
FROM node:20-alpine
RUN npm install -g pnpm
```

To:
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache git && npm install -g pnpm
```

- [ ] **Step 4: Commit**

```bash
git add configs/nginx/nginx.conf packages/preview-server/src/watcher.ts packages/control-api/Dockerfile
git commit -m "infra: block .git in nginx, ignore in chokidar, add git to control-api image"
```

---

### Task 6: Console API client functions

**Files:**
- Modify: `packages/console/src/api.ts`

- [ ] **Step 1: Add snapshot API functions**

Append to `packages/console/src/api.ts`:

```typescript
export async function getSnapshots(tenantId: string, limit = 50, offset = 0) {
  const res = await apiFetch(`/tenants/${tenantId}/snapshots?limit=${limit}&offset=${offset}`);
  return res.json();
}
export async function createSnapshot(tenantId: string, message: string) {
  const res = await apiFetch(`/tenants/${tenantId}/snapshots`, { method: "POST", body: JSON.stringify({ message }) });
  return res.json();
}
export async function restoreSnapshot(tenantId: string, hash: string) {
  const res = await apiFetch(`/tenants/${tenantId}/snapshots/${hash}/restore`, { method: "POST" });
  return res.json();
}
export async function addSnapshotTag(tenantId: string, hash: string, tag: string) {
  const res = await apiFetch(`/tenants/${tenantId}/snapshots/${hash}/tag`, { method: "POST", body: JSON.stringify({ tag }) });
  return res.json();
}
export async function deleteSnapshotTag(tenantId: string, tag: string) {
  const res = await apiFetch(`/tenants/${tenantId}/snapshots/tags/${encodeURIComponent(tag)}`, { method: "DELETE" });
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/api.ts
git commit -m "feat: add snapshot API client functions"
```

---

### Task 7: i18n strings

**Files:**
- Modify: `packages/console/src/i18n/ko.json`
- Modify: `packages/console/src/i18n/en.json`

- [ ] **Step 1: Add Korean snapshot strings**

In `packages/console/src/i18n/ko.json`, add `"snapshots"` key in `"sidebar"` section and a new `"snapshots"` top-level section.

In `"sidebar"` section, add after `"api": "API"`:
```json
"snapshots": "스냅샷",
```

Add new top-level section after the `"api"` section:
```json
"snapshots": {
  "title": "스냅샷",
  "create": "스냅샷 찍기",
  "messagePlaceholder": "스냅샷 설명 (선택)",
  "restore": "복구",
  "restoreConfirm": "현재 변경사항이 자동 저장된 후 이 스냅샷으로 복구됩니다. 계속하시겠습니까?",
  "restoreSuccess": "복구가 완료되었습니다",
  "restoreFailed": "복구에 실패했습니다",
  "addTag": "태그 추가",
  "tagPlaceholder": "태그 이름",
  "deleteTagConfirm": "이 태그를 삭제하시겠습니까?",
  "noChanges": "변경사항이 없습니다",
  "noSnapshots": "아직 스냅샷이 없습니다",
  "noSnapshotsDesc": "채팅으로 사이트를 수정한 후 스냅샷을 찍어보세요",
  "loadMore": "더 보기",
  "autoDeployLabel": "배포",
  "createFailed": "스냅샷 생성에 실패했습니다",
  "tagFailed": "태그 추가에 실패했습니다"
}
```

- [ ] **Step 2: Add English snapshot strings**

In `packages/console/src/i18n/en.json`, add `"snapshots"` key in `"sidebar"` section and a new `"snapshots"` top-level section.

In `"sidebar"` section, add after `"api": "API"`:
```json
"snapshots": "Snapshots",
```

Add new top-level section after the `"api"` section:
```json
"snapshots": {
  "title": "Snapshots",
  "create": "Take Snapshot",
  "messagePlaceholder": "Snapshot description (optional)",
  "restore": "Restore",
  "restoreConfirm": "Current changes will be auto-saved, then this snapshot will be restored. Continue?",
  "restoreSuccess": "Restored successfully",
  "restoreFailed": "Restore failed",
  "addTag": "Add Tag",
  "tagPlaceholder": "Tag name",
  "deleteTagConfirm": "Delete this tag?",
  "noChanges": "No changes to snapshot",
  "noSnapshots": "No snapshots yet",
  "noSnapshotsDesc": "Modify your site with the chat, then take a snapshot",
  "loadMore": "Load More",
  "autoDeployLabel": "deploy",
  "createFailed": "Failed to create snapshot",
  "tagFailed": "Failed to add tag"
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/console/src/i18n/ko.json packages/console/src/i18n/en.json
git commit -m "feat: add snapshot i18n strings (Korean + English)"
```

---

### Task 8: SnapshotsPage component

**Files:**
- Create: `packages/console/src/pages/SnapshotsPage.tsx`

- [ ] **Step 1: Create the SnapshotsPage component**

```tsx
// packages/console/src/pages/SnapshotsPage.tsx
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Camera, RotateCcw, Tag, X, Rocket, History } from "lucide-react";
import { getSnapshots, createSnapshot, restoreSnapshot, addSnapshotTag, deleteSnapshotTag } from "@/api";

interface Snapshot {
  hash: string;
  message: string;
  created_at: string;
  tags: string[];
  is_deploy: boolean;
}

export function SnapshotsPage() {
  const { t } = useTranslation();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [restoringHash, setRestoringHash] = useState<string | null>(null);
  const [taggingHash, setTaggingHash] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 50;

  const load = useCallback(async (offset = 0) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await getSnapshots(tenantId, PAGE_SIZE, offset);
      const items = data.snapshots ?? [];
      if (offset === 0) setSnapshots(items);
      else setSnapshots((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } catch {
      setError("Failed to load snapshots");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!tenantId) return;
    setCreating(true);
    setError(null);
    try {
      const data = await createSnapshot(tenantId, createMsg || "Manual snapshot");
      if (data.error) { setError(data.error === "No changes to snapshot" ? t("snapshots.noChanges") : t("snapshots.createFailed")); }
      else { setShowCreateDialog(false); setCreateMsg(""); load(); }
    } catch { setError(t("snapshots.createFailed")); }
    finally { setCreating(false); }
  };

  const handleRestore = async (hash: string) => {
    if (!tenantId || !confirm(t("snapshots.restoreConfirm"))) return;
    setRestoringHash(hash);
    try {
      await restoreSnapshot(tenantId, hash);
      load();
    } catch { setError(t("snapshots.restoreFailed")); }
    finally { setRestoringHash(null); }
  };

  const handleAddTag = async (hash: string) => {
    if (!tenantId || !tagInput.trim()) return;
    try {
      const data = await addSnapshotTag(tenantId, hash, tagInput.trim());
      if (data.error) { setError(t("snapshots.tagFailed")); return; }
      setTaggingHash(null);
      setTagInput("");
      load();
    } catch { setError(t("snapshots.tagFailed")); }
  };

  const handleDeleteTag = async (tag: string) => {
    if (!tenantId || !confirm(t("snapshots.deleteTagConfirm"))) return;
    try {
      await deleteSnapshotTag(tenantId, tag);
      load();
    } catch { /* ignore */ }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t("snapshots.justNow", "just now");
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("snapshots.title")}</h1>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
        >
          <Camera className="w-4 h-4" /> {t("snapshots.create")}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {showCreateDialog && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <input
            type="text"
            value={createMsg}
            onChange={(e) => setCreateMsg(e.target.value)}
            placeholder={t("snapshots.messagePlaceholder")}
            className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowCreateDialog(false); setCreateMsg(""); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
              {t("common.cancel")}
            </button>
            <button onClick={handleCreate} disabled={creating} className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {creating ? "..." : t("snapshots.create")}
            </button>
          </div>
        </div>
      )}

      {snapshots.length > 0 ? (
        <div className="space-y-1">
          {snapshots.map((snap) => (
            <div key={snap.hash} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 group">
              <div className="mt-1 flex-shrink-0">
                {snap.is_deploy ? (
                  <Rocket className="w-4 h-4 text-orange-500" />
                ) : (
                  <div className="w-4 h-4 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">{snap.hash.slice(0, 7)}</span>
                  <span className="text-sm text-gray-700 truncate">{snap.message}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-400">{timeAgo(snap.created_at)}</span>
                  {snap.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-600 text-xs rounded-full">
                      <Tag className="w-3 h-3" /> {tag}
                      <button onClick={() => handleDeleteTag(tag)} className="hover:text-violet-800"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {taggingHash === snap.hash ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder={t("snapshots.tagPlaceholder")}
                      className="w-28 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(snap.hash); if (e.key === "Escape") { setTaggingHash(null); setTagInput(""); } }}
                      autoFocus
                    />
                    <button onClick={() => handleAddTag(snap.hash)} className="text-violet-600 hover:text-violet-800 text-xs font-medium">OK</button>
                  </div>
                ) : (
                  <button onClick={() => setTaggingHash(snap.hash)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title={t("snapshots.addTag")}>
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleRestore(snap.hash)}
                  disabled={restoringHash === snap.hash}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50"
                  title={t("snapshots.restore")}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {hasMore && (
            <button onClick={() => load(snapshots.length)} className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg">
              {t("snapshots.loadMore")}
            </button>
          )}
        </div>
      ) : !loading ? (
        <div className="text-center py-12 text-gray-400">
          <History className="w-8 h-8 mx-auto mb-2" />
          <p>{t("snapshots.noSnapshots")}</p>
          <p className="text-xs mt-1">{t("snapshots.noSnapshotsDesc")}</p>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/pages/SnapshotsPage.tsx
git commit -m "feat: add SnapshotsPage component with timeline UI"
```

---

### Task 9: Wire up sidebar and routing

**Files:**
- Modify: `packages/console/src/components/Sidebar.tsx:6,63`
- Modify: `packages/console/src/App.tsx:10,57`

- [ ] **Step 1: Add snapshots tab to Sidebar**

In `packages/console/src/components/Sidebar.tsx`:

Add `History` to the lucide-react import on line 4:
```typescript
import {
  Monitor, FolderOpen, Database, Plug, Settings,
  LayoutDashboard, LogOut, ChevronDown, ChevronRight, Sparkles, History,
} from "lucide-react";
```

Add the snapshots nav item after the API nav item (after line 63):
```tsx
                <NavItem to={`/t/${tn.id}/snapshots`} icon={History} label={t("sidebar.snapshots")} active={isActive(`/t/${tn.id}/snapshots`)} />
```

- [ ] **Step 2: Add snapshots route to App.tsx**

In `packages/console/src/App.tsx`:

Add import after line 10 (after ApiPage import):
```typescript
import { SnapshotsPage } from "@/pages/SnapshotsPage";
```

Add route after line 57 (after the API route):
```tsx
            <Route path="/t/:tenantId/snapshots" element={<ChatLayout><SnapshotsPage /></ChatLayout>} />
```

- [ ] **Step 3: Verify the console builds**

Run: `cd /Users/cloudchamb3r/projects/vibeweb/packages/console && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/console/src/components/Sidebar.tsx packages/console/src/App.tsx
git commit -m "feat: wire snapshots tab into sidebar and router"
```

---

### Task 10: Build and verify

- [ ] **Step 1: Build all packages**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && pnpm -r build 2>&1 | tail -20`
Expected: All packages build successfully

- [ ] **Step 2: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: fix build issues from snapshot feature"
```
