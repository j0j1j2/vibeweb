import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getTenant, getTenantStatus, deployTenant } from "@/api";
import { Rocket, CheckCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [claudeStatus, setClaudeStatus] = useState<{ connected: boolean } | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then(setTenant).catch(() => {});
    getTenantStatus(tenantId).then(setStatus).catch(() => {});
    checkClaudeStatus();
  }, [tenantId]);

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
        // Poll for completion
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
        // Stop polling after 5 minutes
        setTimeout(() => { clearInterval(pollInterval); setLoginLoading(false); }, 300000);
      } else {
        setLoginLoading(false);
      }
    } catch { setLoginLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Claude account?")) return;
    await fetch("/agent-api/auth/claude", { method: "DELETE" });
    setClaudeStatus({ connected: false });
    setLoginUrl(null);
  };

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

      <section>
        <h2 className="text-lg font-semibold mb-2">Subdomain</h2>
        <div className="px-4 py-3 border rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
          <span className="font-mono">{tenant.subdomain}.vibeweb.localhost</span>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Deploy</h2>
        <p className="text-sm text-zinc-500 mb-3">
          Push preview changes to the live site.
          {status?.last_deployment && <span> Last deployed: {new Date(status.last_deployment).toLocaleString()}</span>}
        </p>
        <button onClick={handleDeploy} disabled={deploying}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white text-sm rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          <Rocket className="w-4 h-4" />{deploying ? "Deploying..." : "Deploy to Live"}
        </button>
        {deployMsg && <p className="mt-2 text-sm text-green-600">{deployMsg}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Claude Connection</h2>
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
              <span className="text-sm text-zinc-500">Not connected</span>
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
    </div>
  );
}
