import { useState, useEffect, useRef } from "react";
import { readFile, deleteFile } from "@/api";
import { FileCode, Download, Trash2, Image, FileText } from "lucide-react";
import Prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";

const LANG_MAP: Record<string, { prism: string; label: string }> = {
  html: { prism: "markup", label: "HTML" },
  htm: { prism: "markup", label: "HTML" },
  css: { prism: "css", label: "CSS" },
  js: { prism: "javascript", label: "JS" },
  mjs: { prism: "javascript", label: "JS" },
  ts: { prism: "typescript", label: "TS" },
  json: { prism: "json", label: "JSON" },
  sql: { prism: "sql", label: "SQL" },
  sh: { prism: "bash", label: "Shell" },
  md: { prism: "markdown", label: "MD" },
  txt: { prism: "", label: "Text" },
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);

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
  const langInfo = LANG_MAP[ext] ?? { prism: "", label: ext.toUpperCase() || "File" };

  useEffect(() => {
    if (isImage) { setLoading(false); return; }
    setLoading(true);
    readFile(tenantId, filePath)
      .then(setContent)
      .catch(() => setContent("Failed to load file"))
      .finally(() => setLoading(false));
  }, [tenantId, filePath, isImage]);

  // Syntax highlighting
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

  const fileName = filePath.split("/").pop() ?? filePath;
  const Icon = isImage ? Image : langInfo.prism ? FileCode : FileText;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-300">Loading...</div>
        ) : isImage ? (
          <div className="flex items-center justify-center h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjBmMGYwIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmMGYwZjAiLz48L3N2Zz4=')] p-8">
            <img
              src={`/api/tenants/${tenantId}/files/${filePath}`}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded shadow-lg"
            />
          </div>
        ) : (
          <div className="flex text-[13px] font-mono leading-relaxed">
            <div className="py-3 px-3 text-right text-gray-300 select-none border-r border-gray-100 bg-gray-50/50 flex-shrink-0 text-[12px]">
              {content.split("\n").map((_, i) => (
                <div key={i} className="leading-relaxed">{i + 1}</div>
              ))}
            </div>
            <pre className="py-3 px-4 flex-1 whitespace-pre-wrap break-words overflow-x-auto m-0">
              <code
                ref={codeRef}
                className={langInfo.prism ? `language-${langInfo.prism}` : ""}
              >
                {content}
              </code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
