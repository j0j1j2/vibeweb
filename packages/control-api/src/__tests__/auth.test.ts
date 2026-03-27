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
    const res = await app.inject({ method: "GET", url: "/auth/validate", headers: { "x-forwarded-host": "valid.vibeweb.localhost" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-tenant-id"]).toBe(tenant.id);
  });

  it("returns 404 for unknown subdomain", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/validate", headers: { "x-forwarded-host": "unknown.vibeweb.localhost" } });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for bare domain (no subdomain)", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/validate", headers: { "x-forwarded-host": "vibeweb.localhost" } });
    expect(res.statusCode).toBe(404);
  });
});
