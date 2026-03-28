import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";

interface AuthRoutesOpts { db: Db; }

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOpts): Promise<void> {
  const { db } = opts;

  app.get("/auth/validate", async (req, reply) => {
    const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
    if (!forwardedHost) return reply.status(400).send({ error: "missing x-forwarded-host header" });
    const parts = forwardedHost.split(".");
    if (parts.length < 3) return reply.status(404).send({ error: "no subdomain" });
    const subdomain = parts[0];
    const tenant = db.getTenantBySubdomain(subdomain);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    reply.header("x-tenant-id", tenant.id);
    return reply.status(200).send({ ok: true });
  });

  app.post<{ Body: { subdomain?: string; password?: string; api_key?: string } }>("/auth/login", async (req, reply) => {
    const { subdomain, password, api_key } = req.body;

    // Admin key login (backward compat)
    const adminKey = process.env.ADMIN_API_KEY;
    if (api_key && adminKey && api_key === adminKey) return { admin: true };

    // Tenant login by subdomain + password
    if (subdomain && password) {
      const tenant = db.getTenantForLogin(subdomain);
      if (!tenant || !tenant.password_hash) return reply.status(401).send({ error: "invalid credentials" });
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== tenant.password_hash) return reply.status(401).send({ error: "invalid credentials" });
      return { id: tenant.id, subdomain: tenant.subdomain, name: tenant.name, status: tenant.status };
    }

    // Legacy API key login
    if (api_key) {
      const tenant = db.getTenantByApiKey(api_key);
      if (!tenant) return reply.status(401).send({ error: "invalid credentials" });
      return tenant;
    }

    return reply.status(400).send({ error: "subdomain and password required" });
  });

  app.post<{ Params: { id: string }; Body: { currentPassword: string; newPassword: string } }>("/tenants/:id/change-password", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    // Verify current password (get from login query)
    const loginInfo = db.getTenantForLogin(tenant.subdomain);
    if (!loginInfo) return reply.status(404).send({ error: "not found" });
    const currentHash = crypto.createHash('sha256').update(req.body.currentPassword).digest('hex');
    if (currentHash !== loginInfo.password_hash) return reply.status(401).send({ error: "wrong current password" });
    const newHash = crypto.createHash('sha256').update(req.body.newPassword).digest('hex');
    db.setPassword(req.params.id, newHash);
    return { success: true };
  });
}
