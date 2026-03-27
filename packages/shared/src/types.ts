export interface Tenant {
  id: string;
  subdomain: string;
  name: string;
  api_key: string;
  created_at: string;
  updated_at: string;
  status: "active" | "suspended" | "deleted";
}

export interface Deployment {
  id: string;
  tenant_id: string;
  deployed_at: string;
  backup_path: string | null;
}

export interface CreateTenantRequest {
  subdomain: string;
  name: string;
}

export interface FunctionRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

export interface FunctionResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
