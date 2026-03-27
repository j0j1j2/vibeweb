import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { previewStaticRoutes } from "../static.js";

describe("preview static serving", () => {
  let tmpDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-preview-"));
    const previewDir = path.join(tmpDir, "test-tenant", "preview", "public");
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(path.join(previewDir, "index.html"), "<h1>Preview!</h1>");
    fs.writeFileSync(path.join(previewDir, "style.css"), "body { color: red }");
    app = Fastify();
    app.register(previewStaticRoutes, { tenantsDir: tmpDir });
    await app.ready();
  });

  afterEach(async () => { await app.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("serves preview index.html for tenant", async () => {
    const res = await app.inject({ method: "GET", url: "/", headers: { "x-tenant-id": "test-tenant" } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<h1>Preview!</h1>");
  });

  it("serves preview CSS", async () => {
    const res = await app.inject({ method: "GET", url: "/style.css", headers: { "x-tenant-id": "test-tenant" } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("color: red");
  });

  it("returns 400 without x-tenant-id", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for missing file", async () => {
    const res = await app.inject({ method: "GET", url: "/nonexistent.html", headers: { "x-tenant-id": "test-tenant" } });
    expect(res.statusCode).toBe(404);
  });
});
