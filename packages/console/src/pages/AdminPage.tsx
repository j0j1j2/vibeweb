import { useState, useEffect, useCallback } from "react";
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
  const [newTenantCreds, setNewTenantCreds] = useState<{ tenantId: string; subdomain: string; initialPassword: string } | null>(null);

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
    if (result?.initial_password) {
      setNewTenantCreds({ tenantId: result.id, subdomain: result.subdomain, initialPassword: result.initial_password });
    } else if (result?.api_key) {
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

      {/* Tenant credentials display after creation */}
      {newTenantCreds && (
        <TenantCreatedBanner
          subdomain={newTenantCreds.subdomain}
          initialPassword={newTenantCreds.initialPassword}
          onDismiss={() => setNewTenantCreds(null)}
        />
      )}

      {/* API Key display after reset */}
      {newApiKey && (
        <ApiKeyBanner apiKey={newApiKey.key} onDismiss={() => setNewApiKey(null)} />
      )}

      {/* Tenant list with Claude connection management */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
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
  const [codeInput, setCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmitCode = async () => {
    const input = codeInput.trim();
    if (!input) return;
    setSubmitting(true); setSubmitError("");
    try {
      // If it's a token (sk-ant-oat...), save directly. Otherwise treat as auth code.
      const isToken = input.startsWith("sk-ant-");
      const url = isToken
        ? `/agent-api/auth/claude/${tenant.id}/token`
        : `/agent-api/auth/claude/${tenant.id}/code`;
      const body = isToken ? { token: input } : { code: input };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { setCodeInput(""); onRefresh(); }
      else setSubmitError(data.error || "Failed. Make sure the code is correct.");
    } catch { setSubmitError("Failed to connect"); }
    finally { setSubmitting(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect Claude for "${tenant.name}"?`)) return;
    await fetch(`/agent-api/auth/claude/${tenant.id}`, { method: "DELETE" });
    setCodeInput("");
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
          <div className="inline-flex items-center gap-1 justify-end">
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
              <div className="space-y-4 max-w-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Connect Claude Account</p>
                  <ol className="text-xs text-gray-400 mb-3 space-y-1 list-decimal list-inside">
                    <li>Run <code className="px-1.5 py-0.5 bg-gray-100 rounded text-violet-600">claude setup-token</code> in your terminal</li>
                    <li>Open the URL and authorize</li>
                    <li>Copy the authentication code and paste it below</li>
                  </ol>
                  <div className="flex gap-2">
                    <input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      placeholder="Paste authentication code or token..."
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button onClick={handleSubmitCode} disabled={submitting || !codeInput.trim()}
                      className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40 whitespace-nowrap">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Connect"}
                    </button>
                  </div>
                  {submitError && <p className="mt-1 text-sm text-red-500">{submitError}</p>}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function TenantCreatedBanner({ subdomain, initialPassword, onDismiss }: { subdomain: string; initialPassword: string; onDismiss: () => void }) {
  const [copiedPassword, setCopiedPassword] = useState(false);

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(initialPassword);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  return (
    <div className="mb-6 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-800">Tenant Created</span>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
      </div>
      <p className="text-xs text-emerald-700 mb-3">Save this password. It won't be shown again.</p>
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 w-24 shrink-0">Subdomain</span>
          <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs font-mono text-gray-800 select-all">
            {subdomain}
          </code>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 w-24 shrink-0">Initial Password</span>
          <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs font-mono text-gray-800 break-all select-all">
            {initialPassword}
          </code>
          <button onClick={handleCopyPassword}
            className="px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-500 transition-colors flex items-center gap-1.5 shrink-0">
            {copiedPassword ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        </div>
      </div>
    </div>
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
