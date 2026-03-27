import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { dbQueryRoutes } from "../routes/db-query.js";

describe("db-query routes", () => {
  let tmpDir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vibeweb-dbq-"));
    const dbDir = path.join(tmpDir, "tenant-1", "db");
    fs.mkdirSync(dbDir, { recursive: true });
    const db = new Database(path.join(dbDir, "tenant.db"));
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO users (name) VALUES ('Alice'), ('Bob')");
    db.close();
    app = Fastify();
    app.register(dbQueryRoutes, { tenantsDir: tmpDir });
    await app.ready();
  });

  afterEach(async () => { await app.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("executes SELECT query", async () => {
    const res = await app.inject({ method: "POST", url: "/tenants/tenant-1/db/query", payload: { sql: "SELECT * FROM users" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].name).toBe("Alice");
  });

  it("rejects non-SELECT queries", async () => {
    const res = await app.inject({ method: "POST", url: "/tenants/tenant-1/db/query", payload: { sql: "DELETE FROM users" } });
    expect(res.statusCode).toBe(400);
  });

  it("returns error for invalid SQL", async () => {
    const res = await app.inject({ method: "POST", url: "/tenants/tenant-1/db/query", payload: { sql: "SELECT * FROM nonexistent" } });
    expect(res.statusCode).toBe(400);
  });
});
