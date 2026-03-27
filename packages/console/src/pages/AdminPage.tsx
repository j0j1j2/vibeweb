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
        <h1 className="text-2xl font-bold">Tenants</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>
      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-800/50 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-zinc-500">Subdomain</label>
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="my-site" className="w-full px-3 py-2 border rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" autoFocus />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1 text-zinc-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Site" className="w-full px-3 py-2 border rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400" />
          </div>
          <button type="submit" disabled={creating || !subdomain.trim() || !name.trim()} className="px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{creating ? "Creating..." : "Create"}</button>
        </form>
      )}
      <TenantTable tenants={tenants} onRefresh={refresh} />
    </div>
  );
}
