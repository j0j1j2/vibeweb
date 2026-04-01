const { WebSocketServer } = require("ws");
const { spawn } = require("node:child_process");

const PORT = process.env.BRIDGE_PORT ?? 3100;
const WORKSPACE = process.env.WORKSPACE ?? "/workspace";

const wss = new WebSocketServer({ port: Number(PORT) });
console.log(`Bridge server listening on port ${PORT}`);

let claudeProcess = null;
let conversationId = null;
let ws = null;

wss.on("connection", (socket) => {
  console.log("Agent Service connected");
  ws = socket;

  socket.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "message") {
      runClaude(msg.content);
    } else if (msg.type === "session.end") {
      cleanup();
      socket.close();
    }
  });

  socket.on("close", () => {
    console.log("Agent Service disconnected");
    cleanup();
  });
});

function runClaude(prompt) {
  const args = [
    "--print",
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  // Resume within same Pod lifecycle
  if (conversationId) {
    args.push("--resume", conversationId);
  }

  args.push(prompt);

  claudeProcess = spawn("claude", args, {
    cwd: WORKSPACE,
    env: {
      ...process.env,
      HOME: process.env.HOME || "/home/vibe",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";

  claudeProcess.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.session_id) conversationId = parsed.session_id;
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "stream", data: parsed }));
        }
      } catch {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "stream", data: { type: "text", content: line } }));
        }
      }
    }
  });

  claudeProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    console.error(`Claude stderr: ${text}`);
  });

  claudeProcess.on("close", (code) => {
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.session_id) conversationId = parsed.session_id;
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "stream", data: parsed }));
        }
      } catch { /* ignore */ }
    }
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "message.done" }));
    }
    claudeProcess = null;
  });
}

function cleanup() {
  if (claudeProcess) {
    claudeProcess.kill("SIGTERM");
    claudeProcess = null;
  }
}

process.on("SIGTERM", () => {
  cleanup();
  wss.close();
  process.exit(0);
});
