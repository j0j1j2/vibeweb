#!/usr/bin/env node
// Token Helper: runs on HOST to exchange OAuth codes for tokens via claude setup-token
// Usage: node scripts/token-helper.js [port]
// The agent-service (in Docker) calls this helper to exchange codes

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.argv[2] || "3004");
// When running on host, tenants data is in the Docker volume
// We need to write to the same volume the containers use
const TENANTS_DIR = process.env.TENANTS_DIR || "/tmp/vibeweb-tenants";

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  if (req.method === "POST" && req.url === "/exchange") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", async () => {
      try {
        const { tenantId, code } = JSON.parse(body);
        if (!tenantId || !code) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "tenantId and code required" }));
          return;
        }

        console.log(`Exchanging code for tenant ${tenantId}...`);
        const result = await exchangeCode(tenantId, code);
        res.writeHead(result.success ? 200 : 500);
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

function exchangeCode(tenantId, code) {
  return new Promise((resolve) => {
    const tenantHome = `/tmp/claude-oauth-${tenantId}`;
    fs.mkdirSync(tenantHome, { recursive: true });

    // Use expect to run claude setup-token and feed the code
    const expect = spawn("expect", ["-c", `
      set timeout 60
      set env(HOME) ${tenantHome}
      spawn claude setup-token
      expect {
        -re {Paste.code} { }
        timeout { exit 1 }
      }
      send "${code.replace(/"/g, '\\"')}\\r"
      expect {
        -re {sk-ant-oat[A-Za-z0-9_-]+} {
          set token $expect_out(0,string)
          puts "TOKEN:$token"
        }
        -re {error|Error} { puts "ERROR" }
        timeout { puts "TIMEOUT" }
      }
      expect eof
    `]);

    let output = "";
    expect.stdout.on("data", (d) => output += d.toString());
    expect.stderr.on("data", (d) => output += d.toString());

    expect.on("close", (exitCode) => {
      // Extract token from output
      const lines = output.split("\n");
      let token = "";
      for (const line of lines) {
        const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
        const m = clean.match(/TOKEN:(sk-ant-oat[A-Za-z0-9_-]+)/);
        if (m) { token = m[1]; break; }
        // Also check for raw token in output
        const m2 = clean.match(/(sk-ant-oat01-[A-Za-z0-9_-]{50,})/);
        if (m2) { token = m2[1]; break; }
      }

      if (token) {
        // Save token
        const authDir = path.join(TENANTS_DIR, tenantId, "claude-auth");
        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(path.join(authDir, "oauth-token"), token);
        fs.writeFileSync(path.join(authDir, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));
        console.log(`Token saved for ${tenantId}: ${token.substring(0, 20)}...`);
        resolve({ success: true });
      } else {
        console.error(`Failed for ${tenantId}. Output: ${output.substring(output.length - 300)}`);
        resolve({ success: false, error: "Failed to exchange code. Check token-helper logs." });
      }
    });
  });
}

server.listen(PORT, () => {
  console.log(`Token Helper running on http://localhost:${PORT}`);
  console.log(`Tenants dir: ${TENANTS_DIR}`);
});
