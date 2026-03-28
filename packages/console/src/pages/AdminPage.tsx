import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { listTenants, createTenant, deleteTenant, resetTenantApiKey } from "@/api";
import {
  Plus, Trash2, ExternalLink, CheckCircle, XCircle,
  ExternalLink as LinkIcon, Loader2, ChevronDown, ChevronRight,
  Copy, Key, RefreshCw, Check,
} from "lucide-react";

interface Tenant { id: string; subdomain: string; name: string; api_key: string; status: string; created_at: string; }

export function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [claudeStatuses, setClaudeStatuses] = useState<Record<string, any>>({});
  const [expandedAuth, setExpandedAuth] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<{ tenantId: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    const data = await listTenants().catch(() => []);
    setTenants(data);
    const statuses: Record<string, any> = {};
    await Promise.all(data.map(async (t: Tenant) => {
      try {
        const res = await fetch(`/agent-api/auth/claude/${t.id}/status`);
        statuses[t.id] = await res.json();
      } catch { statuses[t.id] = { connected: false }; }
    }));
    setClaudeStatuses(statuses);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const result = await createTenant(subdomain.trim(), name.trim());
    setCreating(false);
    setShowCreate(false);
    setSubdomain("");
    setName("");
    if (result?.api_key) {
      setNewApiKey({ tenantId: result.id, key: result.api_key });
    }
    refresh();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete tenant "${name}"? This cannot be undone.`)) return;
    await deleteTenant(id);
    refresh();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 transition-colors">
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

      {/* API Key display after creation or reset */}
      {newApiKey && (
        <ApiKeyBanner apiKey={newApiKey.key} onDismiss={() => setNewApiKey(null)} />
      )}

      {/* Tenant list with Claude connection management */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[22%]">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[18%]">Subdomain</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[20%]">Claude</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[12%]">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 w-[28%]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <TenantRow
                key={t.id}
                tenant={t}
                claudeStatus={claudeStatuses[t.id] ?? { connected: false }}
                expanded={expandedAuth === t.id}
                onToggleAuth={() => setExpandedAuth(expandedAuth === t.id ? null : t.id)}
                onDelete={() => handleDelete(t.id, t.name)}
                onResetKey={async () => {
                  if (!confirm(`Reset API key for "${t.name}"? The old key will stop working.`)) return;
                  const result = await resetTenantApiKey(t.id);
                  if (result?.api_key) setNewApiKey({ tenantId: t.id, key: result.api_key });
                  refresh();
                }}
                onRefresh={refresh}
              />
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No tenants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantRow({ tenant, claudeStatus, expanded, onToggleAuth, onDelete, onResetKey, onRefresh }: {
  tenant: Tenant;
  claudeStatus: any;
  expanded: boolean;
  onToggleAuth: () => void;
  onDelete: () => void;
  onResetKey: () => void;
  onRefresh: () => void;
}) {
  const claudeConnected = claudeStatus?.connected ?? false;
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/agent-api/auth/claude/${tenant.id}/status`);
        const data = await res.json();
        if (data.connected) {
          stopPolling();
          setLoginUrl(null); setAuthCode(""); setLoginLoading(false);
          onRefresh();
        }
      } catch {}
    }, 2000);
    // Stop after 5 min
    setTimeout(stopPolling, 300_000);
  };

  const handleLogin = async () => {
    setLoginLoading(true); setLoginUrl(null); setCodeError("");
    try {
      const res = await fetch(`/agent-api/auth/claude/${tenant.id}/login`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        setLoginUrl(data.url);
        startPolling(); // Auto-detect when auth completes
      }
      else setCodeError(data.error || "Failed");
    } catch { setCodeError("Failed"); }
    finally { setLoginLoading(false); }
  };

  const handleSubmitCode = async () => {
    if (!authCode.trim()) return;
    setCodeSubmitting(true); setCodeError("");
    try {
      const res = await fetch(`/agent-api/auth/claude/${tenant.id}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode.trim() }),
      });
      const data = await res.json();
      if (data.success) { stopPolling(); setLoginUrl(null); setAuthCode(""); onRefresh(); }
      else setCodeError(data.error || "Authentication failed. Try again.");
    } catch { setCodeError("Failed"); }
    finally { setCodeSubmitting(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect Claude for "${tenant.name}"?`)) return;
    await fetch(`/agent-api/auth/claude/${tenant.id}`, { method: "DELETE" });
    setLoginUrl(null); setAuthCode("");
    onRefresh();
  };

  return (
    <>
      <tr className="border-t border-gray-100 hover:bg-gray-50/50">
        <td className="px-4 py-3 font-medium text-gray-900 max-w-0"><span className="block truncate" title={tenant.name}>{tenant.name}</span></td>
        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{tenant.subdomain}</td>
        <td className="px-4 py-3">
          <button onClick={onToggleAuth} className="flex items-center gap-1.5">
            {claudeConnected
              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Connected</span>
              : <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Not connected</span>
            }
            {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            tenant.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
          }`}>{tenant.status}</span>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-1 flex-wrap justify-end">
            <Link to={`/t/${tenant.id}/preview`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors whitespace-nowrap">
              <ExternalLink className="w-3 h-3" /> Open
            </Link>
            <button onClick={onResetKey}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors whitespace-nowrap">
              <Key className="w-3 h-3" /> Reset Key
            </button>
            <button onClick={onDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors whitespace-nowrap">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded Claude auth panel */}
      {expanded && (
        <tr className="border-t border-gray-50">
          <td colSpan={5} className="px-6 py-4 bg-gray-50/50">
            {claudeConnected ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm max-w-lg">
                  <div className="text-gray-400">Status</div>
                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium"><CheckCircle className="w-3.5 h-3.5" /> Connected</div>

                  <div className="text-gray-400">Token</div>
                  <div className="font-mono text-xs text-gray-600">{claudeStatus.tokenPrefix || "—"}</div>

                  <div className="text-gray-400">Type</div>
                  <div className="text-gray-600">{claudeStatus.tokenType || "—"}</div>

                  <div className="text-gray-400">Connected</div>
                  <div className="text-gray-600">{claudeStatus.connectedAt ? new Date(claudeStatus.connectedAt).toLocaleString() : "—"}</div>
                </div>
                <button onClick={handleDisconnect} className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors">Disconnect</button>
              </div>
            ) : (
              <div className="space-y-3 max-w-xl">
                {loginUrl ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1.5">Open this URL and sign in with your Claude account:</p>
                      <a href={loginUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline break-all">
                        <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />{loginUrl.substring(0, 70)}...
                      </a>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                      Waiting for authentication to complete...
                    </div>
                    <details className="text-sm">
                      <summary className="text-gray-400 cursor-pointer hover:text-gray-600">If prompted for a code, paste it here</summary>
                      <div className="flex gap-2 mt-2">
                        <input value={authCode} onChange={(e) => setAuthCode(e.target.value)} placeholder="Authorization code..."
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                        <button onClick={handleSubmitCode} disabled={codeSubmitting || !authCode.trim()}
                          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40">
                          {codeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
                        </button>
                      </div>
                    </details>
                    {codeError && <p className="text-sm text-red-500">{codeError}</p>}
                  </div>
                ) : (
                  <button onClick={handleLogin} disabled={loginLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40">
                    {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {loginLoading ? "Starting..." : "Connect Claude Account"}
                  </button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ApiKeyBanner({ apiKey, onDismiss }: { apiKey: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-6 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-800">API Key</span>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
      </div>
      <p className="text-xs text-emerald-700 mb-2">Copy this key now. It won't be shown again.</p>
      <div className="flex gap-2">
        <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs font-mono text-gray-800 break-all select-all">
          {apiKey}
        </code>
        <button onClick={handleCopy}
          className="px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-500 transition-colors flex items-center gap-1.5">
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
    </div>
  );
}
