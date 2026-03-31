import { useState, useEffect } from "react";
import { readFile, deleteFile, uploadFile } from "@/api";
import { FileCode, Download, Trash2, Image, FileText, Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const [loadError, setLoadError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { t } = useTranslation();

  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const label = getLangLabel(filePath);

  useEffect(() => {
    if (isImage) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    readFile(tenantId, filePath)
      .then(setContent)
      .catch(() => setLoadError(true))
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

  const handleEdit = () => {
    setEditContent(content);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditContent("");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await uploadFile(tenantId, filePath, editContent);
      setContent(editContent);
      setEditing(false);
      setEditContent("");
    } catch {
      setSaveError(t("files.failedSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try { await deleteFile(tenantId, filePath); onDeleted?.(); }
    catch { setDeleteError(t("files.failedDelete")); setShowDeleteConfirm(false); }
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
          {saveError && <span className="text-[11px] text-red-500">{saveError}</span>}
          {deleteError && <span className="text-[11px] text-red-500">{deleteError}</span>}
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} className="px-2 py-0.5 rounded text-[12px] font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors">
                {saving ? t("common.saving") : t("common.save")}
              </button>
              <button onClick={handleCancelEdit} disabled={saving} title={t("files.cancelEdit")} aria-label={t("files.cancelEdit")} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : showDeleteConfirm ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-600 text-xs">{t("files.confirmDelete")}</span>
              <button onClick={handleDelete} disabled={deleting} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50">{t("common.yes")}</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300 transition-colors">{t("common.no")}</button>
            </div>
          ) : (
            <>
              {!isImage && (
                <button onClick={handleEdit} title={t("files.editFile")} aria-label={t("files.editFile")} className="p-1 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={handleDownload} title={t("files.downloadFile")} aria-label={t("files.downloadFile")} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} title={t("files.deleteFile")} aria-label={t("files.deleteFile")} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-300">{t("common.loading")}</div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <p className="text-sm text-red-500 font-medium">{t("files.failedLoad")}</p>
            <button
              onClick={() => {
                setLoadError(false);
                setLoading(true);
                readFile(tenantId, filePath)
                  .then(setContent)
                  .catch(() => setLoadError(true))
                  .finally(() => setLoading(false));
              }}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : isImage ? (
          <div className="flex items-center justify-center h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjBmMGYwIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmMGYwZjAiLz48L3N2Zz4=')] p-8">
            <img src={`/api/tenants/${tenantId}/files/${filePath}`} alt={filePath.split("/").pop() ?? ""} className="max-w-full max-h-full object-contain rounded shadow-lg" />
          </div>
        ) : editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full resize-none font-mono text-[13px] text-gray-700 p-4 focus:outline-none bg-white leading-relaxed"
            spellCheck={false}
          />
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
