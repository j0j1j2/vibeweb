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
  setOAuthToken(tenantId: string, encryptedToken: string, expiresAt: string): void;
  getOAuthToken(tenantId: string): { claude_oauth_token: string | null; claude_token_expires_at: string | null } | undefined;
  clearOAuthToken(tenantId: string): void;
  getTenantByApiKey(apiKey: string): Tenant | undefined;
  listTenants(): Tenant[];
  resetApiKey(tenantId: string): string;
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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      container_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      last_activity_at TEXT NOT NULL
    );
  `);

  try { db.exec("ALTER TABLE tenants ADD COLUMN claude_oauth_token TEXT"); } catch { /* column already exists */ }
  try { db.exec("ALTER TABLE tenants ADD COLUMN claude_token_expires_at TEXT"); } catch { /* column already exists */ }

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
    setOAuthToken: db.prepare("UPDATE tenants SET claude_oauth_token = ?, claude_token_expires_at = ?, updated_at = ? WHERE id = ?"),
    getOAuthToken: db.prepare("SELECT claude_oauth_token, claude_token_expires_at FROM tenants WHERE id = ?"),
    clearOAuthToken: db.prepare("UPDATE tenants SET claude_oauth_token = NULL, claude_token_expires_at = NULL, updated_at = ? WHERE id = ?"),
    getTenantByApiKey: db.prepare("SELECT * FROM tenants WHERE api_key = ? AND status != 'deleted'"),
    listTenants: db.prepare("SELECT * FROM tenants WHERE status != 'deleted' ORDER BY created_at DESC"),
    resetApiKey: db.prepare("UPDATE tenants SET api_key = ?, updated_at = ? WHERE id = ?"),
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
    setOAuthToken(tenantId: string, encryptedToken: string, expiresAt: string): void {
      stmts.setOAuthToken.run(encryptedToken, expiresAt, new Date().toISOString(), tenantId);
    },
    getOAuthToken(tenantId: string): { claude_oauth_token: string | null; claude_token_expires_at: string | null } | undefined {
      return stmts.getOAuthToken.get(tenantId) as { claude_oauth_token: string | null; claude_token_expires_at: string | null } | undefined;
    },
    clearOAuthToken(tenantId: string): void {
      stmts.clearOAuthToken.run(new Date().toISOString(), tenantId);
    },
    getTenantByApiKey(apiKey: string): Tenant | undefined {
      return stmts.getTenantByApiKey.get(apiKey) as Tenant | undefined;
    },
    listTenants(): Tenant[] {
      return stmts.listTenants.all() as Tenant[];
    },
    resetApiKey(tenantId: string): string {
      const newKey = crypto.randomBytes(32).toString("hex");
      stmts.resetApiKey.run(newKey, new Date().toISOString(), tenantId);
      return newKey;
    },
    close(): void {
      db.close();
    },
  };
}
