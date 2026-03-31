import Fastify from "fastify";
import path from "node:path";
import { FUNCTION_RUNNER_PORT } from "@vibeweb/shared";
import { handleFunctionRequest } from "./runner.js";
import type { FunctionRequest } from "@vibeweb/shared";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");

// Resolve public IP when behind Docker NAT (private X-Forwarded-For)
let cachedPublicIp: string | null = null;
let publicIpFetchedAt = 0;
const PUBLIC_IP_TTL = 300_000; // 5 min cache

function isPrivateIp(ip: string): boolean {
  const cleaned = ip.replace("::ffff:", "");
  const parts = cleaned.split(".").map(Number);
  if (parts.length !== 4) return true; // IPv6 or unknown → treat as private
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 127
  );
}

async function resolveClientIp(headerIp: string | undefined): Promise<string> {
  const ip = headerIp?.split(",")[0].trim() ?? "0.0.0.0";
  if (!isPrivateIp(ip)) return ip;
  // Private IP → resolve public IP from external service (cached)
  const now = Date.now();
  if (cachedPublicIp && now - publicIpFetchedAt < PUBLIC_IP_TTL) return cachedPublicIp;
  try {
    const resp = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
    const data = await resp.json() as { ip: string };
    cachedPublicIp = data.ip;
    publicIpFetchedAt = now;
    return data.ip;
  } catch {
    return ip; // fallback to private IP
  }
}

const app = Fastify({ logger: true });

// Accept any content type as raw text so we can pass it through to functions
app.removeAllContentTypeParsers();
app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
  done(null, body);
});

app.all<{ Params: { "*": string } }>("/api/*", async (req, reply) => {
  const tenantId = req.headers["x-tenant-id"] as string | undefined;
  if (!tenantId) return reply.status(400).send({ error: "missing x-tenant-id header" });
  const apiPath = req.params["*"];
  // Resolve real client IP (replaces Docker internal IPs with public IP)
  const clientIp = await resolveClientIp(req.headers["x-forwarded-for"] as string | undefined);
  const patchedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") patchedHeaders[k] = v;
  }
  patchedHeaders["x-forwarded-for"] = clientIp;
  patchedHeaders["x-real-ip"] = clientIp;

  const fnRequest: FunctionRequest = {
    method: req.method,
    path: req.url,
    query: req.query as Record<string, string>,
    headers: patchedHeaders,
    body: typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""),
  };
  const result = await handleFunctionRequest(tenantId, apiPath, fnRequest, tenantsDir);
  reply.status(result.status);
  for (const [key, value] of Object.entries(result.headers)) { reply.header(key, value); }
  return result.body;
});

app.get("/health", async () => ({ status: "ok" }));

const start = async () => { try { await app.listen({ port: FUNCTION_RUNNER_PORT, host: "0.0.0.0" }); } catch (err) { app.log.error(err); process.exit(1); } };
start();
