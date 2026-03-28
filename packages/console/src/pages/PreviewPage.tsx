import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { listFiles } from "@/api";
import { useChatContext } from "@/components/ChatLayout";
import { FileText, RefreshCw, ExternalLink, Sparkles } from "lucide-react";

export function PreviewPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { subdomain } = useChatContext();
  const [pages, setPages] = useState<{ name: string; path: string }[]>([]);
  const [selectedPage, setSelectedPage] = useState("index.html");
  const [hasContent, setHasContent] = useState<boolean | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!tenantId) return;
    listFiles(tenantId).then((data) => {
      const files = data.files ?? [];
      const htmlPages = files
        .filter((f: { path: string }) => f.path.startsWith("public/") && f.path.endsWith(".html"))
        .map((f: { path: string }) => ({ name: f.path.replace("public/", ""), path: f.path }));
      setPages(htmlPages);
      setHasContent(files.length > 0);
    }).catch(() => setHasContent(false));
  }, [tenantId]);

  const previewUrl = subdomain
    ? `http://${subdomain}.vibeweb.localhost/${selectedPage === "index.html" ? "" : selectedPage}?preview=true`
    : "";

  const handleRefresh = () => {
    if (iframeRef.current && previewUrl) iframeRef.current.src = previewUrl;
    // Also re-check files (might have new pages)
    if (tenantId) {
      listFiles(tenantId).then((data) => {
        const files = data.files ?? [];
        const htmlPages = files
          .filter((f: { path: string }) => f.path.startsWith("public/") && f.path.endsWith(".html"))
          .map((f: { path: string }) => ({ name: f.path.replace("public/", ""), path: f.path }));
        setPages(htmlPages);
        setHasContent(files.length > 0);
      }).catch(() => {});
    }
  };

  // Auto-refresh when Claude finishes a turn
  useEffect(() => {
    const handler = () => {
      if (iframeRef.current) {
        // Force reload by appending cache-bust
        const url = `http://${subdomain}.vibeweb.localhost/${selectedPage === "index.html" ? "" : selectedPage}?preview=true&_t=${Date.now()}`;
        iframeRef.current.src = url;
      }
      if (tenantId) {
        listFiles(tenantId).then((data) => {
          const files = data.files ?? [];
          setPages(files.filter((f: { path: string }) => f.path.startsWith("public/") && f.path.endsWith(".html")).map((f: { path: string }) => ({ name: f.path.replace("public/", ""), path: f.path })));
          setHasContent(files.length > 0);
        }).catch(() => {});
      }
    };
    window.addEventListener("vibeweb:preview-refresh", handler);
    return () => window.removeEventListener("vibeweb:preview-refresh", handler);
  }, [subdomain, selectedPage, tenantId]);

  if (!subdomain) return <div className="flex items-center justify-center h-full text-gray-300">Loading...</div>;

  // New site with no content — show welcome screen (also during loading to avoid flash of 404)
  if (hasContent !== true) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to your site!</h2>
        <p className="text-gray-400 max-w-md mb-4">
          Use the chat on the right to start building. Just describe what you want and AI will create it for you.
        </p>
        <div className="flex items-center gap-2 text-sm text-violet-600">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
          </span>
          Try the suggestions in the chat panel →
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Page list — hidden when 0 or 1 page */}
      {pages.length > 1 && (
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
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
            <div className="w-2 h-2 rounded-full bg-emerald-400/80" />
            <span className="text-[11px] text-gray-400 font-mono truncate">{subdomain}.vibeweb.site</span>
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
