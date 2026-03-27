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
}
