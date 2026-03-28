import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

interface DbQueryRoutesOpts { tenantsDir: string; }

export async function dbQueryRoutes(app: FastifyInstance, opts: DbQueryRoutesOpts): Promise<void> {
  const { tenantsDir } = opts;

  app.post<{ Params: { id: string }; Body: { sql: string } }>("/tenants/:id/db/query", async (req, reply) => {
    const { sql } = req.body;
    if (!sql) return reply.status(400).send({ error: "sql is required" });
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("PRAGMA")) {
      return reply.status(400).send({ error: "only SELECT and PRAGMA queries are allowed" });
    }
    if (sql.includes(";")) {
      return reply.status(400).send({ error: "multiple statements not allowed" });
    }
    const forbidden = /\b(ATTACH|DETACH|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE)\b/i;
    if (forbidden.test(sql)) {
      return reply.status(400).send({ error: "only SELECT and PRAGMA queries are allowed" });
    }
    const dbPath = path.join(tenantsDir, req.params.id, "db", "tenant.db");
    if (!fs.existsSync(dbPath)) return reply.status(404).send({ error: "tenant database not found" });
    try {
      const db = new Database(dbPath, { readonly: true });
      const stmt = db.prepare(sql);
      const rows = stmt.all();
      const columns = stmt.columns().map((c) => c.name);
      db.close();
      return { columns, rows, count: rows.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : "query failed";
      return reply.status(400).send({ error: message });
    }
  });
}
