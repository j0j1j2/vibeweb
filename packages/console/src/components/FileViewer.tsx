import { useState, useEffect } from "react";
import { readFile } from "@/api";
import { FileCode } from "lucide-react";

export function FileViewer({ tenantId, filePath }: { tenantId: string; filePath: string }) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    readFile(tenantId, filePath).then(setContent).catch(() => setContent("Failed to load file")).finally(() => setLoading(false));
  }, [tenantId, filePath]);

  const ext = filePath.split(".").pop() ?? "";
  const langMap: Record<string, string> = { html: "html", css: "css", js: "javascript", ts: "typescript", json: "json" };
  const lang = langMap[ext] ?? "text";

  const lines = content.split("\n");

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-gray-400" />
          <span className="font-mono text-[13px] text-gray-600">{filePath}</span>
        </div>
        <span className="text-[11px] text-gray-400 uppercase font-medium tracking-wider bg-gray-50 px-2 py-0.5 rounded">{lang}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-300">Loading...</div>
        ) : (
          <div className="flex text-[13px] font-mono leading-relaxed">
            <div className="py-4 px-3 text-right text-gray-300 select-none border-r border-gray-100 bg-gray-50/50 flex-shrink-0">
              {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <pre className="py-4 px-4 flex-1 whitespace-pre-wrap break-words text-gray-700">
              <code>{content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
