import Fastify from "fastify";
import path from "node:path";
import { FUNCTION_RUNNER_PORT } from "@vibeweb/shared";
import { handleFunctionRequest } from "./runner.js";
import type { FunctionRequest } from "@vibeweb/shared";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");

const app = Fastify({ logger: true });

// Accept any content type as raw text so we can pass it through to functions
app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
  done(null, body);
});

app.all<{ Params: { "*": string } }>("/api/*", async (req, reply) => {
  const tenantId = req.headers["x-tenant-id"] as string | undefined;
  if (!tenantId) return reply.status(400).send({ error: "missing x-tenant-id header" });
  const apiPath = req.params["*"];
  const fnRequest: FunctionRequest = {
    method: req.method,
    path: req.url,
    query: req.query as Record<string, string>,
    headers: req.headers as Record<string, string>,
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
