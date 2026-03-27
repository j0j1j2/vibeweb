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

// POST /auth/claude/login - Start claude login flow
app.post("/auth/claude/login", async (req, reply) => {
  const claudeAuthDir = path.join(DATA_DIR, "claude-auth");
  fs.mkdirSync(claudeAuthDir, { recursive: true });

  try {
    // Run claude login in a temp session container
    const container = await docker.createContainer({
      Image: SESSION_IMAGE,
      Cmd: ["claude", "login"],
      Env: [`HOME=/root`],
      HostConfig: {
        Binds: [`${claudeAuthDir}:/root/.claude:rw`],
      },
      Labels: { "vibeweb.role": "auth-login" },
      Tty: true,
      OpenStdin: true,
    });

    await container.start();

    // Capture output to find the URL
    const stream = await container.logs({ follow: true, stdout: true, stderr: true });

    const url = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for login URL"));
      }, 30000);

      stream.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        // Look for URL pattern in claude login output
        const urlMatch = output.match(/(https:\/\/[^\s\x00-\x1f]+)/);
        if (urlMatch) {
          clearTimeout(timeout);
          resolve(urlMatch[1]);
        }
      });

      stream.on("end", () => {
        clearTimeout(timeout);
        reject(new Error("Stream ended without URL. Output: " + output.substring(0, 200)));
      });
    });

    // Store container ID for cleanup later
    const containerId = container.id;

    // Wait for auth to complete in background (container will exit when done)
    container.wait().then(() => {
      container.remove().catch(() => {});
      app.log.info("Claude login container completed");
    }).catch(() => {});

    return { url, containerId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start login";
    return reply.status(500).send({ error: message });
  }
});

// GET /auth/claude/status - Check if credentials exist
app.get("/auth/claude/status", async () => {
  const claudeAuthDir = path.join(DATA_DIR, "claude-auth");
  // Check for credential files that claude login creates
  const hasCredentials = fs.existsSync(claudeAuthDir) && (
    fs.existsSync(path.join(claudeAuthDir, "credentials.json")) ||
    fs.existsSync(path.join(claudeAuthDir, ".credentials.json")) ||
    fs.readdirSync(claudeAuthDir).some(f => f.includes("credential") || f.includes("auth"))
  );

  // List files for debugging
  let files: string[] = [];
  if (fs.existsSync(claudeAuthDir)) {
    files = fs.readdirSync(claudeAuthDir);
  }

  return { connected: hasCredentials, files };
});

// DELETE /auth/claude - Remove credentials
app.delete("/auth/claude", async (req, reply) => {
  const claudeAuthDir = path.join(DATA_DIR, "claude-auth");
  if (fs.existsSync(claudeAuthDir)) {
    fs.rmSync(claudeAuthDir, { recursive: true, force: true });
    fs.mkdirSync(claudeAuthDir, { recursive: true });
  }
  return reply.status(204).send();
});

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
  // Check if claude-auth credentials exist (from claude login)
  const claudeAuthDir = path.join(DATA_DIR, "claude-auth");
  if (fs.existsSync(claudeAuthDir) && fs.readdirSync(claudeAuthDir).length > 0) {
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
