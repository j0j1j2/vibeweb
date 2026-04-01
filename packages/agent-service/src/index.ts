import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { AGENT_SERVICE_PORT, SESSION_TIMEOUT_MS, SESSION_IMAGE, K8S_NAMESPACE, K8S_PVC_NAME } from "@vibeweb/shared";
import { getK8sApi } from "./k8s.js";
import type { WsMessage } from "@vibeweb/shared";
import { SessionManager } from "./session.js";
import { SessionProxy } from "./proxy.js";
import { generateClaudeMd } from "./claude-md.js";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");
const TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? "";
const FALLBACK_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const app = Fastify({ logger: true });
if (TOKEN_KEY === "a".repeat(64) || !TOKEN_KEY) {
  app.log.warn("WARNING: Using default TOKEN_ENCRYPTION_KEY. Change this in production!");
}
const sessionManager = new SessionManager(tenantsDir);
const proxies = new Map<string, SessionProxy>();

app.get("/health", async () => ({ status: "ok" }));

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function isValidTenantId(id: string): boolean { return UUID_RE.test(id); }

// Track active login pods per tenant
const loginPods = new Map<string, { podName: string }>();

// POST /auth/claude/:tenantId/login - Start claude login flow via K8s Pod (TTY mode)
app.post<{ Params: { tenantId: string } }>("/auth/claude/:tenantId/login", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
  fs.mkdirSync(claudeAuthDir, { recursive: true });

  // Clean up previous login pod
  const prev = loginPods.get(tenantId);
  if (prev) {
    try { await getK8sApi().deleteNamespacedPod({ name: prev.podName, namespace: K8S_NAMESPACE }); } catch {}
    loginPods.delete(tenantId);
  }

  const podName = `login-${tenantId.slice(0, 8)}-${Date.now().toString(36)}`;
  const api = getK8sApi();

  try {
    await api.createNamespacedPod({
      namespace: K8S_NAMESPACE,
      body: {
        metadata: {
          name: podName,
          namespace: K8S_NAMESPACE,
          labels: { "vibeweb.role": "auth-login", "vibeweb.tenant": tenantId },
        },
        spec: {
          restartPolicy: "Never",
          automountServiceAccountToken: false,
          containers: [{
            name: "login",
            image: process.env.SESSION_IMAGE ?? SESSION_IMAGE,
            imagePullPolicy: "Always",
            command: ["sh", "-c", [
              "mkdir -p /tenant/claude-auth /home/vibe/.claude",
              "cp -a /tenant/claude-auth/. /home/vibe/.claude/ 2>/dev/null",
              "chown -R vibe:vibe /home/vibe /tenant/claude-auth 2>/dev/null",
              'su vibe -c "HOME=/home/vibe claude setup-token"',
            ].join(" && ")],
            stdin: true,
            tty: true,
            volumeMounts: [
              { name: "tenant-data", mountPath: "/tenant/claude-auth", subPath: `tenants/${tenantId}/claude-auth` },
            ],
            resources: { requests: { memory: "64Mi", cpu: "100m" } },
          }],
          volumes: [
            { name: "tenant-data", persistentVolumeClaim: { claimName: K8S_PVC_NAME } },
          ],
        },
      },
    });

    // Wait for pod running
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const pod = await api.readNamespacedPodStatus({ name: podName, namespace: K8S_NAMESPACE });
      if (pod?.status?.phase === "Running") break;
      if (pod?.status?.phase === "Failed") throw new Error("Login pod failed");
      await new Promise(r => setTimeout(r, 200));
    }

    // Poll logs to capture OAuth URL (TTY mode includes ANSI codes)
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for OAuth URL")), 60_000);
      const poll = async () => {
        try {
          const logOutput = await api.readNamespacedPodLog({ name: podName, namespace: K8S_NAMESPACE });
          const output = typeof logOutput === "string" ? logOutput : "";
          const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\[[0-9;]*[a-z]/g, "").replace(/[\r\n\t]/g, "").replace(/[^\x20-\x7E]/g, "");
          const m = clean.match(/(https:\/\/claude\.com\/cai\/oauth\/authorize\?[^]*?state=[A-Za-z0-9_-]+)/);
          if (m) { clearTimeout(timeout); resolve(m[1].replace(/Paste.*$/, "")); return; }
        } catch {}
        if (Date.now() < deadline) setTimeout(poll, 1000);
      };
      poll();
    });

    loginPods.set(tenantId, { podName });

    // Auto-cleanup after 5 minutes
    setTimeout(async () => {
      const entry = loginPods.get(tenantId);
      if (entry) {
        try { await api.deleteNamespacedPod({ name: entry.podName, namespace: K8S_NAMESPACE }); } catch {}
        loginPods.delete(tenantId);
      }
    }, 300_000);

    // Monitor token output from logs in background
    (async () => {
      const tokenDeadline = Date.now() + 300_000;
      while (Date.now() < tokenDeadline && loginPods.has(tenantId)) {
        try {
          const logOutput = await api.readNamespacedPodLog({ name: podName, namespace: K8S_NAMESPACE });
          const text = (typeof logOutput === "string" ? logOutput : "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[^\x20-\x7E\n]/g, "");
          const words = text.split(/[\s\n\r]+/);
          const tokenWord = words.find(w => w.startsWith("sk-ant-oat"));
          if (tokenWord) {
            const token = tokenWord.replace(/[^A-Za-z0-9_-]/g, "").replace(/(Stored?|credentials|Success|Done|saved).*$/i, "");
            fs.mkdirSync(claudeAuthDir, { recursive: true });
            fs.writeFileSync(path.join(claudeAuthDir, "oauth-token"), token);
            fs.writeFileSync(path.join(claudeAuthDir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));
            app.log.info(`Token captured from logs for tenant ${tenantId}`);
            break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 2000));
      }
    })();

    return { url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start login";
    try { await api.deleteNamespacedPod({ name: podName, namespace: K8S_NAMESPACE }); } catch {}
    return reply.status(500).send({ error: message });
  }
});

// POST /auth/claude/:tenantId/code - Send auth code via K8s Attach or save token directly
app.post<{ Params: { tenantId: string }; Body: { code: string } }>("/auth/claude/:tenantId/code", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const { code } = req.body;
  if (!code) return reply.status(400).send({ error: "code is required" });

  const authDir = path.join(tenantsDir, tenantId, "claude-auth");
  fs.mkdirSync(authDir, { recursive: true });
  const entry = loginPods.get(tenantId);

  try {
    // If code looks like a token, save it directly
    if (code.startsWith("sk-ant-")) {
      fs.writeFileSync(path.join(authDir, "oauth-token"), code.trim());
      fs.writeFileSync(path.join(authDir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));
      if (entry) {
        try { await getK8sApi().deleteNamespacedPod({ name: entry.podName, namespace: K8S_NAMESPACE }); } catch {}
        loginPods.delete(tenantId);
      }
      return { success: true };
    }

    // OAuth code — send to login Pod via K8s Attach API (stdin)
    if (!entry) return reply.status(404).send({ error: "No active login session. Click Connect first." });

    app.log.info(`Sending auth code via K8s Attach for tenant ${tenantId}: ${code.substring(0, 20)}...`);

    const { getK8sConfig } = await import("./k8s.js");
    const k8s = await import("@kubernetes/client-node");
    const { Readable, Writable } = await import("node:stream");
    const kc = getK8sConfig();
    const attach = new k8s.Attach(kc);

    // Create a readable stream that sends the code then ends
    const stdinStream = new Readable({
      read() {
        this.push(code.trim() + "\r");
        this.push(null);
      },
    });
    const nullStream = new Writable({ write(_chunk, _enc, cb) { cb(); } });

    await attach.attach(K8S_NAMESPACE, entry.podName, "login", nullStream, nullStream, stdinStream, true);

    // Poll for credentials to appear
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1000));
      if (checkCredentials(authDir)) {
        app.log.info(`Credentials saved for tenant ${tenantId}`);
        break;
      }
      try {
        const pod = await getK8sApi().readNamespacedPodStatus({ name: entry.podName, namespace: K8S_NAMESPACE });
        if (pod?.status?.phase !== "Running") break;
      } catch { break; }
    }

    loginPods.delete(tenantId);

    const claudeJsonPath = path.join(authDir, ".claude.json");
    if (!fs.existsSync(claudeJsonPath)) {
      fs.writeFileSync(claudeJsonPath, JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));
    }

    const hasCredentials = checkCredentials(authDir);
    app.log.info(`Auth code exchange for ${tenantId}: credentials=${hasCredentials}`);
    return { success: hasCredentials };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to exchange code";
    loginPods.delete(tenantId);
    app.log.error(`Code exchange error: ${message}`);
    return reply.status(500).send({ error: message });
  }
});

// POST /auth/claude/:tenantId/token - Save token directly (admin pastes from setup-token)
app.post<{ Params: { tenantId: string }; Body: { token: string } }>("/auth/claude/:tenantId/token", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const { token } = req.body;
  if (!token || !token.trim()) return reply.status(400).send({ error: "token is required" });

  const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
  fs.mkdirSync(claudeAuthDir, { recursive: true });
  fs.writeFileSync(path.join(claudeAuthDir, "oauth-token"), token.trim());

  // Create minimal .claude.json for onboarding bypass
  fs.writeFileSync(path.join(claudeAuthDir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));

  app.log.info(`Token saved for tenant ${tenantId}`);
  return { success: true };
});

// GET /auth/claude/:tenantId/status - Check if tenant has credentials + details
app.get<{ Params: { tenantId: string } }>("/auth/claude/:tenantId/status", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
  const connected = checkCredentials(claudeAuthDir);

  if (!connected) return { connected: false };

  const tokenFile = path.join(claudeAuthDir, "oauth-token");
  const token = fs.readFileSync(tokenFile, "utf-8").trim();
  const tokenPrefix = token.substring(0, 6) + "•".repeat(12);

  // Get file modification time as "connected since"
  const stat = fs.statSync(tokenFile);
  const connectedAt = stat.mtime.toISOString();

  // Read metadata if available
  const metaFile = path.join(claudeAuthDir, "meta.json");
  let meta: Record<string, unknown> = {};
  if (fs.existsSync(metaFile)) {
    try { meta = JSON.parse(fs.readFileSync(metaFile, "utf-8")); } catch {}
  }

  return {
    connected: true,
    tokenPrefix,
    connectedAt,
    tokenType: token.startsWith("sk-ant-oat") ? "Claude OAuth" : "API Key",
    ...meta,
  };
});

// DELETE /auth/claude/:tenantId - Remove tenant credentials
app.delete<{ Params: { tenantId: string } }>("/auth/claude/:tenantId", async (req, reply) => {
  if (!isValidTenantId(req.params.tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const claudeAuthDir = path.join(tenantsDir, req.params.tenantId, "claude-auth");
  if (fs.existsSync(claudeAuthDir)) {
    fs.rmSync(claudeAuthDir, { recursive: true, force: true });
  }
  return reply.status(204).send();
});

function checkCredentials(dir: string): boolean {
  return fs.existsSync(path.join(dir, "oauth-token"));
}

function readOAuthToken(tenantId: string): string | null {
  const tokenFile = path.join(tenantsDir, tenantId, "claude-auth", "oauth-token");
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, "utf-8").trim();
  }
  return null;
}

const start = async () => {
  await sessionManager.cleanupOrphanPods();
  await app.listen({ port: AGENT_SERVICE_PORT, host: "0.0.0.0" });

  const server = app.server as http.Server;
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (userWs: WebSocket, req: http.IncomingMessage) => {
    app.log.info("User WebSocket connected");
    let currentSessionId: string | null = null;
    // Trust X-Tenant-Id from Traefik's forwardAuth — NOT the client message
    const verifiedTenantId = req.headers["x-tenant-id"] as string | undefined;

    userWs.on("message", async (raw) => {
      try {
        const msg: WsMessage = JSON.parse(raw.toString());

        if (msg.type === "session.start") {
          // Prefer X-Tenant-Id from Traefik forwardAuth; fall back to client-supplied tenantId (console path)
          const tenantId = verifiedTenantId || msg.tenantId;
          if (!tenantId || !isValidTenantId(tenantId)) {
            userWs.close(4001, "Missing tenant authentication");
            return;
          }
          currentSessionId = await handleSessionStart(userWs, tenantId, msg.locale || "ko");
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
        // Don't destroy immediately — schedule for grace period
        sessionManager.scheduleDestroy(currentSessionId);
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

async function handleSessionStart(userWs: WebSocket, tenantId: string, locale: string = "ko"): Promise<string> {
  if (!isValidTenantId(tenantId)) throw new Error("Invalid tenant ID");
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
  const claudeMd = generateClaudeMd(tenantId, previewDir, dbDir, locale);

  // Write CLAUDE.md to preview dir
  fs.writeFileSync(path.join(previewDir, "CLAUDE.md"), claudeMd);

  const session = await sessionManager.getOrCreateSession({ tenantId, sessionId, claudeMdContent: claudeMd, authToken });

  // Connect to bridge with retry
  const bridgeUrl = `ws://${session.bridgeHost}:${session.bridgePort}`;
  const bridgeWs = await connectWithRetry(bridgeUrl, 10, 500);

  const proxy = new SessionProxy(sessionId, userWs, bridgeWs);

  bridgeWs.on("message", (data: Buffer) => {
    proxy.handleBridgeMessage(data.toString());
  });

  bridgeWs.on("close", () => {
    app.log.info(`Bridge WebSocket closed for session ${sessionId}`);
    proxy.sendToUser({ type: "session.closed", reason: "bridge_disconnected" });
    proxy.close();
    proxies.delete(sessionId);
    sessionManager.scheduleDestroy(sessionId);
  });

  proxies.set(sessionId, proxy);
  userWs.send(JSON.stringify({ type: "session.ready", sessionId }));
  return sessionId;
}

function handleUserMessage(sessionId: string, msg: WsMessage): void {
  const proxy = proxies.get(sessionId);
  if (!proxy) { app.log.warn(`No proxy for session ${sessionId}`); return; }
  app.log.info(`Forwarding message to bridge for session ${sessionId}: ${(msg.content ?? "").substring(0, 50)}`);
  proxy.sendToBridge({ type: "message", content: msg.content });
}

async function handleSessionEnd(sessionId: string, userWs: WebSocket): Promise<void> {
  const proxy = proxies.get(sessionId);
  if (proxy) {
    proxy.close();
    proxies.delete(sessionId);
  }
  // Don't destroy container — schedule grace period
  sessionManager.scheduleDestroy(sessionId);
  userWs.send(JSON.stringify({ type: "session.closed", sessionId }));
}

function resolveAuthToken(tenantId: string): string | null {
  // Check for OAuth token (from setup-token)
  const oauthToken = readOAuthToken(tenantId);
  if (oauthToken) return oauthToken;
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
