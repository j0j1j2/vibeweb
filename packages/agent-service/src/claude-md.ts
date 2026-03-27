import fs from "node:fs";
import path from "node:path";

export function generateClaudeMd(tenantName: string, previewDir: string, dbDir: string): string {
  const fileTree = buildFileTree(previewDir);
  const apiEndpoints = findApiEndpoints(path.join(previewDir, "functions", "api"));
  const dbTables = readDbTables(path.join(dbDir, "tenant.db"));

  return `# Tenant: ${tenantName}

## Working Directory Structure
- /workspace/public/     — static files (HTML, CSS, JS, images)
- /workspace/functions/  — serverless API functions (/api/* routes)
- /data/db/tenant.db     — SQLite database

## Rules
- NEVER modify files outside /workspace and /data/db/
- Serverless functions go in /workspace/functions/api/ as .js files
- Function signature: export default async function(req) { return { status, headers, body } }
- DB access: use better-sqlite3, path is /data/db/tenant.db
- npm packages: run npm install in /workspace/functions/

## Current State

### Files
${fileTree || "(no files yet)"}

### API Endpoints
${apiEndpoints || "(no API endpoints yet)"}

### Database Tables
${dbTables || "(no tables yet)"}
`;
}

function buildFileTree(dir: string, prefix: string = ""): string {
  if (!fs.existsSync(dir)) return "";
  const lines: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "CLAUDE.md") continue;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      lines.push(...buildFileTree(path.join(dir, entry.name), relPath).split("\n").filter(Boolean));
    } else {
      lines.push(`- ${relPath}`);
    }
  }
  return lines.join("\n");
}

function findApiEndpoints(apiDir: string): string {
  if (!fs.existsSync(apiDir)) return "";
  const lines: string[] = [];
  const files = fs.readdirSync(apiDir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    const name = file.replace(/\.js$/, "");
    lines.push(`- /api/${name}`);
  }
  return lines.join("\n");
}

function readDbTables(dbPath: string): string {
  if (!fs.existsSync(dbPath)) return "";
  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    db.close();
    if (tables.length === 0) return "";
    return tables.map((t: { name: string }) => `- ${t.name}`).join("\n");
  } catch { return ""; }
}
