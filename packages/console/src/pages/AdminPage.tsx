import { useState, useEffect, useCallback } from "react";
import { listTenants, createTenant } from "@/api";
import { TenantTable } from "@/components/TenantTable";
import { Plus, CheckCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";

export function AdminPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  // Claude auth state
  const [claudeStatus, setClaudeStatus] = useState<{ connected: boolean } | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const refresh = useCallback(() => { listTenants().then(setTenants).catch(() => {}); }, []);
  useEffect(() => { refresh(); checkClaudeStatus(); }, [refresh]);

  const checkClaudeStatus = async () => {
    try {
      const res = await fetch("/agent-api/auth/claude/status");
      const data = await res.json();
      setClaudeStatus(data);
    } catch { setClaudeStatus({ connected: false }); }
  };

  const handleClaudeLogin = async () => {
    setLoginLoading(true);
    setLoginUrl(null);
    try {
      const res = await fetch("/agent-api/auth/claude/login", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        setLoginUrl(data.url);
        const pollInterval = setInterval(async () => {
          const statusRes = await fetch("/agent-api/auth/claude/status");
          const statusData = await statusRes.json();
          if (statusData.connected) {
            clearInterval(pollInterval);
            setClaudeStatus(statusData);
            setLoginUrl(null);
            setLoginLoading(false);
          }
        }, 2000);
        setTimeout(() => { clearInterval(pollInterval); setLoginLoading(false); }, 300000);
      } else {
        setLoginLoading(false);
      }
    } catch { setLoginLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Claude account? All tenant sessions will lose access.")) return;
    await fetch("/agent-api/auth/claude", { method: "DELETE" });
    setClaudeStatus({ connected: false });
    setLoginUrl(null);
  };

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
    <div className="p-8 max-w-5xl space-y-8">
      {/* Claude Connection — Platform-wide */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Claude Connection</h2>
        <p className="text-sm text-zinc-500 mb-3">Platform-wide Claude account used for all vibe editor sessions.</p>
        {claudeStatus?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-3 border rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm">Connected</span>
            </div>
            <button onClick={handleDisconnect} className="text-sm text-red-500 hover:underline">Disconnect</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-3 border rounded-lg">
              <XCircle className="w-5 h-5 text-zinc-400" />
              <span className="text-sm text-zinc-500">Not connected — vibe editor will not work</span>
            </div>
            {loginUrl ? (
              <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20 space-y-2">
                <p className="text-sm font-medium">Open this URL to authenticate with Claude:</p>
                <a href={loginUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline break-all">
                  <ExternalLink className="w-4 h-4 flex-shrink-0" />{loginUrl}
                </a>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" /> Waiting for authentication...
                </div>
              </div>
            ) : (
              <button onClick={handleClaudeLogin} disabled={loginLoading}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loginLoading ? "Starting..." : "Connect Claude Account"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Tenants */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Tenants</h2>
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
      </section>
    </div>
  );
}
