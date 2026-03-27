import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getTenant, getTenantStatus, deployTenant } from "@/api";
import { Rocket, CheckCircle, XCircle, ExternalLink, Loader2, Copy } from "lucide-react";

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  // Claude auth
  const [claudeStatus, setClaudeStatus] = useState<{ connected: boolean } | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then(setTenant).catch(() => {});
    getTenantStatus(tenantId).then(setStatus).catch(() => {});
    checkClaudeStatus();
  }, [tenantId]);

  const checkClaudeStatus = async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/agent-api/auth/claude/${tenantId}/status`);
      setClaudeStatus(await res.json());
    } catch { setClaudeStatus({ connected: false }); }
  };

  const handleClaudeLogin = async () => {
    if (!tenantId) return;
    setLoginLoading(true); setLoginUrl(null); setCodeError("");
    try {
      const res = await fetch(`/agent-api/auth/claude/${tenantId}/login`, { method: "POST" });
      const data = await res.json();
      if (data.url) setLoginUrl(data.url);
      else setCodeError(data.error || "Failed to start login");
    } catch { setCodeError("Failed to start login"); }
    finally { setLoginLoading(false); }
  };

  const handleSubmitCode = async () => {
    if (!tenantId || !authCode.trim()) return;
    setCodeSubmitting(true); setCodeError("");
    try {
      const res = await fetch(`/agent-api/auth/claude/${tenantId}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setLoginUrl(null); setAuthCode("");
        checkClaudeStatus();
      } else {
        setCodeError(data.error || "Authentication failed");
      }
    } catch { setCodeError("Failed to submit code"); }
    finally { setCodeSubmitting(false); }
  };

  const handleDisconnect = async () => {
    if (!tenantId || !confirm("Disconnect Claude account?")) return;
    await fetch(`/agent-api/auth/claude/${tenantId}`, { method: "DELETE" });
    setClaudeStatus({ connected: false }); setLoginUrl(null);
  };

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

      {/* Subdomain */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Subdomain</h2>
        <div className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50">
          <span className="font-mono text-gray-700">{tenant.subdomain}.vibeweb.localhost</span>
        </div>
      </section>

      {/* Claude Connection */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Claude Connection</h2>
        {claudeStatus?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-3 border border-emerald-200 rounded-lg bg-emerald-50">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-sm text-emerald-700 font-medium">Connected</span>
            </div>
            <button onClick={handleDisconnect} className="text-sm text-red-500 hover:underline">Disconnect</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg">
              <XCircle className="w-5 h-5 text-gray-300" />
              <span className="text-sm text-gray-500">Not connected — required for vibe editor</span>
            </div>

            {loginUrl ? (
              <div className="p-4 border border-violet-200 rounded-lg bg-violet-50 space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Step 1: Open this URL and sign in</p>
                  <a href={loginUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-violet-600 hover:underline break-all">
                    <ExternalLink className="w-4 h-4 flex-shrink-0" />{loginUrl.substring(0, 80)}...
                  </a>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Step 2: Paste the authorization code</p>
                  <div className="flex gap-2">
                    <input
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      placeholder="Paste code here..."
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button
                      onClick={handleSubmitCode}
                      disabled={codeSubmitting || !authCode.trim()}
                      className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40"
                    >
                      {codeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
                    </button>
                  </div>
                  {codeError && <p className="mt-2 text-sm text-red-500">{codeError}</p>}
                </div>
              </div>
            ) : (
              <button onClick={handleClaudeLogin} disabled={loginLoading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40">
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loginLoading ? "Starting..." : "Connect Claude Account"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Deploy */}
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
