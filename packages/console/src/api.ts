async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
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
export async function resetTenantApiKey(id: string) { const res = await apiFetch(`/tenants/${id}/reset-key`, { method: "POST" }); return res.json(); }
export async function deployTenant(id: string) { const res = await apiFetch(`/tenants/${id}/deploy`, { method: "POST" }); return res.json(); }
export async function getTenantStatus(id: string) { const res = await apiFetch(`/tenants/${id}/status`); return res.json(); }
export async function listFiles(tenantId: string) { const res = await apiFetch(`/tenants/${tenantId}/files`); return res.json(); }
export async function readFile(tenantId: string, filePath: string) { const res = await apiFetch(`/tenants/${tenantId}/files/${filePath}`); return res.text(); }
export async function uploadFile(tenantId: string, filePath: string, content: string) {
  const res = await apiFetch(`/tenants/${tenantId}/files/${filePath}`, {
    method: "PUT", body: JSON.stringify({ content })
  });
  return res.json();
}
export async function deleteFile(tenantId: string, filePath: string) {
  const res = await apiFetch(`/tenants/${tenantId}/files/${filePath}`, { method: "DELETE" });
  return res.json();
}
export async function queryDb(tenantId: string, sql: string) {
  const res = await apiFetch(`/tenants/${tenantId}/db/query`, { method: "POST", body: JSON.stringify({ sql }) });
  return res.json();
}
export async function changePassword(tenantId: string, currentPassword: string, newPassword: string) {
  const res = await apiFetch(`/tenants/${tenantId}/change-password`, {
    method: "POST", body: JSON.stringify({ currentPassword, newPassword })
  });
  return res.json();
}
