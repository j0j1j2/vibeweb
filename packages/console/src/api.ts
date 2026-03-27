function getApiKey(): string {
  try {
    const raw = localStorage.getItem("vibeweb_auth");
    if (!raw) return "";
    return JSON.parse(raw).apiKey ?? "";
  } catch { return ""; }
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  headers.set("X-API-Key", getApiKey());
  if (opts.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`/api${path}`, { ...opts, headers });
}

export async function listTenants() { const res = await apiFetch("/tenants"); return res.json(); }
export async function getTenant(id: string) { const res = await apiFetch(`/tenants/${id}`); return res.json(); }
export async function createTenant(subdomain: string, name: string) {
  const res = await apiFetch("/tenants", { method: "POST", body: JSON.stringify({ subdomain, name }) });
  return res.json();
}
export async function deleteTenant(id: string) { return apiFetch(`/tenants/${id}`, { method: "DELETE" }); }
export async function deployTenant(id: string) { const res = await apiFetch(`/tenants/${id}/deploy`, { method: "POST" }); return res.json(); }
export async function getTenantStatus(id: string) { const res = await apiFetch(`/tenants/${id}/status`); return res.json(); }
export async function listFiles(tenantId: string) { const res = await apiFetch(`/tenants/${tenantId}/files`); return res.json(); }
export async function readFile(tenantId: string, filePath: string) { const res = await apiFetch(`/tenants/${tenantId}/files/${filePath}`); return res.text(); }
export async function queryDb(tenantId: string, sql: string) {
  const res = await apiFetch(`/tenants/${tenantId}/db/query`, { method: "POST", body: JSON.stringify({ sql }) });
  return res.json();
}
export async function getOAuthStatus(tenantId: string) { const res = await apiFetch(`/tenants/${tenantId}/auth/claude/status`); return res.json(); }

export async function startClaudeLogin() {
  const res = await fetch("/agent-api/auth/claude/login", { method: "POST" });
  return res.json();
}

export async function getClaudeAuthStatus() {
  const res = await fetch("/agent-api/auth/claude/status");
  return res.json();
}

export async function disconnectClaude() {
  return fetch("/agent-api/auth/claude", { method: "DELETE" });
}
