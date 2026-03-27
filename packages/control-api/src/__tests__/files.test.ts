import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileRoutes } from "../routes/files.js";

describe("file routes", () => {
  let tmpDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-files-"));
    const previewPublic = path.join(tmpDir, "tenant-1", "preview", "public");
    const previewFunctions = path.join(tmpDir, "tenant-1", "preview", "functions", "api");
    fs.mkdirSync(previewPublic, { recursive: true });
    fs.mkdirSync(previewFunctions, { recursive: true });
    fs.writeFileSync(path.join(previewPublic, "index.html"), "<h1>Hello</h1>");
    fs.writeFileSync(path.join(previewPublic, "style.css"), "body { color: red; }");
    fs.writeFileSync(path.join(previewFunctions, "hello.js"), "export default () => ({})");
    app = Fastify();
    app.register(fileRoutes, { tenantsDir: tmpDir });
    await app.ready();
  });

  afterEach(async () => { await app.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("lists files recursively", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/tenant-1/files" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.files).toContainEqual(expect.objectContaining({ path: "public/index.html" }));
    expect(body.files).toContainEqual(expect.objectContaining({ path: "public/style.css" }));
    expect(body.files).toContainEqual(expect.objectContaining({ path: "functions/api/hello.js" }));
  });

  it("reads file content", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/tenant-1/files/public/index.html" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("<h1>Hello</h1>");
  });

  it("returns 404 for missing file", async () => {
    const res = await app.inject({ method: "GET", url: "/tenants/tenant-1/files/public/nope.html" });
    expect(res.statusCode).toBe(404);
  });
});
