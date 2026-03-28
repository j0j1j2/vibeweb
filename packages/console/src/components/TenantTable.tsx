import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, ExternalLink } from "lucide-react";
import { deleteTenant } from "@/api";

interface Tenant { id: string; subdomain: string; name: string; status: string; created_at: string; }

export function TenantTable({ tenants, onRefresh }: { tenants: Tenant[]; onRefresh: () => void }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    await deleteTenant(id);
    setDeletingId(null);
    onRefresh();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Name</th>
            <th className="text-left px-4 py-3 font-medium">Subdomain</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Created</th>
            <th className="text-right px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className="px-4 py-3 font-medium">{t.name}</td>
              <td className="px-4 py-3 text-zinc-500">{t.subdomain}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-zinc-100 text-zinc-800"}`}>{t.status}</span>
              </td>
              <td className="px-4 py-3 text-zinc-500">{new Date(t.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right space-x-2">
                <Link to={`/t/${t.id}/chat`} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"><ExternalLink className="w-3 h-3" /> Open</Link>
                {deletingId === t.id ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-xs text-red-600">Delete?</span>
                    <button onClick={() => handleDelete(t.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors">Yes</button>
                    <button onClick={() => setDeletingId(null)} className="px-2 py-1 bg-gray-200 rounded text-xs font-medium hover:bg-gray-300 transition-colors">No</button>
                  </span>
                ) : (
                  <button onClick={() => setDeletingId(t.id)} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3 h-3" /> Delete</button>
                )}
              </td>
            </tr>
          ))}
          {tenants.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No tenants yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
