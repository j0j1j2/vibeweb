import type { FastifyInstance } from "fastify";
import { SUBDOMAIN_REGEX, SUBDOMAIN_MAX_LENGTH, RESERVED_SUBDOMAIN_PREFIXES, RESERVED_SUBDOMAINS, getTenantPaths, initTenantDir, atomicDeploy } from "@vibeweb/shared";
import type { Db } from "../db.js";
import { ensureGitRepo, autoCommitIfDirty, git } from "../git.js";

interface TenantRoutesOpts { db: Db; tenantsDir: string; }

export async function tenantRoutes(app: FastifyInstance, opts: TenantRoutesOpts): Promise<void> {
  const { db, tenantsDir } = opts;

  app.get("/tenants", async (req, reply) => {
    const tenants = db.listTenants();
    return tenants;
  });

  app.post<{ Body: { subdomain: string; name: string } }>("/tenants", async (req, reply) => {
    const { subdomain, name } = req.body;
    if (!subdomain || !name) return reply.status(400).send({ error: "subdomain and name are required" });
    if (!SUBDOMAIN_REGEX.test(subdomain) || subdomain.length > SUBDOMAIN_MAX_LENGTH) return reply.status(400).send({ error: "invalid subdomain format" });
    if (RESERVED_SUBDOMAIN_PREFIXES.some((p) => subdomain.startsWith(p))) return reply.status(400).send({ error: "subdomain uses a reserved prefix" });
    if (RESERVED_SUBDOMAINS.includes(subdomain)) return reply.status(400).send({ error: "subdomain is reserved" });
    const existing = db.getTenantBySubdomain(subdomain);
    if (existing) return reply.status(409).send({ error: "subdomain already taken" });
    const tenant = db.createTenant({ subdomain, name });
    const paths = getTenantPaths(tenantsDir, tenant.id);
    initTenantDir(paths);
    return reply.status(201).send(tenant);
  });

  app.get<{ Params: { id: string } }>("/tenants/:id", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    return tenant;
  });

  app.delete<{ Params: { id: string } }>("/tenants/:id", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    db.deleteTenant(req.params.id);
    // Clean up tenant files
    const path = await import("node:path");
    const tenantDir = path.join(tenantsDir, req.params.id);
    const fs = await import("node:fs");
    if (fs.existsSync(tenantDir)) fs.rmSync(tenantDir, { recursive: true, force: true });
    return reply.status(204).send();
  });

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

  app.post<{ Params: { id: string } }>("/tenants/:id/rollback", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
    const latest = db.getLatestDeployment(tenant.id);
    if (!latest?.backup_path) return reply.status(400).send({ error: "no backup available" });
    const paths = getTenantPaths(tenantsDir, tenant.id);
    const fs = await import("node:fs");
    const path = await import("node:path");
    const backupPublic = path.join(latest.backup_path, "public");
    const backupFunctions = path.join(latest.backup_path, "functions");
    if (fs.existsSync(backupPublic)) { fs.rmSync(paths.public, { recursive: true, force: true }); fs.cpSync(backupPublic, paths.public, { recursive: true }); }
    if (fs.existsSync(backupFunctions)) { fs.rmSync(paths.functions, { recursive: true, force: true }); fs.cpSync(backupFunctions, paths.functions, { recursive: true }); }
    return { message: "rolled back", backup_used: latest.backup_path };
  });

  app.post<{ Params: { id: string } }>("/tenants/:id/reset-key", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    const newKey = db.resetApiKey(req.params.id);
    return { api_key: newKey };
  });

  app.post<{ Params: { id: string } }>("/tenants/:id/reset-password", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    const crypto = await import("node:crypto");
    const newPassword = crypto.randomBytes(12).toString("base64url");
    const hash = crypto.createHash("sha256").update(newPassword).digest("hex");
    db.setPassword(req.params.id, hash);
    return { password: newPassword, subdomain: tenant.subdomain };
  });

  app.get<{ Params: { id: string } }>("/tenants/:id/status", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    const latest = db.getLatestDeployment(tenant.id);
    const paths = getTenantPaths(tenantsDir, tenant.id);
    const fs = await import("node:fs");
    const hasPreview = fs.existsSync(paths.previewPublic) && fs.readdirSync(paths.previewPublic).length > 0;
    return { tenant_id: tenant.id, subdomain: tenant.subdomain, status: tenant.status, last_deployment: latest?.deployed_at ?? null, has_preview: hasPreview };
  });
}
