import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { listFiles } from "@/api";
import { Plug } from "lucide-react";

interface ApiFunction { name: string; path: string; }

export function ApiPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [functions, setFunctions] = useState<ApiFunction[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    listFiles(tenantId).then((data) => {
      const apiFunctions = (data.files ?? [])
        .filter((f: { path: string }) => f.path.startsWith("functions/api/") && f.path.endsWith(".js"))
        .map((f: { path: string }) => { const name = f.path.replace("functions/api/", "").replace(".js", ""); return { name, path: `/api/${name}` }; });
      setFunctions(apiFunctions);
    }).catch(() => {});
  }, [tenantId]);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">API Endpoints</h1>
      {functions.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800"><tr><th className="text-left px-4 py-3 font-medium">Function</th><th className="text-left px-4 py-3 font-medium">Endpoint</th></tr></thead>
            <tbody>{functions.map((fn) => (
              <tr key={fn.name} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50"><td className="px-4 py-3 font-mono">{fn.name}</td><td className="px-4 py-3 font-mono text-zinc-500">{fn.path}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-400"><Plug className="w-8 h-8 mx-auto mb-2" /><p>No API functions yet</p><p className="text-xs mt-1">Create functions in /functions/api/ using the chat editor</p></div>
      )}
    </div>
  );
}
