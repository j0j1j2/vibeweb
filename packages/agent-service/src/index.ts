import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import Docker from "dockerode";
import { AGENT_SERVICE_PORT, SESSION_TIMEOUT_MS, SESSION_IMAGE } from "@vibeweb/shared";
import type { WsMessage } from "@vibeweb/shared";
import { SessionManager } from "./session.js";
import { SessionProxy } from "./proxy.js";
import { generateClaudeMd } from "./claude-md.js";
import { decryptToken } from "./crypto.js";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");
const TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "";
const FALLBACK_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const app = Fastify({ logger: true });
const sessionManager = new SessionManager(tenantsDir);
const proxies = new Map<string, SessionProxy>();

app.get("/health", async () => ({ status: "ok" }));

// Track active login containers per tenant
const loginContainers = new Map<string, Docker.Container>();

// POST /auth/claude/:tenantId/login - Start claude login flow for a tenant
app.post<{ Params: { tenantId: string } }>("/auth/claude/:tenantId/login", async (req, reply) => {
  const { tenantId } = req.params;
  // Ensure tenant claude-auth dir exists (inside the volume)
  const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
  fs.mkdirSync(claudeAuthDir, { recursive: true });

  const prev = loginContainers.get(tenantId);
  if (prev) {
    try { await prev.stop(); await prev.remove(); } catch {}
    loginContainers.delete(tenantId);
  }

  const volumeName = process.env.TENANT_VOLUME_NAME ?? "vibeweb_tenant-data";

  try {
    // Step 1: Get OAuth URL from a throwaway container (stdin=/dev/null so it doesn't block)
    const urlContainer = await docker.createContainer({
      Image: SESSION_IMAGE,
      Cmd: ["sh", "-c", "claude auth login < /dev/null"],
      Env: [`HOME=/root`],
      Labels: { "vibeweb.role": "auth-login-url" },
      Tty: false,
    });
    await urlContainer.start();

    const stream = await urlContainer.logs({ follow: true, stdout: true, stderr: true });
    const url = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(new Error("Timeout. Output: " + output.substring(0, 500))), 15000);
      stream.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[^\x20-\x7E\n\r]/g, "");
        const m = clean.match(/(https:\/\/claude\.com\/[^\s]+)/);
        if (m) { clearTimeout(timeout); resolve(m[1]); }
      });
      stream.on("end", () => { clearTimeout(timeout); reject(new Error("No URL found")); });
    });

    // Kill URL container — we only needed the URL
    urlContainer.stop().then(() => urlContainer.remove()).catch(() => {});

    // Mark login as active for this tenant
    loginContainers.set(tenantId, urlContainer);
    setTimeout(() => loginContainers.delete(tenantId), 300_000);

    return { url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start login";
    return reply.status(500).send({ error: message });
  }
});

// POST /auth/claude/:tenantId/code - Submit the OAuth authorization code
app.post<{ Params: { tenantId: string }; Body: { code: string } }>("/auth/claude/:tenantId/code", async (req, reply) => {
  const { tenantId } = req.params;
  const { code } = req.body;
  if (!code) return reply.status(400).send({ error: "code is required" });

  if (!loginContainers.has(tenantId)) {
    return reply.status(404).send({ error: "no active login session. Click Connect first." });
  }

  const volumeName = process.env.TENANT_VOLUME_NAME ?? "vibeweb_tenant-data";

  try {
    // Step 2: Run a NEW container that pipes the code into claude auth login
    // This container saves credentials to the tenant's claude-auth directory
    const safeCode = code.replace(/'/g, "'\\''");
    const authContainer = await docker.createContainer({
      Image: SESSION_IMAGE,
      Cmd: ["sh", "-c", `
        mkdir -p /data/tenants/${tenantId}/claude-auth &&
        rm -f /root/.claude && ln -s /data/tenants/${tenantId}/claude-auth /root/.claude &&
        echo '${safeCode}' | claude auth login
      `],
      Env: [`HOME=/root`],
      HostConfig: {
        Mounts: [
          { Type: "volume" as const, Source: volumeName, Target: "/data/tenants", ReadOnly: false },
        ],
      },
      Labels: { "vibeweb.role": "auth-login-code", "vibeweb.tenant": tenantId },
      Tty: false,
    });

    await authContainer.start();

    // Wait for it to complete
    await Promise.race([
      authContainer.wait(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 60000)),
    ]);

    // Check logs for success/failure
    const logs = (await authContainer.logs({ stdout: true, stderr: true })).toString();
    await authContainer.remove().catch(() => {});
    loginContainers.delete(tenantId);

    const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
    const hasCredentials = checkCredentials(claudeAuthDir);

    app.log.info(`Auth result for ${tenantId}: credentials=${hasCredentials}, logs=${logs.substring(0, 200)}`);

    return { success: hasCredentials };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit code";
    loginContainers.delete(tenantId);
    return reply.status(500).send({ error: message });
  }
});

// GET /auth/claude/:tenantId/status - Check if tenant has credentials
app.get<{ Params: { tenantId: string } }>("/auth/claude/:tenantId/status", async (req) => {
  const claudeAuthDir = path.join(tenantsDir, req.params.tenantId, "claude-auth");
  return { connected: checkCredentials(claudeAuthDir) };
});

// DELETE /auth/claude/:tenantId - Remove tenant credentials
app.delete<{ Params: { tenantId: string } }>("/auth/claude/:tenantId", async (req, reply) => {
  const claudeAuthDir = path.join(tenantsDir, req.params.tenantId, "claude-auth");
  if (fs.existsSync(claudeAuthDir)) {
    fs.rmSync(claudeAuthDir, { recursive: true, force: true });
  }
  return reply.status(204).send();
});

function checkCredentials(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const files = fs.readdirSync(dir);
  return files.some(f => f.includes("credential") || f.includes("auth") || f.endsWith(".json"));
}

const start = async () => {
  await sessionManager.cleanupOrphanContainers();
  await app.listen({ port: AGENT_SERVICE_PORT, host: "0.0.0.0" });

  const server = app.server as http.Server;
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (userWs: WebSocket) => {
    app.log.info("User WebSocket connected");
    let currentSessionId: string | null = null;

    userWs.on("message", async (raw) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString());

        if (msg.type === "session.start") {
          currentSessionId = await handleSessionStart(userWs, msg.tenantId!);
        } else if (msg.type === "message" && msg.sessionId) {
          handleUserMessage(msg.sessionId, msg);
          currentSessionId = msg.sessionId;
        } else if (msg.type === "session.end" && msg.sessionId) {
          await handleSessionEnd(msg.sessionId, userWs);
          currentSessionId = null;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        app.log.error(`WebSocket error: ${message}`);
        userWs.send(JSON.stringify({ type: "error", error: message }));
      }
    });

    userWs.on("close", async () => {
      app.log.info("User WebSocket disconnected");
      if (currentSessionId) {
        const proxy = proxies.get(currentSessionId);
        if (proxy) proxy.close();
        proxies.delete(currentSessionId);
        await sessionManager.destroySession(currentSessionId);
      }
    });
  });

  // Timeout watchdog
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, proxy] of proxies) {
      if (now - proxy.lastActivityAt > SESSION_TIMEOUT_MS) {
        app.log.info(`Session ${sessionId} timed out`);
        proxy.sendToUser({ type: "session.closed", reason: "timeout" });
        proxy.close();
        proxies.delete(sessionId);
        sessionManager.destroySession(sessionId);
      }
    }
  }, 60_000);

  app.log.info("Agent Service ready");
};

async function handleSessionStart(userWs: WebSocket, tenantId: string): Promise<string> {
  const sessionId = uuidv4();

  const authToken = resolveAuthToken(tenantId);
  if (authToken === null) {
    // null = no auth at all
    userWs.send(JSON.stringify({
      type: "error",
      error: "No Claude authentication configured. Connect your Claude account in Settings.",
    }));
    throw new Error("No auth token available");
  }

  const previewDir = path.join(tenantsDir, tenantId, "preview");
  const dbDir = path.join(tenantsDir, tenantId, "db");
  fs.mkdirSync(previewDir, { recursive: true });
  fs.mkdirSync(dbDir, { recursive: true });
  const claudeMd = generateClaudeMd(tenantId, previewDir, dbDir);

  // Write CLAUDE.md to preview dir
  fs.writeFileSync(path.join(previewDir, "CLAUDE.md"), claudeMd);

  const session = await sessionManager.createSession({ tenantId, sessionId, claudeMdContent: claudeMd, authToken });

  // Connect to bridge with retry
  const bridgeUrl = `ws://localhost:${session.bridgePort}`;
  const bridgeWs = await connectWithRetry(bridgeUrl, 10, 500);

  const proxy = new SessionProxy(sessionId, userWs, bridgeWs);

  bridgeWs.on("message", (data: Buffer) => {
    proxy.handleBridgeMessage(data.toString());
  });

  bridgeWs.on("close", () => {
    app.log.info(`Bridge WebSocket closed for session ${sessionId}`);
  });

  proxies.set(sessionId, proxy);
  userWs.send(JSON.stringify({ type: "session.ready", sessionId }));
  return sessionId;
}

function handleUserMessage(sessionId: string, msg: WsMessage): void {
  const proxy = proxies.get(sessionId);
  if (!proxy) return;
  proxy.sendToBridge({ type: "message", content: msg.content });
}

async function handleSessionEnd(sessionId: string, userWs: WebSocket): Promise<void> {
  const proxy = proxies.get(sessionId);
  if (proxy) {
    proxy.sendToBridge({ type: "session.end" });
    proxy.close();
    proxies.delete(sessionId);
  }
  await sessionManager.destroySession(sessionId);
  userWs.send(JSON.stringify({ type: "session.closed", sessionId }));
}

function resolveAuthToken(tenantId: string): string | null {
  // Check if tenant has claude-auth credentials (from claude login)
  const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
  if (checkCredentials(claudeAuthDir)) {
    return ""; // Empty string = use mounted credentials instead of API key
  }
  // Fallback to API key
  if (FALLBACK_API_KEY) return FALLBACK_API_KEY;
  return null;
}

async function connectWithRetry(url: string, maxRetries: number, delayMs: number): Promise<WebSocket> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
      });
    } catch {
      if (i === maxRetries - 1) throw new Error(`Failed to connect to bridge at ${url}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Unreachable");
}

start();
