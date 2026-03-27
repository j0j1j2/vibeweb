import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getTenant, getTenantStatus, deployTenant } from "@/api";
import { Rocket } from "lucide-react";

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then(setTenant).catch(() => {});
    getTenantStatus(tenantId).then(setStatus).catch(() => {});
  }, [tenantId]);

  const handleDeploy = async () => {
    if (!tenantId) return;
    setDeploying(true); setDeployMsg("");
    try { await deployTenant(tenantId); setDeployMsg("Deployed successfully!"); getTenantStatus(tenantId).then(setStatus).catch(() => {}); }
    catch { setDeployMsg("Deploy failed"); }
    finally { setDeploying(false); }
  };

  if (!tenant) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Subdomain</h2>
        <div className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50">
          <span className="font-mono text-gray-700">{tenant.subdomain}.vibeweb.localhost</span>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Deploy</h2>
        <p className="text-sm text-gray-400 mb-3">
          Push preview changes to the live site.
          {status?.last_deployment && <span className="text-gray-500"> Last: {new Date(status.last_deployment).toLocaleString()}</span>}
        </p>
        <button onClick={handleDeploy} disabled={deploying}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40">
          <Rocket className="w-4 h-4" />{deploying ? "Deploying..." : "Deploy to Live"}
        </button>
        {deployMsg && <p className="mt-2 text-sm text-emerald-600">{deployMsg}</p>}
      </section>
    </div>
  );
}
