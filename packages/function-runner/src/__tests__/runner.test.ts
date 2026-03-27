import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { handleFunctionRequest } from "../runner.js";
import type { FunctionRequest } from "@vibeweb/shared";

describe("runner", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-runner-"));
    const fnDir = path.join(tmpDir, "test-tenant", "functions", "api");
    fs.mkdirSync(fnDir, { recursive: true });
    fs.writeFileSync(path.join(fnDir, "hello.js"), 'export default async (req) => ({ status: 200, body: { msg: "hi" } })');
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  const baseReq: FunctionRequest = { method: "GET", path: "/api/hello", query: {}, headers: {}, body: "" };

  it("returns 404 for nonexistent function", async () => {
    const result = await handleFunctionRequest("test-tenant", "nonexistent", baseReq, tmpDir);
    expect(result.status).toBe(404);
  });

  it("returns 403 for path traversal attempt", async () => {
    const result = await handleFunctionRequest("test-tenant", "../../etc/passwd", baseReq, tmpDir);
    expect(result.status).toBe(403);
  });

  it.skipIf(!process.env.DOCKER_TEST)("executes function in container", async () => {
    const result = await handleFunctionRequest("test-tenant", "hello", baseReq, tmpDir);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ msg: "hi" });
  });
});
