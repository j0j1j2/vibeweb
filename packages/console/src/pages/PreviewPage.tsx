import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { listFiles } from "@/api";
import { useChatContext } from "@/components/ChatLayout";
import { FileText, RefreshCw, ExternalLink, Sparkles, Plus, Pencil, Home, Trash2 } from "lucide-react";

export function PreviewPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { subdomain, connected, sendMessage } = useChatContext();
  const [pages, setPages] = useState<{ name: string; path: string }[]>([]);
  const [selectedPage, setSelectedPage] = useState("index.html");
  const [hasContent, setHasContent] = useState<boolean | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");

  const fetchPages = () => {
    if (!tenantId) return;
    listFiles(tenantId).then((data) => {
      const files = data.files ?? [];
      const htmlPages = files
        .filter((f: { path: string }) => f.path.startsWith("public/") && f.path.endsWith(".html"))
        .map((f: { path: string }) => ({ name: f.path.replace("public/", ""), path: f.path }));
      setPages(htmlPages);
      setHasContent(files.length > 0);
    }).catch(() => setHasContent(false));
  };

  useEffect(() => { fetchPages(); }, [tenantId]);

  const previewUrl = subdomain
    ? `http://${subdomain}.vibeweb.localhost/${selectedPage === "index.html" ? "" : selectedPage}?preview=true`
    : "";

  // Auto-refresh when Claude finishes a turn
  useEffect(() => {
    const handler = () => {
      if (iframeRef.current && subdomain) {
        iframeRef.current.src = `http://${subdomain}.vibeweb.localhost/${selectedPage === "index.html" ? "" : selectedPage}?preview=true&_t=${Date.now()}`;
      }
      fetchPages();
    };
    window.addEventListener("vibeweb:preview-refresh", handler);
    return () => window.removeEventListener("vibeweb:preview-refresh", handler);
  }, [subdomain, selectedPage, tenantId]);

  const handleAddPage = () => {
    if (!newPageName.trim()) return;
    const name = newPageName.trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    sendMessage(`Create a new page called "${name}" (${slug}.html) and add a link to it in the navigation menu of the homepage.`);
    setShowAddPage(false);
    setNewPageName("");
  };

  const handleEditPage = (pageName: string) => {
    sendMessage(`Edit the ${pageName === "index.html" ? "homepage" : pageName.replace(".html", "") + " page"}. What would you like to change?`);
  };

  if (!subdomain) return <div className="flex items-center justify-center h-full text-gray-300">Loading...</div>;

  // Welcome screen for new sites
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
      {/* Pages sidebar — always visible */}
      <div className="w-[160px] border-r border-gray-100 bg-gray-50/30 flex flex-col flex-shrink-0">
        <div className="px-3 py-3 flex-1 overflow-y-auto">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Pages</div>
          {pages.map((p) => (
            <div
              key={p.path}
              className={`group flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                selectedPage === p.name
                  ? "bg-violet-50 text-violet-700 font-medium"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <button
                onClick={() => setSelectedPage(p.name)}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              >
                {p.name === "index.html" ? <Home className="w-3.5 h-3.5 flex-shrink-0" /> : <FileText className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{p.name === "index.html" ? "Home" : p.name.replace(".html", "")}</span>
              </button>
              <button
                onClick={() => handleEditPage(p.name)}
                title="Edit this page"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-violet-600 transition-all"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          ))}
          {pages.length === 0 && (
            <p className="text-[12px] text-gray-300 px-2">No pages yet</p>
          )}
        </div>
        <div className="px-3 py-2 border-t border-gray-100">
          {showAddPage ? (
            <div className="flex flex-col gap-1.5">
              <input
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddPage(); if (e.key === "Escape") { setShowAddPage(false); setNewPageName(""); } }}
                placeholder="about, contact..."
                className="w-full px-2 py-1 text-[12px] border border-gray-200 rounded-md focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleAddPage}
                  className="flex-1 px-2 py-1 text-[12px] bg-violet-600 text-white rounded-md hover:bg-violet-500 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowAddPage(false); setNewPageName(""); }}
                  className="flex-1 px-2 py-1 text-[12px] bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddPage(true)}
              disabled={!connected}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[12px] text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Page
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1 bg-gray-50 rounded-md border border-gray-100">
            <div className="w-2 h-2 rounded-full bg-emerald-400/80" />
            <span className="text-[11px] text-gray-400 font-mono truncate">
              {subdomain}.vibeweb.site/{selectedPage === "index.html" ? "" : selectedPage}
            </span>
          </div>
          <button onClick={() => { if (iframeRef.current) iframeRef.current.src = previewUrl; fetchPages(); }} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
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
