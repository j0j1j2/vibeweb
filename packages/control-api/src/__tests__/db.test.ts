import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDb, type Db } from "../db.js";

describe("db", () => {
  let tmpDir: string;
  let db: Db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-db-"));
    db = createDb(path.join(tmpDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("tenants", () => {
    it("creates and retrieves a tenant", () => {
      const tenant = db.createTenant({ subdomain: "alice", name: "Alice Site" });
      expect(tenant.subdomain).toBe("alice");
      expect(tenant.name).toBe("Alice Site");
      expect(tenant.status).toBe("active");
      expect(tenant.api_key).toBeTruthy();

      const found = db.getTenantById(tenant.id);
      // initial_password is only returned on creation, not stored in tenant row
      const { initial_password: _ip, ...tenantWithoutInitialPassword } = tenant;
      expect(found).toMatchObject(tenantWithoutInitialPassword);
    });

    it("finds tenant by subdomain", () => {
      const tenant = db.createTenant({ subdomain: "bob", name: "Bob Site" });
      const found = db.getTenantBySubdomain("bob");
      expect(found?.id).toBe(tenant.id);
    });

    it("rejects duplicate subdomains", () => {
      db.createTenant({ subdomain: "dupe", name: "First" });
      expect(() => db.createTenant({ subdomain: "dupe", name: "Second" })).toThrow();
    });

    it("deletes a tenant (soft delete)", () => {
      const tenant = db.createTenant({ subdomain: "del", name: "Delete Me" });
      db.deleteTenant(tenant.id);
      const found = db.getTenantById(tenant.id);
      expect(found?.status).toBe("deleted");
    });
  });

  describe("deployments", () => {
    it("records a deployment", () => {
      const tenant = db.createTenant({ subdomain: "dep", name: "Deploy Test" });
      const deployment = db.recordDeployment(tenant.id, "/backup/path");
      expect(deployment.tenant_id).toBe(tenant.id);
      expect(deployment.backup_path).toBe("/backup/path");

      const latest = db.getLatestDeployment(tenant.id);
      expect(latest?.id).toBe(deployment.id);
    });
  });
});
