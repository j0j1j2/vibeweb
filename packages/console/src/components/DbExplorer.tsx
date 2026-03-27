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

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); } };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex gap-2">
          <textarea value={sql} onChange={(e) => setSql(e.target.value)} onKeyDown={handleKeyDown}
            className="flex-1 px-3 py-2 border rounded-md bg-transparent text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400" rows={3} placeholder="SELECT * FROM ..." />
          <button onClick={runQuery} disabled={loading || !sql.trim()}
            className="px-4 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 self-start"><Play className="w-4 h-4" /></button>
        </div>
        {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
      </div>
      <div className="flex-1 overflow-auto">
        {result && (
          <div>
            <div className="px-4 py-2 text-xs text-zinc-400 border-b">{result.count} row{result.count !== 1 ? "s" : ""}</div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800 sticky top-0">
                <tr>{result.columns.map((col) => <th key={col} className="text-left px-4 py-2 font-medium text-xs uppercase text-zinc-500">{col}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    {result.columns.map((col) => <td key={col} className="px-4 py-2 font-mono text-xs">{String(row[col] ?? "NULL")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!result && !error && <div className="flex items-center justify-center h-full text-zinc-400 text-sm">Run a query to see results (Ctrl+Enter)</div>}
      </div>
    </div>
  );
}
