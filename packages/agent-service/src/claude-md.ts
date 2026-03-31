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
- Add smooth transitions and subtle animations
- Use semantic HTML (header, main, footer, nav, section)
- Homepage is always \`public/index.html\``;

  const skillFrontendDesign = isKo
    ? `### ✨ 스킬: 프론트엔드 디자인
코딩 전에 맥락을 파악하고 **대담한** 미적 방향을 정하세요:
- **목적**: 이 인터페이스가 해결하는 문제는? 사용자는 누구?
- **톤**: 극단을 선택: 미니멀, 맥시멀리스트, 레트로-퓨처리스틱, 유기적/자연적, 럭셔리, 플레이풀, 에디토리얼, 브루탈리스트, 아트데코, 소프트/파스텔, 인더스트리얼 등
- **차별화**: 무엇이 이것을 잊을 수 없게 만드는가?

**미학 가이드라인:**
- **타이포그래피**: 아름답고 독특한 폰트. Arial, Inter 같은 제네릭 폰트 금지. 개성 있는 디스플레이 폰트 + 세련된 본문 폰트 조합
- **색상 & 테마**: CSS 변수로 일관성. 지배적인 색상 + 날카로운 악센트 > 소심하게 분산된 팔레트
- **모션**: 애니메이션과 마이크로 인터랙션. CSS-only 우선. 페이지 로드 시 시차를 둔 등장(animation-delay), 스크롤 트리거, 놀라운 hover 상태
- **공간 구성**: 예상치 못한 레이아웃. 비대칭. 겹침. 대각선 흐름. 그리드를 깨는 요소
- **배경 & 시각적 디테일**: 단색 대신 분위기와 깊이. 그라데이션 메시, 노이즈 텍스처, 기하학적 패턴, 레이어드 투명도, 극적인 그림자

**절대 금지:** 남용된 폰트(Inter, Roboto, Arial, 시스템 폰트), 진부한 색상(흰 배경 보라색 그라데이션), 예측 가능한 레이아웃, 맥락 없는 쿠키커터 디자인

모든 디자인을 다르게. 라이트/다크 테마, 다른 폰트, 다른 미학을 번갈아. 대담하고 기억에 남는 작업물을 만드세요.`
    : `### ✨ Skill: Frontend Design
Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial, etc.
- **Differentiation**: What makes this UNFORGETTABLE?

**Aesthetics Guidelines:**
- **Typography**: Choose beautiful, unique fonts. Avoid generic fonts like Arial, Inter. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Animations and micro-interactions. CSS-only preferred. Staggered reveals on page load (animation-delay), scroll-triggering, surprising hover states.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth. Gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, grain overlays.

**NEVER**: Overused fonts (Inter, Roboto, Arial, system fonts), cliched color schemes (purple gradients on white), predictable layouts, cookie-cutter design lacking context-specific character.

Vary between light and dark themes, different fonts, different aesthetics across designs. Be bold and create memorable work.`;

  const skillDatabase = isKo
    ? `### 🗄️ 스킬: 데이터베이스 관리
SQLite 사용. DB 경로: \`/data/db/tenant.db\`

**node-sqlite3-wasm을 사용하세요.**
네이티브 바이너리 의존성이 없어 컨테이너 환경에서 안정적으로 동작합니다.
먼저 설치하세요: \`cd ./functions && npm install node-sqlite3-wasm\`

\`\`\`js
const sqlite3 = require("node-sqlite3-wasm");
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
No native binary dependencies — works reliably in containerized environments.
Install first: \`cd ./functions && npm install node-sqlite3-wasm\`

\`\`\`js
const sqlite3 = require("node-sqlite3-wasm");
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

\`\`\`js
// functions/api/hello.js
module.exports = async function(req) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { message: "Hello!" }
  };
};
\`\`\`

**모범 사례:**
- 리소스별 파일 하나 (products.js, users.js 등)
- GET, POST, PUT, DELETE 메서드 처리
- 데이터베이스 연결 항상 닫기
- 적절한 상태 코드와 JSON 응답 반환
- req.method, req.path, req.query, req.body, req.headers 사용
- req.body는 raw string입니다. JSON 데이터는 \`JSON.parse(req.body)\`로 파싱하세요
- 함수 내에서 외부 네트워크 접근(fetch 등)은 불가능합니다
- \`require()\`로 패키지를 불러오세요 (import 문 대신)
- 외부 패키지가 필요하면 \`cd ./functions && npm install 패키지명\`으로 먼저 설치하세요`
    : `### 🔌 Skill: Build API Endpoints
Create serverless functions in \`./functions/api/\`.

**Function format:** Each .js file becomes an API endpoint at \`/api/{filename}\`

\`\`\`js
// functions/api/hello.js
module.exports = async function(req) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { message: "Hello!" }
  };
};
\`\`\`

**Best practices:**
- One file per resource (products.js, users.js, etc.)
- Handle GET, POST, PUT, DELETE methods
- Always close database connections
- Return proper status codes and JSON responses
- Use req.method, req.path, req.query, req.body, req.headers
- req.body is a raw string. Parse JSON data with \`JSON.parse(req.body)\`
- No outbound network access (fetch, etc.) is available inside functions
- Use \`require()\` to import packages (not import statements)
- Install external packages first: \`cd ./functions && npm install package-name\``;

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

${skillFrontendDesign}

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
