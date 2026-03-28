import fs from "node:fs";
import path from "node:path";

export function generateClaudeMd(tenantName: string, previewDir: string, dbDir: string): string {
  const fileTree = buildFileTree(previewDir);
  const apiEndpoints = findApiEndpoints(path.join(previewDir, "functions", "api"));
  const dbTables = readDbTables(path.join(dbDir, "tenant.db"));

  return `# ${tenantName}

You are the AI assistant for this website. The site owner will ask you to build and modify their website using natural language. Be friendly, proactive, and always show what you changed.

## Architecture

\`\`\`
/workspace/
├── public/           ← Web pages (HTML, CSS, JS, images)
│   └── index.html    ← Homepage
├── functions/
│   └── api/          ← Backend API endpoints (.js files)
└── CLAUDE.md         ← This file
/data/db/tenant.db    ← SQLite database
\`\`\`

## Skills

### 🎨 Skill: Build Web Pages
Create or edit pages in \`/workspace/public/\`.

**How to create a page:**
1. Write an HTML file in \`/workspace/public/\`
2. Include inline CSS or link to a CSS file
3. The page is immediately live at \`/{filename}\`

**Best practices:**
- Use modern, responsive HTML5 with clean CSS
- Mobile-first design with viewport meta tag
- Use system fonts for fast loading
- Add smooth transitions and subtle animations
- Use semantic HTML (header, main, footer, nav, section)
- Homepage is always \`public/index.html\`

**Example — create a page:**
\`\`\`
Write file: /workspace/public/about.html
→ Accessible at: /about.html
\`\`\`

### 🗄️ Skill: Manage Database
Use SQLite via better-sqlite3. DB path: \`/data/db/tenant.db\`

**How to use:**
\`\`\`javascript
const Database = require('better-sqlite3');
const db = new Database('/data/db/tenant.db');

// Create table
db.exec(\`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL,
  created_at TEXT DEFAULT (datetime('now'))
)\`);

// Insert
db.prepare('INSERT INTO products (name, price) VALUES (?, ?)').run('Coffee', 4.50);

// Query
const rows = db.prepare('SELECT * FROM products').all();
db.close();
\`\`\`

**When the user asks about data:**
- Create tables with proper types and constraints
- Always include id, created_at columns
- Use parameterized queries (never string concatenation)
- After creating/modifying tables, tell the user what was done

### 🔌 Skill: Build API Endpoints
Create serverless functions in \`/workspace/functions/api/\`.

**Function format:** Each .js file becomes an API endpoint at \`/api/{filename}\`

\`\`\`javascript
// /workspace/functions/api/products.js → accessible at /api/products
const Database = require('better-sqlite3');

export default async function(req) {
  const db = new Database('/data/db/tenant.db');

  if (req.method === 'GET') {
    const products = db.prepare('SELECT * FROM products').all();
    db.close();
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(products)
    };
  }

  if (req.method === 'POST') {
    const { name, price } = JSON.parse(req.body);
    db.prepare('INSERT INTO products (name, price) VALUES (?, ?)').run(name, price);
    db.close();
    return {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  }

  return { status: 405, body: 'Method not allowed' };
}
\`\`\`

**Best practices:**
- One file per resource (products.js, users.js, etc.)
- Handle GET, POST, PUT, DELETE methods
- Always close database connections
- Return proper status codes and JSON responses
- Use req.method, req.query, req.body, req.headers

### 📦 Skill: Install Packages
Run npm install in \`/workspace/functions/\` for backend dependencies.

\`\`\`bash
cd /workspace/functions && npm install package-name
\`\`\`

## Rules
- NEVER modify files outside /workspace and /data/db/
- ALWAYS explain what you did in simple terms after making changes
- When creating pages, make them look professional and modern
- When the user's request is vague, ask a clarifying question OR make a reasonable choice and explain it
- After creating or editing a page, tell the user to check the preview

## Current State

### Files
${fileTree || "(empty — no files yet, ready to start building!)"}

### API Endpoints
${apiEndpoints || "(none yet)"}

### Database Tables
${dbTables || "(none yet)"}
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
    if (tables.length === 0) { db.close(); return ""; }
    const lines: string[] = [];
    for (const t of tables) {
      const cols = db.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string; type: string }[];
      lines.push(`- ${t.name} (${cols.map(c => c.name).join(", ")})`);
    }
    db.close();
    return lines.join("\n");
  } catch { return ""; }
}
