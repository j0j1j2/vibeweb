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

  // Sync from preview/functions/ to top-level functions/ if preview has newer files
  const previewFunctionsDir = path.join(tenantsDir, tenantId, "preview", "functions");
  if (fs.existsSync(previewFunctionsDir)) {
    syncPreviewFunctions(previewFunctionsDir, functionsDir);
  }

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

/** Recursively copy files from preview/functions/ to top-level functions/ */
function syncPreviewFunctions(src: string, dest: string): void {
  try {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        syncPreviewFunctions(srcPath, destPath);
      } else {
        // Only copy if source is newer or dest doesn't exist
        const srcStat = fs.statSync(srcPath);
        const destExists = fs.existsSync(destPath);
        if (!destExists || srcStat.mtimeMs > fs.statSync(destPath).mtimeMs) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  } catch {
    // Silently fail - worst case the function won't be found
  }
}
