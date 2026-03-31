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
