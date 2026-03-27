import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";

interface OAuthRoutesOpts {
  db: Db;
  tokenEncryptionKey: string;
}

export async function oauthRoutes(app: FastifyInstance, opts: OAuthRoutesOpts): Promise<void> {
  const { db } = opts;

  app.get<{ Params: { id: string } }>("/tenants/:id/auth/claude", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    return reply.status(501).send({
      error: "OAuth flow not yet implemented. Use ANTHROPIC_API_KEY environment variable as fallback.",
    });
  });

  app.get<{ Params: { id: string }; Querystring: { code?: string } }>(
    "/tenants/:id/auth/claude/callback",
    async (req, reply) => {
      const tenant = db.getTenantById(req.params.id);
      if (!tenant) return reply.status(404).send({ error: "tenant not found" });
      const { code } = req.query;
      if (!code) return reply.status(400).send({ error: "missing authorization code" });
      return reply.status(501).send({ error: "OAuth token exchange not yet implemented" });
    },
  );

  app.get<{ Params: { id: string } }>("/tenants/:id/auth/claude/status", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    const tokenData = db.getOAuthToken(req.params.id);
    const connected = !!tokenData?.claude_oauth_token;
    const expiresAt = tokenData?.claude_token_expires_at ?? null;
    return { connected, expires_at: expiresAt };
  });

  app.delete<{ Params: { id: string } }>("/tenants/:id/auth/claude", async (req, reply) => {
    const tenant = db.getTenantById(req.params.id);
    if (!tenant) return reply.status(404).send({ error: "tenant not found" });
    db.clearOAuthToken(req.params.id);
    return reply.status(204).send();
  });
}
