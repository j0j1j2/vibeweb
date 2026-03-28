import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { listFiles } from "@/api";
import { useChatContext } from "@/components/ChatLayout";
import { FileText, RefreshCw, ExternalLink } from "lucide-react";

export function PreviewPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { subdomain } = useChatContext();
  const [pages, setPages] = useState<{ name: string; path: string }[]>([]);
  const [selectedPage, setSelectedPage] = useState("index.html");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    listFiles(tenantId).then((data) => {
      const htmlPages = (data.files ?? [])
        .filter((f: { path: string }) => f.path.startsWith("public/") && f.path.endsWith(".html"))
        .map((f: { path: string }) => ({ name: f.path.replace("public/", ""), path: f.path }));
      setPages(htmlPages);
    }).catch(() => {});
  }, [tenantId]);

  const previewUrl = subdomain
    ? `http://${subdomain}.vibeweb.localhost/${selectedPage === "index.html" ? "" : selectedPage}?preview=true`
    : "";

  const handleRefresh = () => { if (iframeRef.current && previewUrl) iframeRef.current.src = previewUrl; };

  if (!subdomain) return <div className="flex items-center justify-center h-full text-gray-300">Loading...</div>;

  return (
    <div className="flex h-full">
      {/* Page list — hidden when only 1 page */}
      {pages.length !== 1 && (
        <div className="w-[140px] border-r border-gray-100 bg-gray-50/30 overflow-y-auto flex-shrink-0">
          <div className="px-3 py-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Pages</div>
            {pages.map((p) => (
              <button
                key={p.path}
                onClick={() => setSelectedPage(p.name)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[13px] text-left transition-colors ${
                  selectedPage === p.name
                    ? "bg-violet-50 text-violet-700 font-medium"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
            {pages.length === 0 && <div className="px-2 text-[12px] text-gray-300">No pages</div>}
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
            <div className="w-2 h-2 rounded-full bg-emerald-400/80" />
            <span className="text-[11px] text-gray-400 font-mono truncate">{previewUrl}</span>
          </div>
          <button onClick={handleRefresh} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <iframe ref={iframeRef} src={previewUrl} className="flex-1 w-full border-0 bg-white" title="Preview" />
      </div>
    </div>
  );
}
