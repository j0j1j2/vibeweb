import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR ?? "/data";
export const TENANTS_DIR = path.join(DATA_DIR, "tenants");

export const CONTROL_API_PORT = 1919;
export const FUNCTION_RUNNER_PORT = 3001;
export const PREVIEW_SERVER_PORT = 3002;

export const FUNCTION_TIMEOUT_MS = 10_000;
export const FUNCTION_MEMORY_LIMIT = "128m";
export const FUNCTION_CPU_LIMIT = 0.5;

export const RUNNER_IMAGE = "vibeweb-runner:node20";

export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
export const SUBDOMAIN_MAX_LENGTH = 63;

export const AGENT_SERVICE_PORT = 3003;
export const SESSION_IMAGE = "vibeweb-session:latest";
export const SESSION_BRIDGE_PORT = 3100;
export const SESSION_MEMORY_LIMIT = "512m";
export const SESSION_CPU_LIMIT = 1;
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
