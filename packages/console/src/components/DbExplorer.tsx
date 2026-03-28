import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { queryDb } from "@/api";
import { Play, Table2, ChevronRight } from "lucide-react";

interface QueryResult { columns: string[]; rows: Record<string, unknown>[]; count: number; }
interface TableInfo { name: string; }

export function DbExplorer({ tenantId: propTenantId }: { tenantId?: string }) {
  const params = useParams<{ tenantId: string }>();
  const tenantId = propTenantId ?? params.tenantId ?? "";

  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);

  // Load table list on mount
  useEffect(() => {
    if (!tenantId) return;
    queryDb(tenantId, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .then((data) => {
        if (data.rows) setTables(data.rows as TableInfo[]);
      })
      .catch(() => {});
  }, [tenantId]);

  const runQuery = async (query?: string) => {
    const q = query ?? sql;
    if (!q.trim() || !tenantId) return;
    if (query) setSql(query);
    setLoading(true); setError("");
    try {
      const data = await queryDb(tenantId, q);
      if (data.error) { setError(data.error); setResult(null); }
      else setResult(data);
    } catch { setError("Query failed"); setResult(null); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); }
  };

  const selectTable = (name: string) => {
    const q = `SELECT * FROM "${name}" LIMIT 100`;
    setSql(q);
    runQuery(q);
  };

  return (
    <div className="flex h-full">
      {/* Table list sidebar — hidden when empty */}
      {tables.length > 0 && (
        <div className="w-[140px] border-r border-gray-100 bg-gray-50/30 overflow-y-auto flex-shrink-0">
          <div className="px-3 py-3">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Tables</div>
            {tables.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[13px] text-left text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Table2 className="w-3.5 h-3.5 text-gray-300" />
                <span className="truncate">{t.name}</span>
                <ChevronRight className="w-3 h-3 text-gray-300 ml-auto" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Query area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b border-gray-100">
          <div className="flex gap-2">
            <textarea
              id="sqlQuery"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[13px] font-mono text-gray-700 placeholder:text-gray-300 placeholder:leading-normal resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
              rows={3}
              placeholder={"SELECT * FROM ...\n(Ctrl+Enter to run)"}
              aria-label="SQL query"
            />
            <button onClick={() => runQuery()} disabled={loading || !sql.trim()} aria-label="Run query"
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
          {!result && !error && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-2 px-6 text-center">
              <Table2 className="w-8 h-8" />
              {tables.length > 0 ? (
                <p className="text-sm">Click a table or run a query</p>
              ) : (
                <p className="text-sm">No tables yet. Use the chat to create your first database table.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
