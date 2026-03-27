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
    const res = await app.inject({ method: "GET", url: `/tenants/${tenant.id}/auth/claude/status` });
    expect(res.statusCode).toBe(200);
    expect(res.json().connected).toBe(false);
  });

  it("DELETE /tenants/:id/auth/claude clears token", async () => {
    const tenant = db.createTenant({ subdomain: "oauth-del", name: "Del" });
    db.setOAuthToken(tenant.id, "encrypted-token", "2026-12-31T00:00:00Z");
    const res = await app.inject({ method: "DELETE", url: `/tenants/${tenant.id}/auth/claude` });
    expect(res.statusCode).toBe(204);
    const token = db.getOAuthToken(tenant.id);
    expect(token?.claude_oauth_token).toBeNull();
  });
});
