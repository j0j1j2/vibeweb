import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getTenant, getTenantStatus, deployTenant, getOAuthStatus } from "@/api";
import { Rocket, CheckCircle, XCircle } from "lucide-react";

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [oauth, setOAuth] = useState<{ connected: boolean; expires_at: string | null } | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then(setTenant).catch(() => {});
    getTenantStatus(tenantId).then(setStatus).catch(() => {});
    getOAuthStatus(tenantId).then(setOAuth).catch(() => {});
  }, [tenantId]);

  const handleDeploy = async () => {
    if (!tenantId) return;
    setDeploying(true); setDeployMsg("");
    try { await deployTenant(tenantId); setDeployMsg("Deployed successfully!"); getTenantStatus(tenantId).then(setStatus).catch(() => {}); }
    catch { setDeployMsg("Deploy failed"); }
    finally { setDeploying(false); }
  };

  if (!tenant) return <div className="p-8 text-zinc-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section><h2 className="text-lg font-semibold mb-2">Subdomain</h2><div className="px-4 py-3 border rounded-lg bg-zinc-50 dark:bg-zinc-800/50"><span className="font-mono">{tenant.subdomain}.vibeweb.localhost</span></div></section>
      <section><h2 className="text-lg font-semibold mb-2">Deploy</h2>
        <p className="text-sm text-zinc-500 mb-3">Push preview changes to the live site.{status?.last_deployment && <span> Last deployed: {new Date(status.last_deployment).toLocaleString()}</span>}</p>
        <button onClick={handleDeploy} disabled={deploying} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"><Rocket className="w-4 h-4" />{deploying ? "Deploying..." : "Deploy to Live"}</button>
        {deployMsg && <p className="mt-2 text-sm text-green-600">{deployMsg}</p>}
      </section>
      <section><h2 className="text-lg font-semibold mb-2">Claude Connection</h2>
        <div className="flex items-center gap-2 px-4 py-3 border rounded-lg">
          {oauth?.connected ? <><CheckCircle className="w-5 h-5 text-green-500" /><span className="text-sm">Connected</span></> : <><XCircle className="w-5 h-5 text-zinc-400" /><span className="text-sm text-zinc-500">Not connected — using fallback API key</span></>}
        </div>
      </section>
    </div>
  );
}
