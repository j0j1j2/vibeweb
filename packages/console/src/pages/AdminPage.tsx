import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { listTenants, createTenant, deleteTenant, resetTenantApiKey } from "@/api";
import {
  Plus, Trash2, ExternalLink, CheckCircle, XCircle,
  Loader2, ChevronDown, ChevronRight,
  Copy, Key, Check,
} from "lucide-react";

interface Tenant { id: string; subdomain: string; name: string; api_key: string; status: string; created_at: string; }

export function AdminPage() {
  const { t } = useTranslation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [claudeStatuses, setClaudeStatuses] = useState<Record<string, any>>({});
  const [expandedAuth, setExpandedAuth] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<{ tenantId: string; key: string } | null>(null);
  const [newTenantCreds, setNewTenantCreds] = useState<{ tenantId: string; subdomain: string; initialPassword: string } | null>(null);
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);
  const [resettingTenantId, setResettingTenantId] = useState<string | null>(null);

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
    // Notify sidebar to refresh
    window.dispatchEvent(new Event("vibeweb:tenants-changed"));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setCreateError("");
    const result = await createTenant(subdomain.trim().toLowerCase(), name.trim());
    setCreating(false);
    if (result?.error) {
      setCreateError(result.error);
      return;
    }
    setShowCreate(false);
    setSubdomain("");
    setName("");
    if (result?.initial_password) {
      setNewTenantCreds({ tenantId: result.id, subdomain: result.subdomain, initialPassword: result.initial_password });
    }
    refresh();
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTenant(id);
    } catch { /* ignore */ }
    setDeletingTenantId(null);
    await refresh();
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.title")}</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 transition-colors">
          <Plus className="w-4 h-4" /> {t("admin.newTenant")}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 flex gap-3 items-end">
          <div className="flex-1">
            <label htmlFor="tenantSubdomain" className="block text-xs font-medium mb-1 text-gray-500">{t("admin.siteNameUrl")}</label>
            <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
              <input id="tenantSubdomain" value={subdomain} onChange={(e) => setSubdomain(e.target.value.replace(/[^a-z0-9-]/gi, "").toLowerCase())} placeholder={t("login.siteNamePlaceholder")}
                className="flex-1 px-3 py-2 bg-transparent text-sm focus:outline-none" autoFocus />
              <span className="pr-3 text-xs text-gray-300">.vibeweb.site</span>
            </div>
          </div>
          <div className="flex-1">
            <label htmlFor="tenantName" className="block text-xs font-medium mb-1 text-gray-500">{t("admin.displayName")}</label>
            <input id="tenantName" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("admin.displayNamePlaceholder")}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </div>
          <button type="submit" disabled={creating || !subdomain.trim() || !name.trim()}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40">
            {creating ? t("admin.creating") : t("common.create")}
          </button>
          {createError && <p className="text-sm text-red-500 self-center">{createError}</p>}
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
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[22%]">{t("admin.colName")}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[18%]">{t("admin.colSubdomain")}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[20%]">{t("admin.colClaude")}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[12%]">{t("admin.colStatus")}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 w-[28%]">{t("admin.colActions")}</th>
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
                confirmingDelete={deletingTenantId === t.id}
                onRequestDelete={() => setDeletingTenantId(t.id)}
                onCancelDelete={() => setDeletingTenantId(null)}
                onConfirmDelete={() => handleDelete(t.id)}
                confirmingReset={resettingTenantId === t.id}
                onRequestReset={() => setResettingTenantId(t.id)}
                onCancelReset={() => setResettingTenantId(null)}
                onConfirmReset={async () => {
                  setResettingTenantId(null);
                  const res = await fetch(`/api/tenants/${t.id}/reset-password`, { method: "POST" });
                  const result = await res.json();
                  if (result?.password) {
                    setNewTenantCreds({ tenantId: t.id, subdomain: result.subdomain, initialPassword: result.password });
                  }
                  refresh();
                }}
                onRefresh={refresh}
              />
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">{t("admin.noTenants")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TenantRow({ tenant, claudeStatus, expanded, onToggleAuth, confirmingDelete, onRequestDelete, onCancelDelete, onConfirmDelete, confirmingReset, onRequestReset, onCancelReset, onConfirmReset, onRefresh }: {
  tenant: Tenant;
  claudeStatus: any;
  expanded: boolean;
  onToggleAuth: () => void;
  confirmingDelete: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  confirmingReset: boolean;
  onRequestReset: () => void;
  onCancelReset: () => void;
  onConfirmReset: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const claudeConnected = claudeStatus?.connected ?? false;
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const handleStartLogin = async () => {
    setStarting(true); setSubmitError(""); setOauthUrl(null);
    try {
      const res = await fetch(`/agent-api/auth/claude/${tenant.id}/login`, { method: "POST" });
      const data = await res.json();
      if (data.url) setOauthUrl(data.url);
      else setSubmitError(data.error || t("admin.claude.failedStart"));
    } catch { setSubmitError(t("admin.claude.failedStart")); }
    finally { setStarting(false); }
  };

  const handleSubmitCode = async () => {
    const input = codeInput.trim();
    if (!input) return;
    setSubmitting(true); setSubmitError("");
    try {
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
      if (data.success) { setCodeInput(""); setOauthUrl(null); onRefresh(); }
      else setSubmitError(data.error || t("admin.claude.failedCode"));
    } catch { setSubmitError(t("admin.claude.failedConnect")); }
    finally { setSubmitting(false); }
  };

  const handleDisconnect = async () => {
    await fetch(`/agent-api/auth/claude/${tenant.id}`, { method: "DELETE" });
    setCodeInput("");
    setConfirmingDisconnect(false);
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
              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />{t("admin.connected")}</span>
              : <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />{t("admin.notConnected")}</span>
            }
            {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            tenant.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
          }`}>{tenant.status}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center gap-1 justify-end flex-wrap">
            {confirmingDelete ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-red-600 font-medium">{t("admin.confirmDelete", { name: tenant.name })}</span>
                <button onClick={onConfirmDelete} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors">{t("common.yes")}</button>
                <button onClick={onCancelDelete} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200 transition-colors">{t("common.no")}</button>
              </div>
            ) : confirmingReset ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-amber-600 font-medium">{t("admin.confirmReset")}</span>
                <button onClick={onConfirmReset} className="px-2 py-1 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600 transition-colors">{t("common.yes")}</button>
                <button onClick={onCancelReset} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200 transition-colors">{t("common.no")}</button>
              </div>
            ) : (
              <>
                <Link to={`/t/${tenant.id}/preview`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors whitespace-nowrap">
                  <ExternalLink className="w-3 h-3" /> {t("admin.open")}
                </Link>
                <button onClick={onRequestReset}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors whitespace-nowrap">
                  <Key className="w-3 h-3" /> {t("admin.resetPw")}
                </button>
                <button onClick={onRequestDelete}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors whitespace-nowrap">
                  <Trash2 className="w-3 h-3" /> {t("common.delete")}
                </button>
              </>
            )}
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
                  <div className="text-gray-400">{t("admin.claude.status")}</div>
                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium"><CheckCircle className="w-3.5 h-3.5" /> {t("admin.connected")}</div>

                  <div className="text-gray-400">{t("admin.claude.token")}</div>
                  <div className="font-mono text-xs text-gray-600">{claudeStatus.tokenPrefix || "—"}</div>

                  <div className="text-gray-400">{t("admin.claude.type")}</div>
                  <div className="text-gray-600">{claudeStatus.tokenType || "—"}</div>

                  <div className="text-gray-400">{t("admin.claude.connectedAt")}</div>
                  <div className="text-gray-600">{claudeStatus.connectedAt ? new Date(claudeStatus.connectedAt).toLocaleString() : "—"}</div>
                </div>
                {confirmingDisconnect ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-600">{t("admin.claude.confirmDisconnect")}</span>
                    <button onClick={handleDisconnect} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors">{t("common.yes")}</button>
                    <button onClick={() => setConfirmingDisconnect(false)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-medium hover:bg-gray-300 transition-colors">{t("common.no")}</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmingDisconnect(true)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-500 hover:bg-red-100 transition-colors">{t("common.disconnect")}</button>
                )}
              </div>
            ) : (
              <div className="space-y-4 max-w-xl">
                {!oauthUrl ? (
                  <div>
                    <p className="text-sm text-gray-600 mb-3">{t("admin.claude.connectDesc")}</p>
                    <button onClick={handleStartLogin} disabled={starting}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40">
                      {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {starting ? t("admin.claude.starting") : t("admin.claude.connectAccount")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1.5">{t("admin.claude.step1")}</p>
                      <a href={oauthUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline break-all">
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />{t("admin.claude.openAuth")}
                      </a>
                    </div>
                    <div>
                      <label htmlFor={`authCode-${tenant.id}`} className="text-sm font-medium text-gray-700 mb-1.5 block">{t("admin.claude.step2")}</label>
                      <div className="flex gap-2">
                        <input
                          id={`authCode-${tenant.id}`}
                          value={codeInput}
                          onChange={(e) => setCodeInput(e.target.value)}
                          placeholder={t("admin.claude.codePlaceholder")}
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                          autoFocus
                        />
                        <button onClick={handleSubmitCode} disabled={submitting || !codeInput.trim()}
                          className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40 whitespace-nowrap">
                          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.connect")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {submitError && <p className="mt-1 text-sm text-red-500">{submitError}</p>}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function TenantCreatedBanner({ subdomain, initialPassword, onDismiss }: { subdomain: string; initialPassword: string; onDismiss: () => void }) {
  const { t } = useTranslation();
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
          <span className="text-sm font-semibold text-emerald-800">{t("admin.tenantCreated")}</span>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">{t("common.dismiss")}</button>
      </div>
      <p className="text-xs text-emerald-700 mb-3">{t("admin.tenantCreatedDesc")}</p>
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 w-24 shrink-0">{t("admin.siteName")}</span>
          <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs font-mono text-gray-800 select-all">
            {subdomain}
          </code>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 w-24 shrink-0">{t("login.password")}</span>
          <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs font-mono text-gray-800 break-all select-all">
            {initialPassword}
          </code>
          <button onClick={handleCopyPassword}
            className="px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-500 transition-colors flex items-center gap-1.5 shrink-0">
            {copiedPassword ? <><Check className="w-3 h-3" /> {t("common.copied")}</> : <><Copy className="w-3 h-3" /> {t("common.copy")}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApiKeyBanner({ apiKey, onDismiss }: { apiKey: string; onDismiss: () => void }) {
  const { t } = useTranslation();
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
          <span className="text-sm font-semibold text-emerald-800">{t("admin.apiKey")}</span>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">{t("common.dismiss")}</button>
      </div>
      <p className="text-xs text-emerald-700 mb-2">{t("admin.apiKeyDesc")}</p>
      <div className="flex gap-2">
        <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-md text-xs font-mono text-gray-800 break-all select-all">
          {apiKey}
        </code>
        <button onClick={handleCopy}
          className="px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-500 transition-colors flex items-center gap-1.5">
          {copied ? <><Check className="w-3 h-3" /> {t("common.copied")}</> : <><Copy className="w-3 h-3" /> {t("common.copy")}</>}
        </button>
      </div>
    </div>
  );
}
