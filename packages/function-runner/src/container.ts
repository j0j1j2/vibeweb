import Docker from "dockerode";
import { RUNNER_IMAGE, FUNCTION_TIMEOUT_MS, FUNCTION_MEMORY_LIMIT, FUNCTION_CPU_LIMIT } from "@vibeweb/shared";
import type { FunctionRequest, FunctionResponse } from "@vibeweb/shared";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export interface RunFunctionOpts {
  tenantId: string;
  functionPath: string;
  functionsDir: string;
  dbDir: string;
  request: FunctionRequest;
}

export async function runInContainer(opts: RunFunctionOpts): Promise<FunctionResponse> {
  const { tenantId, functionPath, functionsDir, dbDir, request } = opts;
  if (!/^[a-f0-9-]{36}$/.test(tenantId)) throw new Error("Invalid tenant ID");

  const volumeName = process.env.TENANT_VOLUME_NAME ?? "vibeweb_tenant-data";

  // Mount ONLY this tenant's subdirectories — not the entire volume
  // "preview/functions" for code (read-only), "db" for database (read-write)
  const container = await docker.createContainer({
    Image: RUNNER_IMAGE,
    Env: [
      `FUNCTION_PATH=${functionPath}`,
      `FUNCTIONS_DIR=/tenant/preview/functions`,
      `DB_DIR=/tenant/db`,
      `REQ_METHOD=${request.method}`,
      `REQ_PATH=${request.path}`,
      `REQ_QUERY=${JSON.stringify(request.query)}`,
      `REQ_HEADERS=${JSON.stringify(request.headers)}`,
      `REQ_BODY_B64=${Buffer.from(request.body || "").toString("base64")}`,
    ],
    HostConfig: {
      Mounts: [
        {
          Type: "volume" as const,
          Source: volumeName,
          Target: "/tenant/preview/functions",
          ReadOnly: true,
          VolumeOptions: { Subpath: `${tenantId}/preview/functions` } as any,
        },
        {
          Type: "volume" as const,
          Source: volumeName,
          Target: "/tenant/db",
          ReadOnly: false,
          VolumeOptions: { Subpath: `${tenantId}/db` } as any,
        },
      ],
      Memory: parseMemoryLimit(FUNCTION_MEMORY_LIMIT),
      NanoCpus: FUNCTION_CPU_LIMIT * 1e9,
      NetworkMode: "none",
      AutoRemove: false,
      ReadonlyRootfs: false,
      PidsLimit: 256,
    },
    Labels: {
      "vibeweb.tenant": tenantId,
      "vibeweb.role": "function-runner",
    },
  });

  await container.start();

  const result = await Promise.race([
    waitForContainer(container),
    timeout(FUNCTION_TIMEOUT_MS, container),
  ]);

  return result;
}

async function waitForContainer(container: Docker.Container): Promise<FunctionResponse> {
  try {
    await container.wait();
    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString("utf-8").trim();
    const lines = output.split("\n");
    const lastLine = lines[lines.length - 1];
    const jsonMatch = lastLine.match(/\{.*\}/);
    if (!jsonMatch) {
      return { status: 500, headers: {}, body: { error: "No response from function" } };
    }
    try {
      return JSON.parse(jsonMatch[0]) as FunctionResponse;
    } catch {
      return { status: 500, headers: {}, body: { error: "Invalid response from function" } };
    }
  } finally {
    try { await container.remove({ force: true }); } catch { }
  }
}

async function timeout(ms: number, container: Docker.Container): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(async () => {
      try { await container.kill(); } catch { }
      reject(new Error("Function execution timed out"));
    }, ms);
  });
}

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 128 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
  return num * (multipliers[unit] ?? 1);
}
