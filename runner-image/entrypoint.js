// Runs inside the isolated container. Loads the target function module,
// executes it with the request from env vars, writes response to stdout.

const path = require("node:path");

async function main() {
  const fnPath = process.env.FUNCTION_PATH;
  if (!fnPath) {
    writeResponse({ status: 500, headers: {}, body: { error: "FUNCTION_PATH not set" } });
    return;
  }

  const fullPath = path.join("/app", fnPath);

  let handler;
  try {
    const mod = await import(fullPath);
    handler = mod.default ?? mod;
  } catch (err) {
    writeResponse({ status: 500, headers: {}, body: { error: `Failed to load function: ${err.message}` } });
    return;
  }

  if (typeof handler !== "function") {
    writeResponse({ status: 500, headers: {}, body: { error: "Module does not export a function" } });
    return;
  }

  const req = {
    method: process.env.REQ_METHOD ?? "GET",
    path: process.env.REQ_PATH ?? "/",
    query: JSON.parse(process.env.REQ_QUERY ?? "{}"),
    headers: JSON.parse(process.env.REQ_HEADERS ?? "{}"),
    body: process.env.REQ_BODY ?? "",
  };

  try {
    const result = await handler(req);
    writeResponse({
      status: result.status ?? 200,
      headers: result.headers ?? {},
      body: result.body ?? null,
    });
  } catch (err) {
    writeResponse({ status: 500, headers: {}, body: { error: `Function error: ${err.message}` } });
  }
}

function writeResponse(res) {
  process.stdout.write(JSON.stringify(res) + "\n");
}

main();
