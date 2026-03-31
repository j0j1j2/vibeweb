// Runs inside the isolated container. Loads the target function module,
// executes it with the request from env vars, writes response to stdout.

const path = require("node:path");
const fs = require("node:fs");
const { createRequire } = require("node:module");

const functionsDir = process.env.FUNCTIONS_DIR || "/app";

// Global require resolves from tenant's functions/node_modules
globalThis.require = createRequire(path.join(functionsDir, "node_modules", "_placeholder"));

async function main() {
  const fnPath = process.env.FUNCTION_PATH;
  if (!fnPath) {
    writeResponse({ status: 500, headers: {}, body: { error: "FUNCTION_PATH not set" } });
    return;
  }

  const fullPath = path.join(functionsDir, fnPath);

  // Create /data/db symlink so functions using hardcoded DB paths work
  const dbDir = process.env.DB_DIR;
  if (dbDir) {
    try {
      fs.mkdirSync("/data", { recursive: true });
      if (!fs.existsSync("/data/db")) {
        fs.symlinkSync(dbDir, "/data/db");
      }
    } catch {
      // May fail if non-root - that is ok
    }
  }

  let handler;
  try {
    const mod = await import("file://" + fullPath);
    handler = mod.default ?? mod;
  } catch (err) {
    writeResponse({ status: 500, headers: {}, body: { error: "Failed to load function: " + err.message } });
    return;
  }

  if (typeof handler !== "function") {
    writeResponse({ status: 500, headers: {}, body: { error: "Module does not export a function" } });
    return;
  }

  const req = {
    method: process.env.REQ_METHOD || "GET",
    path: process.env.REQ_PATH || "/",
    query: JSON.parse(process.env.REQ_QUERY || "{}"),
    headers: JSON.parse(process.env.REQ_HEADERS || "{}"),
    body: process.env.REQ_BODY_B64 ? Buffer.from(process.env.REQ_BODY_B64, "base64").toString("utf-8") : (process.env.REQ_BODY || ""),
  };

  try {
    const result = await handler(req);
    writeResponse({
      status: result.status || 200,
      headers: result.headers || {},
      body: result.body || null,
    });
  } catch (err) {
    writeResponse({ status: 500, headers: {}, body: { error: "Function error: " + err.message } });
  }
}

function writeResponse(res) {
  process.stdout.write(JSON.stringify(res) + "\n");
}

main();
