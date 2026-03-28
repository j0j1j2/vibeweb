import { useState, useEffect } from "react";
import { readFile, deleteFile } from "@/api";
import { FileCode, Download, Trash2, Image, FileText } from "lucide-react";

const LANG_MAP: Record<string, string> = {
  html: "HTML", htm: "HTML", xml: "XML", svg: "SVG",
  css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
  js: "JS", mjs: "JS", cjs: "JS", jsx: "JSX",
  ts: "TS", tsx: "TSX", json: "JSON", sql: "SQL",
  sh: "Shell", bash: "Bash", zsh: "Zsh", env: "Env",
  py: "Python", rb: "Ruby", java: "Java", kt: "Kotlin",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++",
  cs: "C#", go: "Go", rs: "Rust", swift: "Swift", dart: "Dart",
  php: "PHP", pl: "Perl", lua: "Lua", r: "R",
  yaml: "YAML", yml: "YAML", toml: "TOML", ini: "INI",
  md: "MD", mdx: "MDX", txt: "Text", log: "Log",
  diff: "Diff", dockerfile: "Docker", makefile: "Make",
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif"]);

// Simple keyword-based syntax highlighting (no external deps)
function highlightCode(code: string, ext: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escaped = esc(code);

  // No highlighting for plain text
  if (!ext || ["txt", "log", "csv"].includes(ext)) return escaped;

  let result = escaped;

  // Strings
  result = result.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, '<span class="hl-string">$&</span>');

  // Comments (// and /* */ and # and <!-- -->)
  result = result.replace(/(\/\/.*$)/gm, '<span class="hl-comment">$1</span>');
  result = result.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');
  result = result.replace(/(#[^!].*$)/gm, '<span class="hl-comment">$1</span>');
  result = result.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>');

  // HTML tags
  if (["html", "htm", "xml", "svg", "jsx", "tsx"].includes(ext)) {
    result = result.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="hl-tag">$2</span>');
    result = result.replace(/\b([\w-]+)(?==)/g, '<span class="hl-attr">$1</span>');
  }

  // Keywords
  const keywords = "const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|import|export|from|default|async|await|try|catch|throw|new|this|typeof|instanceof|in|of|true|false|null|undefined|void|yield|static|extends|implements|interface|type|enum|public|private|protected|readonly|abstract|super|def|self|None|True|False|print|lambda|with|as|elif|except|finally|raise|pass|and|or|not|is|struct|impl|fn|pub|mod|use|crate|mut|ref|match|loop|move|trait|where|dyn|CREATE|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|ON|INTO|VALUES|TABLE|INDEX|DROP|ALTER|SET|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES";
  result = result.replace(new RegExp(`\\b(${keywords})\\b`, "g"), '<span class="hl-keyword">$&</span>');

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$&</span>');

  // CSS properties
  if (["css", "scss", "sass", "less"].includes(ext)) {
    result = result.replace(/([\w-]+)(?=\s*:)/g, '<span class="hl-property">$1</span>');
  }

  return result;
}

function getLangLabel(filePath: string): string {
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  if (LANG_MAP[ext]) return LANG_MAP[ext];
  const name = (filePath.split("/").pop() ?? "").toLowerCase();
  if (name === "dockerfile") return "Docker";
  if (name === "makefile") return "Make";
  return ext.toUpperCase() || "File";
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

  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const label = getLangLabel(filePath);

  useEffect(() => {
    if (isImage) { setLoading(false); return; }
    setLoading(true);
    readFile(tenantId, filePath)
      .then(setContent)
      .catch(() => setContent("Failed to load file"))
      .finally(() => setLoading(false));
  }, [tenantId, filePath, isImage]);

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
    try { await deleteFile(tenantId, filePath); onDeleted?.(); }
    catch { alert("Failed to delete file"); }
    finally { setDeleting(false); }
  };

  const Icon = isImage ? Image : (ext && ext !== "txt") ? FileCode : FileText;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="font-mono text-[13px] text-gray-600 truncate">{filePath}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-gray-400 uppercase font-medium tracking-wider bg-gray-50 px-2 py-0.5 rounded">{label}</span>
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
              {content.split("\n").map((_, i) => (<div key={i} className="leading-relaxed">{i + 1}</div>))}
            </div>
            <pre className="py-3 px-4 flex-1 whitespace-pre-wrap break-words overflow-x-auto m-0 text-gray-700">
              <code>{content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
