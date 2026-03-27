import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateClaudeMd } from "../claude-md.js";

describe("claude-md", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-claudemd-"));
    const previewPublic = path.join(tmpDir, "preview", "public");
    const previewFunctions = path.join(tmpDir, "preview", "functions", "api");
    const dbDir = path.join(tmpDir, "db");
    fs.mkdirSync(previewPublic, { recursive: true });
    fs.mkdirSync(previewFunctions, { recursive: true });
    fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(path.join(previewPublic, "index.html"), "<h1>Hello</h1>");
    fs.writeFileSync(path.join(previewPublic, "style.css"), "body {}");
    fs.writeFileSync(path.join(previewFunctions, "hello.js"), "export default async () => ({})");
    fs.writeFileSync(path.join(dbDir, "tenant.db"), "");
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("generates CLAUDE.md with file tree", () => {
    const md = generateClaudeMd("Test Tenant", path.join(tmpDir, "preview"), path.join(tmpDir, "db"));
    expect(md).toContain("# Tenant: Test Tenant");
    expect(md).toContain("index.html");
    expect(md).toContain("style.css");
    expect(md).toContain("/api/hello");
    expect(md).toContain("NEVER modify files outside");
  });

  it("handles empty directories", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-empty-"));
    fs.mkdirSync(path.join(emptyDir, "preview", "public"), { recursive: true });
    fs.mkdirSync(path.join(emptyDir, "preview", "functions", "api"), { recursive: true });
    fs.mkdirSync(path.join(emptyDir, "db"), { recursive: true });
    fs.writeFileSync(path.join(emptyDir, "db", "tenant.db"), "");
    const md = generateClaudeMd("Empty", path.join(emptyDir, "preview"), path.join(emptyDir, "db"));
    expect(md).toContain("# Tenant: Empty");
    expect(md).toContain("(no files yet)");
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
