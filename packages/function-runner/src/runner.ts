import path from "node:path";
import fs from "node:fs";
import type { FunctionRequest, FunctionResponse } from "@vibeweb/shared";
import { runInContainer } from "./container.js";

export async function handleFunctionRequest(
  tenantId: string, apiPath: string, request: FunctionRequest, tenantsDir: string
): Promise<FunctionResponse> {
  const functionPath = `api/${apiPath}.js`;
  const functionsDir = path.join(tenantsDir, tenantId, "functions");
  const dbDir = path.join(tenantsDir, tenantId, "db");
  const fullPath = path.join(functionsDir, functionPath);

  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(functionsDir))) {
    return { status: 403, headers: {}, body: { error: "Forbidden" } };
  }

  if (!fs.existsSync(fullPath)) {
    return { status: 404, headers: {}, body: { error: `Function not found: ${apiPath}` } };
  }

  try {
    return await runInContainer({ tenantId, functionPath, functionsDir, dbDir, request });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("timed out")) {
      return { status: 504, headers: {}, body: { error: "Function execution timed out" } };
    }
    return { status: 500, headers: {}, body: { error: message } };
  }
}
