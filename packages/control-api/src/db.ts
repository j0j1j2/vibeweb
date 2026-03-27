import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";
import type { Tenant, Deployment, CreateTenantRequest } from "@vibeweb/shared";

export interface Db {
  createTenant(req: CreateTenantRequest): Tenant;
  getTenantById(id: string): Tenant | undefined;
  getTenantBySubdomain(subdomain: string): Tenant | undefined;
  deleteTenant(id: string): void;
  recordDeployment(tenantId: string, backupPath: string | null): Deployment;
  getLatestDeployment(tenantId: string): Deployment | undefined;
  close(): void;
}

export function createDb(dbPath: string): Db {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      subdomain TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      deployed_at TEXT NOT NULL,
      backup_path TEXT
    );
  `);

  const stmts = {
    insertTenant: db.prepare(
      `INSERT INTO tenants (id, subdomain, name, api_key, created_at, updated_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`
    ),
    getTenantById: db.prepare("SELECT * FROM tenants WHERE id = ?"),
    getTenantBySubdomain: db.prepare("SELECT * FROM tenants WHERE subdomain = ? AND status != 'deleted'"),
    deleteTenant: db.prepare("UPDATE tenants SET status = 'deleted', updated_at = ? WHERE id = ?"),
    insertDeployment: db.prepare(
      "INSERT INTO deployments (id, tenant_id, deployed_at, backup_path) VALUES (?, ?, ?, ?)"
    ),
    getLatestDeployment: db.prepare(
      "SELECT * FROM deployments WHERE tenant_id = ? ORDER BY deployed_at DESC LIMIT 1"
    ),
  };

  return {
    createTenant(req: CreateTenantRequest): Tenant {
      const id = uuidv4();
      const api_key = crypto.randomBytes(32).toString("hex");
      const now = new Date().toISOString();
      stmts.insertTenant.run(id, req.subdomain, req.name, api_key, now, now);
      return { id, subdomain: req.subdomain, name: req.name, api_key, created_at: now, updated_at: now, status: "active" };
    },
    getTenantById(id: string): Tenant | undefined {
      return stmts.getTenantById.get(id) as Tenant | undefined;
    },
    getTenantBySubdomain(subdomain: string): Tenant | undefined {
      return stmts.getTenantBySubdomain.get(subdomain) as Tenant | undefined;
    },
    deleteTenant(id: string): void {
      stmts.deleteTenant.run(new Date().toISOString(), id);
    },
    recordDeployment(tenantId: string, backupPath: string | null): Deployment {
      const id = uuidv4();
      const now = new Date().toISOString();
      stmts.insertDeployment.run(id, tenantId, now, backupPath);
      return { id, tenant_id: tenantId, deployed_at: now, backup_path: backupPath };
    },
    getLatestDeployment(tenantId: string): Deployment | undefined {
      return stmts.getLatestDeployment.get(tenantId) as Deployment | undefined;
    },
    close(): void {
      db.close();
    },
  };
}
