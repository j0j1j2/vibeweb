import type { FastifyInstance } from "fastify";
import { SUBDOMAIN_REGEX, SUBDOMAIN_MAX_LENGTH, getTenantPaths, initTenantDir, atomicDeploy } from "@vibeweb/shared";
import type { Db } from "../db.js";

interface TenantRoutesOpts { db: Db; tenantsDir: string; }

export async function tenantRoutes(app: FastifyInstance, opts: TenantRoutesOpts): Promise<void> {
  const { db, tenantsDir } = opts;

  app.post<{ Body: { subdomain: string; name: string } }>("/tenants", async (req, reply) => {
    const { subdomain, name } = req.body;
    if (!subdomain || !name) return reply.status(400).send({ error: "subdomain and name are required" });
    if (!SUBDOMAIN_REGEX.test(subdomain) || subdomain.length > SUBDOMAIN_MAX_LENGTH) return reply.status(400).send({ error: "invalid subdomain format" });
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
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/tenants/:id/deploy", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant || tenant.status !== "active") return reply.status(404).send({ error: "tenant not found" });
    const paths = getTenantPaths(tenantsDir, tenant.id);
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
