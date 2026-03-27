import { useState, useEffect, useCallback } from "react";
import { listTenants, createTenant } from "@/api";
import { TenantTable } from "@/components/TenantTable";
import { Plus } from "lucide-react";

export function AdminPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => { listTenants().then(setTenants).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    await createTenant(subdomain.trim(), name.trim());
    setCreating(false);
    setShowCreate(false);
    setSubdomain("");
    setName("");
    refresh();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800">
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>
      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-gray-500">Subdomain</label>
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="my-site"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" autoFocus />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-gray-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Site"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </div>
          <button type="submit" disabled={creating || !subdomain.trim() || !name.trim()}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40">
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      )}
      <TenantTable tenants={tenants} onRefresh={refresh} />
    </div>
  );
}
