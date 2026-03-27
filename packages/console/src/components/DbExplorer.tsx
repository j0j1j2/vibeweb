import { useState } from "react";
import { queryDb } from "@/api";
import { Play } from "lucide-react";

interface QueryResult { columns: string[]; rows: Record<string, unknown>[]; count: number; }

export function DbExplorer({ tenantId }: { tenantId: string }) {
  const [sql, setSql] = useState("SELECT name FROM sqlite_master WHERE type='table'");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const runQuery = async () => {
    if (!sql.trim()) return;
    setLoading(true); setError("");
    try {
      const data = await queryDb(tenantId, sql);
      if (data.error) { setError(data.error); setResult(null); }
      else setResult(data);
    } catch { setError("Query failed"); setResult(null); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <div className="flex gap-2">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[13px] font-mono text-gray-700 placeholder:text-gray-300 resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
            rows={3}
            placeholder="SELECT * FROM ..."
          />
          <button onClick={runQuery} disabled={loading || !sql.trim()}
            className="px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 disabled:opacity-30 self-end transition-colors">
            <Play className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="mt-2 text-red-500 text-[13px]">{error}</p>}
      </div>
      <div className="flex-1 overflow-auto">
        {result && (
          <div>
            <div className="px-4 py-2 text-[11px] text-gray-400 border-b border-gray-100">{result.count} row{result.count !== 1 ? "s" : ""}</div>
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-gray-100">
                {result.columns.map((col) => <th key={col} className="text-left px-4 py-2.5 font-medium text-[11px] uppercase text-gray-400 tracking-wider">{col}</th>)}
              </tr></thead>
              <tbody>{result.rows.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                  {result.columns.map((col) => <td key={col} className="px-4 py-2 font-mono text-[12px] text-gray-600">{String(row[col] ?? "NULL")}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {!result && !error && <div className="flex items-center justify-center h-full text-gray-300 text-sm">Run a query (Ctrl+Enter)</div>}
      </div>
    </div>
  );
}
