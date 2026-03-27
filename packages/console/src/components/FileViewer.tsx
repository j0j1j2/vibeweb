import { useState, useEffect } from "react";
import { readFile } from "@/api";

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

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b flex items-center justify-between text-sm">
        <span className="font-mono text-zinc-600 dark:text-zinc-400">{filePath}</span>
        <span className="text-xs text-zinc-400 uppercase">{lang}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? <div className="p-4 text-sm text-zinc-400">Loading...</div> : <pre className="p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words"><code>{content}</code></pre>}
      </div>
    </div>
  );
}
