import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { listFiles } from "@/api";
import { useChatContext } from "@/components/ChatLayout";
import { FileText, Layout } from "lucide-react";

interface HtmlPage {
  name: string;
  path: string;
}

export function ViewPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { subdomain } = useChatContext();
  const [pages, setPages] = useState<HtmlPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>("index.html");

  useEffect(() => {
    if (!tenantId) return;
    listFiles(tenantId).then((data) => {
      const htmlPages = (data.files ?? [])
        .filter((f: { path: string }) => f.path.startsWith("public/") && f.path.endsWith(".html"))
        .map((f: { path: string }) => ({
          name: f.path.replace("public/", ""),
          path: f.path,
        }));
      setPages(htmlPages);
    }).catch(() => {});
  }, [tenantId]);

  const previewUrl = subdomain
    ? `http://${subdomain}.vibeweb.localhost/${selectedPage === "index.html" ? "" : selectedPage}?preview=true`
    : "";

  return (
    <div className="flex h-full">
      {/* Page list sidebar */}
      <div className="w-[200px] border-r border-gray-100 bg-gray-50/50 overflow-y-auto">
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
              <FileText className="w-3.5 h-3.5" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {pages.length === 0 && (
            <div className="px-2 text-[12px] text-gray-300">No HTML pages</div>
          )}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex flex-col">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <Layout className="w-4 h-4 text-gray-400" />
          <span className="text-[13px] text-gray-600 font-medium">View: {selectedPage}</span>
        </div>
        {previewUrl ? (
          <iframe src={previewUrl} className="flex-1 w-full border-0 bg-white" title="View" />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300">Loading...</div>
        )}
      </div>
    </div>
  );
}
