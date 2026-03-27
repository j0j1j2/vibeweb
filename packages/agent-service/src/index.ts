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

// Track active login containers per tenant (container + stdin stream)
const loginContainers = new Map<string, { container: Docker.Container; stream: NodeJS.ReadWriteStream }>();

// POST /auth/claude/:tenantId/login - Start claude login flow for a tenant
app.post<{ Params: { tenantId: string } }>("/auth/claude/:tenantId/login", async (req, reply) => {
  const { tenantId } = req.params;
  // Ensure tenant claude-auth dir exists (inside the volume)
  const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
  fs.mkdirSync(claudeAuthDir, { recursive: true });

  const prev = loginContainers.get(tenantId);
  if (prev) {
    try { await prev.container.stop(); await prev.container.remove(); } catch {}
    loginContainers.delete(tenantId);
  }

  const volumeName = process.env.TENANT_VOLUME_NAME ?? "vibeweb_tenant-data";

  try {
    // Use setup-token: it shows OAuth URL + "Paste code here" prompt on stdin
    const container = await docker.createContainer({
      Image: SESSION_IMAGE,
      Cmd: ["sh", "-c", `
        mkdir -p /data/tenants/${tenantId}/claude-auth &&
        rm -f /root/.claude && ln -s /data/tenants/${tenantId}/claude-auth /root/.claude &&
        claude setup-token
      `],
      Env: [`HOME=/root`],
      HostConfig: {
        Mounts: [
          { Type: "volume" as const, Source: volumeName, Target: "/data/tenants", ReadOnly: false },
        ],
      },
      Labels: { "vibeweb.role": "auth-login", "vibeweb.tenant": tenantId },
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
    });

    // Attach BEFORE start to capture stdin stream
    const stream = await container.attach({ stream: true, stdin: true, stdout: true, hijack: true });
    await container.start();

    // Capture output to find the OAuth URL
    // setup-token wraps the URL across multiple lines in TTY mode,
    // so we strip all whitespace/ANSI and look for the full URL
    const url = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(new Error("Timeout. Output: " + output.substring(0, 1000))), 30000);
      stream.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        // Strip ANSI codes, control chars, and ALL whitespace to rejoin wrapped URL
        const clean = output
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
          .replace(/[\r\n\t]/g, "")
          .replace(/[^\x20-\x7E]/g, "");
        // Match the full URL (now on one line after stripping)
        const m = clean.match(/(https:\/\/claude\.com\/cai\/oauth\/authorize\?[^]*?state=[A-Za-z0-9_-]+)/);
        if (m) {
          clearTimeout(timeout);
          resolve(m[1].replace(/Paste.*$/, ""));
        }
      });
    });

    // Store container + stream for code submission
    loginContainers.set(tenantId, { container, stream });

    // Auto-cleanup after 5 minutes
    setTimeout(async () => {
      if (loginContainers.has(tenantId)) {
        const entry = loginContainers.get(tenantId)!;
        try { await entry.container.stop(); await entry.container.remove(); } catch {}
        loginContainers.delete(tenantId);
      }
    }, 300_000);

    // Auto-cleanup when container exits
    container.wait().then(() => {
      container.remove().catch(() => {});
      app.log.info(`Login container for ${tenantId} exited`);
    });

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

  const entry = loginContainers.get(tenantId);
  if (!entry) {
    return reply.status(404).send({ error: "no active login session. Click Connect first." });
  }

  try {
    // Try sending the code via stdin (Tty mode needs \r)
    entry.stream.write(code + "\r");
    app.log.info(`Sent auth code to login container for ${tenantId}`);

    // Wait for container to exit or credentials to appear (whichever first)
    const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
    const success = await Promise.race([
      entry.container.wait().then(() => checkCredentials(claudeAuthDir)),
      // Also poll for credentials (in case CLI auto-detects without stdin)
      new Promise<boolean>((resolve) => {
        const poll = setInterval(() => {
          if (checkCredentials(claudeAuthDir)) { clearInterval(poll); resolve(true); }
        }, 1000);
        setTimeout(() => { clearInterval(poll); resolve(false); }, 30000);
      }),
    ]);

    if (success) {
      try { await entry.container.stop(); await entry.container.remove(); } catch {}
      loginContainers.delete(tenantId);
    }

    app.log.info(`Auth result for ${tenantId}: credentials=${success}`);
    return { success };
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
  const bridgeUrl = `ws://${session.bridgeHost}:${session.bridgePort}`;
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
  if (!proxy) { app.log.warn(`No proxy for session ${sessionId}`); return; }
  app.log.info(`Forwarding message to bridge for session ${sessionId}: ${(msg.content ?? "").substring(0, 50)}`);
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
