import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listFiles } from "@/api";
import { Plug } from "lucide-react";

interface ApiFunction { name: string; path: string; }

export function ApiPage() {
  const { t } = useTranslation();
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
      <h1 className="text-2xl font-bold mb-6">{t("api.title")}</h1>
      {functions.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 font-medium">{t("api.colFunction")}</th><th className="text-left px-4 py-3 font-medium">{t("api.colEndpoint")}</th></tr></thead>
            <tbody>{functions.map((fn) => (
              <tr key={fn.name} className="border-t hover:bg-gray-50"><td className="px-4 py-3 font-mono">{fn.name}</td><td className="px-4 py-3 font-mono text-gray-500">{fn.path}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400"><Plug className="w-8 h-8 mx-auto mb-2" /><p>{t("api.noApis")}</p><p className="text-xs mt-1">{t("api.noApisDesc")}</p></div>
      )}
    </div>
  );
}
