import { useState, useEffect, useRef } from "react";
import { readFile, deleteFile } from "@/api";
import { FileCode, Download, Trash2, Image, FileText } from "lucide-react";
import Prism from "prismjs";

// Load all common Prism languages
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-shell-session";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-nginx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-scala";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-php";
import "prismjs/components/prism-perl";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-r";
import "prismjs/components/prism-graphql";
import "prismjs/components/prism-regex";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-sass";
import "prismjs/components/prism-less";
import "prismjs/components/prism-stylus";
import "prismjs/components/prism-pug";
import "prismjs/components/prism-handlebars";
import "prismjs/components/prism-ejs";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-git";
import "prismjs/components/prism-csv";
import "prismjs/components/prism-xml-doc";
import "prismjs/components/prism-latex";
import "prismjs/components/prism-makefile";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-elixir";
import "prismjs/components/prism-haskell";
import "prismjs/components/prism-clojure";
import "prismjs/components/prism-scheme";
import "prismjs/components/prism-lisp";
import "prismjs/components/prism-ocaml";
import "prismjs/components/prism-erlang";
import "prismjs/components/prism-zig";
import "prismjs/components/prism-wasm";
import "prismjs/components/prism-solidity";
import "prismjs/components/prism-protobuf";

const LANG_MAP: Record<string, { prism: string; label: string }> = {
  // Web
  html: { prism: "markup", label: "HTML" },
  htm: { prism: "markup", label: "HTML" },
  xml: { prism: "markup", label: "XML" },
  svg: { prism: "markup", label: "SVG" },
  css: { prism: "css", label: "CSS" },
  scss: { prism: "scss", label: "SCSS" },
  sass: { prism: "sass", label: "Sass" },
  less: { prism: "less", label: "Less" },
  styl: { prism: "stylus", label: "Stylus" },
  js: { prism: "javascript", label: "JS" },
  mjs: { prism: "javascript", label: "JS" },
  cjs: { prism: "javascript", label: "JS" },
  jsx: { prism: "jsx", label: "JSX" },
  ts: { prism: "typescript", label: "TS" },
  tsx: { prism: "tsx", label: "TSX" },
  json: { prism: "json", label: "JSON" },
  // Templates
  pug: { prism: "pug", label: "Pug" },
  hbs: { prism: "handlebars", label: "HBS" },
  ejs: { prism: "ejs", label: "EJS" },
  // Data
  yaml: { prism: "yaml", label: "YAML" },
  yml: { prism: "yaml", label: "YAML" },
  toml: { prism: "toml", label: "TOML" },
  ini: { prism: "ini", label: "INI" },
  csv: { prism: "csv", label: "CSV" },
  sql: { prism: "sql", label: "SQL" },
  graphql: { prism: "graphql", label: "GraphQL" },
  gql: { prism: "graphql", label: "GraphQL" },
  proto: { prism: "protobuf", label: "Proto" },
  // Shell
  sh: { prism: "bash", label: "Shell" },
  bash: { prism: "bash", label: "Bash" },
  zsh: { prism: "bash", label: "Zsh" },
  fish: { prism: "bash", label: "Fish" },
  ps1: { prism: "powershell", label: "PS" },
  // Systems
  py: { prism: "python", label: "Python" },
  rb: { prism: "ruby", label: "Ruby" },
  java: { prism: "java", label: "Java" },
  kt: { prism: "kotlin", label: "Kotlin" },
  kts: { prism: "kotlin", label: "Kotlin" },
  scala: { prism: "scala", label: "Scala" },
  c: { prism: "c", label: "C" },
  h: { prism: "c", label: "C" },
  cpp: { prism: "cpp", label: "C++" },
  cc: { prism: "cpp", label: "C++" },
  cxx: { prism: "cpp", label: "C++" },
  hpp: { prism: "cpp", label: "C++" },
  cs: { prism: "csharp", label: "C#" },
  go: { prism: "go", label: "Go" },
  rs: { prism: "rust", label: "Rust" },
  swift: { prism: "swift", label: "Swift" },
  dart: { prism: "dart", label: "Dart" },
  php: { prism: "php", label: "PHP" },
  pl: { prism: "perl", label: "Perl" },
  lua: { prism: "lua", label: "Lua" },
  r: { prism: "r", label: "R" },
  zig: { prism: "zig", label: "Zig" },
  sol: { prism: "solidity", label: "Solidity" },
  wasm: { prism: "wasm", label: "WASM" },
  // Functional
  ex: { prism: "elixir", label: "Elixir" },
  exs: { prism: "elixir", label: "Elixir" },
  hs: { prism: "haskell", label: "Haskell" },
  clj: { prism: "clojure", label: "Clojure" },
  scm: { prism: "scheme", label: "Scheme" },
  lisp: { prism: "lisp", label: "Lisp" },
  ml: { prism: "ocaml", label: "OCaml" },
  erl: { prism: "erlang", label: "Erlang" },
  // Config / DevOps
  dockerfile: { prism: "docker", label: "Docker" },
  nginx: { prism: "nginx", label: "Nginx" },
  conf: { prism: "nginx", label: "Conf" },
  makefile: { prism: "makefile", label: "Make" },
  mk: { prism: "makefile", label: "Make" },
  // Docs
  md: { prism: "markdown", label: "MD" },
  mdx: { prism: "markdown", label: "MDX" },
  tex: { prism: "latex", label: "LaTeX" },
  // Other
  diff: { prism: "diff", label: "Diff" },
  patch: { prism: "diff", label: "Patch" },
  gitignore: { prism: "git", label: "Git" },
  txt: { prism: "", label: "Text" },
  log: { prism: "", label: "Log" },
  env: { prism: "bash", label: "Env" },
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"]);

function getLangInfo(filePath: string): { prism: string; label: string } {
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  if (LANG_MAP[ext]) return LANG_MAP[ext];
  // Check filename (e.g. Dockerfile, Makefile)
  const name = (filePath.split("/").pop() ?? "").toLowerCase();
  if (name === "dockerfile") return LANG_MAP.dockerfile;
  if (name === "makefile") return LANG_MAP.makefile;
  if (name === ".gitignore") return LANG_MAP.gitignore;
  if (name === ".env" || name.startsWith(".env.")) return LANG_MAP.env;
  return { prism: "", label: ext.toUpperCase() || "File" };
}

export function FileViewer({
  tenantId,
  filePath,
  onDeleted,
}: {
  tenantId: string;
  filePath: string;
  onDeleted?: () => void;
}) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const langInfo = getLangInfo(filePath);

  useEffect(() => {
    if (isImage) { setLoading(false); return; }
    setLoading(true);
    readFile(tenantId, filePath)
      .then(setContent)
      .catch(() => setContent("Failed to load file"))
      .finally(() => setLoading(false));
  }, [tenantId, filePath, isImage]);

  useEffect(() => {
    if (!loading && codeRef.current && langInfo.prism) {
      Prism.highlightElement(codeRef.current);
    }
  }, [loading, content, langInfo.prism]);

  const handleDownload = () => {
    if (isImage) {
      const a = document.createElement("a");
      a.href = `/api/tenants/${tenantId}/files/${filePath}`;
      a.download = filePath.split("/").pop() || "file";
      a.click();
      return;
    }
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filePath.split("/").pop() || "file";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${filePath}?`)) return;
    setDeleting(true);
    try {
      await deleteFile(tenantId, filePath);
      onDeleted?.();
    } catch {
      alert("Failed to delete file");
    } finally {
      setDeleting(false);
    }
  };

  const Icon = isImage ? Image : langInfo.prism ? FileCode : FileText;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-mono text-[13px] text-gray-600 truncate">{filePath}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-gray-400 uppercase font-medium tracking-wider bg-gray-50 px-2 py-0.5 rounded">
            {langInfo.label}
          </span>
          <button onClick={handleDownload} title="Download" className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDelete} disabled={deleting} title="Delete" className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-300">Loading...</div>
        ) : isImage ? (
          <div className="flex items-center justify-center h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjBmMGYwIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmMGYwZjAiLz48L3N2Zz4=')] p-8">
            <img src={`/api/tenants/${tenantId}/files/${filePath}`} alt={filePath.split("/").pop() ?? ""} className="max-w-full max-h-full object-contain rounded shadow-lg" />
          </div>
        ) : (
          <div className="flex text-[13px] font-mono leading-relaxed">
            <div className="py-3 px-3 text-right text-gray-300 select-none border-r border-gray-100 bg-gray-50/50 flex-shrink-0 text-[12px]">
              {content.split("\n").map((_, i) => (
                <div key={i} className="leading-relaxed">{i + 1}</div>
              ))}
            </div>
            <pre className="py-3 px-4 flex-1 whitespace-pre-wrap break-words overflow-x-auto m-0">
              <code ref={codeRef} className={langInfo.prism ? `language-${langInfo.prism}` : ""}>{content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
