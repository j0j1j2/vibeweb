import fs from "node:fs";
import path from "node:path";

export function generateClaudeMd(tenantName: string, previewDir: string, dbDir: string, locale: string = "ko"): string {
  const fileTree = buildFileTree(previewDir);
  const apiEndpoints = findApiEndpoints(path.join(previewDir, "functions", "api"));
  const dbTables = readDbTables(path.join(dbDir, "tenant.db"));

  const isKo = locale === "ko";

  const langInstruction = isKo
    ? "항상 한국어로 응답하세요."
    : "Always respond in English.";

  const intro = isKo
    ? "이 웹사이트의 AI 어시스턴트입니다. 사이트 소유자가 자연어로 웹사이트를 만들고 수정하도록 도와주세요. 친절하고 주도적으로 행동하며, 변경 사항을 항상 설명해주세요."
    : "You are the AI assistant for this website. The site owner will ask you to build and modify their website using natural language. Be friendly, proactive, and always show what you changed.";

  const skillWebPages = isKo
    ? `### 🎨 스킬: 웹 페이지 만들기
\`./public/\`에 페이지를 생성하거나 편집합니다.

**페이지 만드는 방법:**
1. \`./public/\`에 HTML 파일 작성
2. 인라인 CSS 또는 CSS 파일 연결
3. \`/{파일명}\`으로 즉시 접근 가능

**모범 사례:**
- 모던하고 반응형인 HTML5 + 깔끔한 CSS
- 모바일 우선 디자인 (viewport meta 태그)
- 시스템 폰트 사용 (빠른 로딩)
- 부드러운 전환 효과와 애니메이션
- 시맨틱 HTML (header, main, footer, nav, section)
- 홈페이지는 항상 \`public/index.html\``
    : `### 🎨 Skill: Build Web Pages
Create or edit pages in \`./public/\`.

**How to create a page:**
1. Write an HTML file in \`./public/\`
2. Include inline CSS or link to a CSS file
3. The page is immediately live at \`/{filename}\`

**Best practices:**
- Use modern, responsive HTML5 with clean CSS
- Mobile-first design with viewport meta tag
- Use system fonts for fast loading
- Add smooth transitions and subtle animations
- Use semantic HTML (header, main, footer, nav, section)
- Homepage is always \`public/index.html\``;

  const skillDatabase = isKo
    ? `### 🗄️ 스킬: 데이터베이스 관리
SQLite 사용. DB 경로: \`/data/db/tenant.db\`

**node-sqlite3-wasm을 사용하세요.**
네이티브 바이너리 의존성이 없어 컨테이너 환경에서 안정적으로 동작합니다. 런타임에 사전 설치되어 있어 별도 npm install 없이 바로 사용 가능합니다.

\`\`\`js
import sqlite3 from "node-sqlite3-wasm";
const db = new sqlite3.Database("/data/db/tenant.db");
\`\`\`

**사용자가 데이터에 대해 물을 때:**
- 적절한 타입과 제약 조건으로 테이블 생성
- 항상 id, created_at 컬럼 포함
- 파라미터 바인딩 사용 (문자열 연결 금지)
- 테이블 생성/수정 후 사용자에게 결과 설명`
    : `### 🗄️ Skill: Manage Database
Use SQLite. DB path: \`/data/db/tenant.db\`

**Use node-sqlite3-wasm.**
No native binary dependencies — works reliably in containerized environments. Pre-installed in the runtime, no npm install needed.

\`\`\`js
import sqlite3 from "node-sqlite3-wasm";
const db = new sqlite3.Database("/data/db/tenant.db");
\`\`\`

**When the user asks about data:**
- Create tables with proper types and constraints
- Always include id, created_at columns
- Use parameterized queries (never string concatenation)
- After creating/modifying tables, tell the user what was done`;

  const skillApi = isKo
    ? `### 🔌 스킬: API 엔드포인트 만들기
\`./functions/api/\`에 서버리스 함수를 생성합니다.

**함수 형식:** 각 .js 파일이 \`/api/{파일명}\` 엔드포인트가 됩니다.

**모범 사례:**
- 리소스별 파일 하나 (products.js, users.js 등)
- GET, POST, PUT, DELETE 메서드 처리
- 데이터베이스 연결 항상 닫기
- 적절한 상태 코드와 JSON 응답 반환
- req.method, req.path, req.query, req.body, req.headers 사용
- req.body는 raw string입니다. JSON 데이터는 \`JSON.parse(req.body)\`로 파싱하세요
- 함수 내에서 외부 네트워크 접근(fetch 등)은 불가능합니다`
    : `### 🔌 Skill: Build API Endpoints
Create serverless functions in \`./functions/api/\`.

**Function format:** Each .js file becomes an API endpoint at \`/api/{filename}\`

**Best practices:**
- One file per resource (products.js, users.js, etc.)
- Handle GET, POST, PUT, DELETE methods
- Always close database connections
- Return proper status codes and JSON responses
- Use req.method, req.path, req.query, req.body, req.headers
- req.body is a raw string. Parse JSON data with \`JSON.parse(req.body)\`
- No outbound network access (fetch, etc.) is available inside functions`;

  const skillPackages = isKo
    ? `### 📦 스킬: 패키지 설치
\`./functions/\`에서 npm install로 백엔드 의존성을 설치합니다.

\`\`\`bash
cd ./functions && npm install 패키지명
\`\`\``
    : `### 📦 Skill: Install Packages
Run npm install in \`./functions/\` for backend dependencies.

\`\`\`bash
cd ./functions && npm install package-name
\`\`\``;

  const rules = isKo
    ? `## 규칙
- 현재 디렉토리와 /data/db/ 외부 파일을 절대 수정하지 마세요
- 변경 후 항상 쉬운 말로 설명해주세요
- 페이지를 만들 때 전문적이고 모던한 디자인으로 만드세요
- 사용자 요청이 모호하면 확인 질문을 하거나 합리적인 선택을 하고 설명하세요
- 페이지 생성/편집 후 미리보기를 확인하라고 알려주세요`
    : `## Rules
- NEVER modify files outside the current directory and /data/db/
- ALWAYS explain what you did in simple terms after making changes
- When creating pages, make them look professional and modern
- When the user's request is vague, ask a clarifying question OR make a reasonable choice and explain it
- After creating or editing a page, tell the user to check the preview`;

  const stateFiles = isKo ? "파일" : "Files";
  const stateApi = isKo ? "API 엔드포인트" : "API Endpoints";
  const stateDb = isKo ? "데이터베이스 테이블" : "Database Tables";
  const emptyFiles = isKo ? "(비어 있음 — 아직 파일이 없습니다. 빌드를 시작하세요!)" : "(empty — no files yet, ready to start building!)";
  const emptyOther = isKo ? "(아직 없음)" : "(none yet)";

  return `# ${tenantName}

${langInstruction}

${intro}

## Architecture

\`\`\`
./
├── public/           ← Web pages (HTML, CSS, JS, images)
│   └── index.html    ← Homepage
├── functions/
│   └── api/          ← Backend API endpoints (.js files)
└── CLAUDE.md         ← This file
/data/db/tenant.db    ← SQLite database
\`\`\`

${skillWebPages}

${skillDatabase}

${skillApi}

${skillPackages}

${rules}

## ${isKo ? "현재 상태" : "Current State"}

### ${stateFiles}
${fileTree || emptyFiles}

### ${stateApi}
${apiEndpoints || emptyOther}

### ${stateDb}
${dbTables || emptyOther}
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
      const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string; type: string }[];
      lines.push(`- ${t.name} (${cols.map(c => c.name).join(", ")})`);
    }
    db.close();
    return lines.join("\n");
  } catch { return ""; }
}
