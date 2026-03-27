import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDb, type Db } from "../db.js";
import { tenantRoutes } from "../routes/tenants.js";

describe("tenant routes", () => {
  let tmpDir: string;
  let db: Db;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-routes-"));
    db = createDb(path.join(tmpDir, "test.db"));
    const tenantsDir = path.join(tmpDir, "tenants");
    fs.mkdirSync(tenantsDir, { recursive: true });
    app = Fastify();
    app.register(tenantRoutes, { db, tenantsDir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("POST /tenants creates a tenant", async () => {
    const res = await app.inject({ method: "POST", url: "/tenants", payload: { subdomain: "alice", name: "Alice Site" } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.subdomain).toBe("alice");
    expect(body.api_key).toBeTruthy();
    expect(fs.existsSync(path.join(tmpDir, "tenants", body.id, "public", "index.html"))).toBe(true);
  });

  it("POST /tenants rejects invalid subdomain", async () => {
    const res = await app.inject({ method: "POST", url: "/tenants", payload: { subdomain: "INVALID!", name: "Bad" } });
    expect(res.statusCode).toBe(400);
  });

  it("GET /tenants/:id returns tenant", async () => {
    const create = await app.inject({ method: "POST", url: "/tenants", payload: { subdomain: "bob", name: "Bob Site" } });
    const tenant = create.json();
    const res = await app.inject({ method: "GET", url: `/tenants/${tenant.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().subdomain).toBe("bob");
  });

  it("GET /tenants/:id returns 404 for missing tenant", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /tenants/:id soft-deletes tenant", async () => {
    const create = await app.inject({ method: "POST", url: "/tenants", payload: { subdomain: "del", name: "Del" } });
    const tenant = create.json();
    const res = await app.inject({ method: "DELETE", url: `/tenants/${tenant.id}` });
    expect(res.statusCode).toBe(204);
    const get = await app.inject({ method: "GET", url: `/tenants/${tenant.id}` });
    expect(get.json().status).toBe("deleted");
  });

  it("POST /tenants/:id/deploy copies preview to public", async () => {
    const create = await app.inject({ method: "POST", url: "/tenants", payload: { subdomain: "deploy", name: "Deploy Test" } });
    const tenant = create.json();
    const previewPublic = path.join(tmpDir, "tenants", tenant.id, "preview", "public");
    fs.writeFileSync(path.join(previewPublic, "index.html"), "<h1>Deployed!</h1>");
    const res = await app.inject({ method: "POST", url: `/tenants/${tenant.id}/deploy` });
    expect(res.statusCode).toBe(200);
    const deployed = fs.readFileSync(path.join(tmpDir, "tenants", tenant.id, "public", "index.html"), "utf-8");
    expect(deployed).toBe("<h1>Deployed!</h1>");
  });
});
