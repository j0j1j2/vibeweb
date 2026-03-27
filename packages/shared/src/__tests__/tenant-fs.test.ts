import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initTenantDir, getTenantPaths, atomicDeploy } from "../tenant-fs.js";

describe("tenant-fs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getTenantPaths", () => {
    it("returns correct paths for a tenant id", () => {
      const paths = getTenantPaths(tmpDir, "tenant-123");
      expect(paths.root).toBe(path.join(tmpDir, "tenant-123"));
      expect(paths.public).toBe(path.join(tmpDir, "tenant-123", "public"));
      expect(paths.functions).toBe(path.join(tmpDir, "tenant-123", "functions"));
      expect(paths.db).toBe(path.join(tmpDir, "tenant-123", "db"));
      expect(paths.preview).toBe(path.join(tmpDir, "tenant-123", "preview"));
      expect(paths.previewPublic).toBe(path.join(tmpDir, "tenant-123", "preview", "public"));
      expect(paths.previewFunctions).toBe(path.join(tmpDir, "tenant-123", "preview", "functions"));
    });
  });

  describe("initTenantDir", () => {
    it("creates full directory structure with default index.html", () => {
      const paths = getTenantPaths(tmpDir, "tenant-abc");
      initTenantDir(paths);

      expect(fs.existsSync(paths.public)).toBe(true);
      expect(fs.existsSync(paths.functions)).toBe(true);
      expect(fs.existsSync(paths.previewPublic)).toBe(true);
      expect(fs.existsSync(paths.previewFunctions)).toBe(true);
      expect(fs.existsSync(paths.db)).toBe(true);
      expect(fs.existsSync(path.join(paths.db, "tenant.db"))).toBe(true);
      expect(fs.existsSync(path.join(paths.functions, "api"))).toBe(true);

      const indexHtml = fs.readFileSync(path.join(paths.public, "index.html"), "utf-8");
      expect(indexHtml).toContain("<!DOCTYPE html>");
    });
  });

  describe("atomicDeploy", () => {
    it("copies preview to public and creates backup", () => {
      const paths = getTenantPaths(tmpDir, "tenant-deploy");
      initTenantDir(paths);

      fs.writeFileSync(path.join(paths.public, "index.html"), "<h1>Old</h1>");

      fs.writeFileSync(path.join(paths.previewPublic, "index.html"), "<h1>New</h1>");
      fs.mkdirSync(path.join(paths.previewFunctions, "api"), { recursive: true });
      fs.writeFileSync(path.join(paths.previewFunctions, "api", "test.js"), "export default async () => ({})");

      const backupPath = atomicDeploy(paths);

      const deployed = fs.readFileSync(path.join(paths.public, "index.html"), "utf-8");
      expect(deployed).toBe("<h1>New</h1>");

      const fn = fs.readFileSync(path.join(paths.functions, "api", "test.js"), "utf-8");
      expect(fn).toContain("export default");

      expect(backupPath).toBeTruthy();
      expect(fs.existsSync(backupPath!)).toBe(true);
      const backed = fs.readFileSync(path.join(backupPath!, "public", "index.html"), "utf-8");
      expect(backed).toBe("<h1>Old</h1>");
    });
  });
});
