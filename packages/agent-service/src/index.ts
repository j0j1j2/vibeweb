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

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

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

// Track active login containers per tenant (container + stdin stream)
const loginContainers = new Map<string, { container: Docker.Container; stream: NodeJS.ReadWriteStream }>();

// POST /auth/claude/:tenantId/login - Start claude login flow for a tenant
app.post<{ Params: { tenantId: string } }>("/auth/claude/:tenantId/login", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
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
        mkdir -p /tenant/claude-auth /home/vibe/.claude &&
        cp -a /tenant/claude-auth/. /home/vibe/.claude/ 2>/dev/null;
        chown -R vibe:vibe /home/vibe /tenant/claude-auth 2>/dev/null;
        exec su vibe -c "HOME=/home/vibe claude setup-token"
      `],
      Env: [`HOME=/root`],
      HostConfig: {
        Mounts: [
          {
            Type: "volume" as const,
            Source: volumeName,
            Target: "/tenant/claude-auth",
            ReadOnly: false,
            VolumeOptions: { Subpath: `${tenantId}/claude-auth` } as any,
          },
        ],
        Memory: 256 * 1024 * 1024,
        NanoCpus: 0.5 * 1e9,
        PidsLimit: 64,
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

    // Monitor stream for token output (setup-token prints sk-ant-oat... after code exchange)
    stream.on("data", (chunk: Buffer) => {
      const text = chunk.toString().replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[^\x20-\x7E\n]/g, "");
      // Split by whitespace/newlines, find the token fragment
      const words = text.split(/[\s\n\r]+/);
      const tokenWord = words.find(w => w.startsWith("sk-ant-oat"));
      if (tokenWord) {
        // setup-token may output "sk-ant-oat...AAStored credentials..." with no separator
        // Strip known CLI output suffixes that get concatenated to the token
        const token = tokenWord
          .replace(/[^A-Za-z0-9_-]/g, "")
          .replace(/(Stored?|credentials|Success|Done|saved).*$/i, "");
        const authDir = path.join(tenantsDir, tenantId, "claude-auth");
        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(path.join(authDir, "oauth-token"), token);
        fs.writeFileSync(path.join(authDir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));
        app.log.info(`Token captured and saved for tenant ${tenantId}`);
      }
    });

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

// POST /auth/claude/:tenantId/code - Send auth code to the running setup-token container
app.post<{ Params: { tenantId: string }; Body: { code: string } }>("/auth/claude/:tenantId/code", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const { code } = req.body;
  if (!code) return reply.status(400).send({ error: "code is required" });

  const entry = loginContainers.get(tenantId);
  if (!entry) {
    return reply.status(404).send({ error: "No active login session. Click Connect first." });
  }

  try {
    // Send code to the SAME container that generated the OAuth URL (same PKCE session)
    // TTY mode needs \r as Enter
    app.log.info(`Sending auth code to setup-token for tenant ${tenantId}: ${code.substring(0, 20)}...`);
    entry.stream.write(code + "\r");

    // Wait for container to exit (setup-token completes after code exchange)
    await Promise.race([
      entry.container.wait(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for token exchange")), 60000)),
    ]);

    loginContainers.delete(tenantId);

    // Check if credentials were saved
    const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");

    // Create .claude.json if not exists
    const claudeJsonPath = path.join(claudeAuthDir, ".claude.json");
    if (!fs.existsSync(claudeJsonPath)) {
      fs.mkdirSync(claudeAuthDir, { recursive: true });
      fs.writeFileSync(claudeJsonPath, JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));
    }

    const hasCredentials = checkCredentials(claudeAuthDir);
    app.log.info(`Auth code exchange for ${tenantId}: credentials=${hasCredentials}`);

    return { success: hasCredentials };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to exchange code";
    loginContainers.delete(tenantId);
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
  await sessionManager.cleanupOrphanContainers();
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
          if (!verifiedTenantId) {
            userWs.close(4001, "Missing tenant authentication");
            return;
          }
          currentSessionId = await handleSessionStart(userWs, verifiedTenantId, msg.locale || "ko");
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
