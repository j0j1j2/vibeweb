import { RUNNER_IMAGE, FUNCTION_TIMEOUT_MS, K8S_NAMESPACE, K8S_PVC_NAME } from "@vibeweb/shared";
import { getK8sApi, getK8sConfig } from "./k8s.js";
import type { FunctionRequest, FunctionResponse } from "@vibeweb/shared";
import * as k8s from "@kubernetes/client-node";
import { Writable } from "node:stream";
import crypto from "node:crypto";

const RUNNER_IMAGE_K8S = process.env.RUNNER_IMAGE ?? RUNNER_IMAGE;
const POOL_SIZE = 2;
const POOL_LABEL = "vibeweb.role=function-worker";

export interface RunFunctionOpts {
  tenantId: string;
  functionPath: string;
  functionsDir: string;
  dbDir: string;
  request: FunctionRequest;
}

/** Worker pool: pre-created Pods that accept exec requests */
class WorkerPool {
  private ready: string[] = []; // available pod names
  private busy = new Set<string>(); // in-use pod names
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      await this.cleanup();
      for (let i = 0; i < POOL_SIZE; i++) {
        const name = await this.createWorker();
        console.log(`Worker pool: created ${name}`);
      }
      console.log(`Worker pool: ${this.ready.length} workers ready`);
    } catch (err) {
      console.error(`Worker pool init failed: ${err instanceof Error ? err.message : err}`);
      this.initialized = false;
      throw err;
    }
  }

  private async createWorker(): Promise<string> {
    const api = getK8sApi();
    const namespace = K8S_NAMESPACE;
    const podName = `fn-worker-${crypto.randomBytes(4).toString("hex")}`;

    await api.createNamespacedPod({
      namespace,
      body: {
        metadata: {
          name: podName,
          namespace,
          labels: { "vibeweb.role": "function-worker" },
        },
        spec: {
          restartPolicy: "Never",
          automountServiceAccountToken: false,
          containers: [{
            name: "runner",
            image: RUNNER_IMAGE_K8S,
            imagePullPolicy: "Always",
            // Long-running: sleep forever, functions executed via exec
            command: ["sh", "-c", "while true; do sleep 3600; done"],
            volumeMounts: [
              { name: "tenant-data", mountPath: "/data" },
            ],
            resources: {
              requests: { memory: "64Mi", cpu: "100m" },
            },
          }],
          volumes: [
            { name: "tenant-data", persistentVolumeClaim: { claimName: K8S_PVC_NAME } },
          ],
        },
      },
    });

    // Wait for Running
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const pod = await api.readNamespacedPodStatus({ name: podName, namespace });
      if (pod?.status?.phase === "Running") break;
      if (pod?.status?.phase === "Failed") throw new Error("Worker pod failed");
      await new Promise(r => setTimeout(r, 200));
    }

    this.ready.push(podName);
    return podName;
  }

  async acquire(): Promise<string> {
    await this.init();
    // Try to get a ready worker
    let podName = this.ready.shift();
    if (!podName) {
      // All busy — create a temporary extra worker
      podName = await this.createWorker();
      this.ready.shift(); // remove from ready since we'll use it now
    }
    this.busy.add(podName);
    return podName;
  }

  release(podName: string): void {
    this.busy.delete(podName);
    this.ready.push(podName);
  }

  private async cleanup(): Promise<void> {
    const api = getK8sApi();
    try {
      const list = await api.listNamespacedPod({ namespace: K8S_NAMESPACE, labelSelector: POOL_LABEL });
      for (const pod of list.items) {
        if (pod.metadata?.name) {
          try { await api.deleteNamespacedPod({ name: pod.metadata.name, namespace: K8S_NAMESPACE }); } catch {}
        }
      }
    } catch {}
    this.ready = [];
    this.busy.clear();
  }
}

const pool = new WorkerPool();

export async function runInContainer(opts: RunFunctionOpts): Promise<FunctionResponse> {
  const { tenantId, functionPath, request } = opts;
  if (!/^[a-f0-9-]{36}$/.test(tenantId)) throw new Error("Invalid tenant ID");

  const podName = await pool.acquire();

  try {
    // Base64-encode JSON values to avoid shell quoting issues
    const queryB64 = Buffer.from(JSON.stringify(request.query)).toString("base64");
    const headersB64 = Buffer.from(JSON.stringify(request.headers)).toString("base64");
    const bodyB64 = Buffer.from(request.body || "").toString("base64");

    const cmd = [
      `export FUNCTION_PATH="${functionPath}"`,
      `export FUNCTIONS_DIR="/data/tenants/${tenantId}/preview/functions"`,
      `export DB_DIR="/data/tenants/${tenantId}/db"`,
      `export REQ_METHOD="${request.method}"`,
      `export REQ_PATH="${request.path.replace(/"/g, '\\"')}"`,
      `export REQ_QUERY="$(echo ${queryB64} | base64 -d)"`,
      `export REQ_HEADERS="$(echo ${headersB64} | base64 -d)"`,
      `export REQ_BODY_B64="${bodyB64}"`,
      `rm -f /data/db`,
      `ln -sf /data/tenants/${tenantId}/db /data/db`,
      `node /usr/local/bin/entrypoint.js`,
    ].join("; ");

    const kc = getK8sConfig();
    const exec = new k8s.Exec(kc);

    const output = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Function execution timed out")), FUNCTION_TIMEOUT_MS);
      let stdoutBuf = "";

      const stdoutStream = new Writable({
        write(chunk, _enc, cb) { stdoutBuf += chunk.toString(); cb(); },
      });
      const stderrStream = new Writable({
        write(_chunk, _enc, cb) { cb(); },
      });

      exec.exec(
        K8S_NAMESPACE, podName, "runner",
        ["sh", "-c", cmd],
        stdoutStream,
        stderrStream,
        null,
        false,
        (status) => {
          clearTimeout(timeout);
          console.log(`Exec status callback, stdout length: ${stdoutBuf.length}, status: ${JSON.stringify(status)}`);
          setTimeout(() => resolve(stdoutBuf), 200);
        },
      ).then((ws) => {
        // Also resolve on WebSocket close if status callback doesn't fire
        ws.on("close", () => {
          clearTimeout(timeout);
          setTimeout(() => resolve(stdoutBuf), 100);
        });
      }).catch(reject);
    });

    const lines = output.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    const jsonMatch = lastLine?.match(/\{.*\}/);

    if (!jsonMatch) {
      return { status: 500, headers: {}, body: { error: "No response from function" } };
    }
    try {
      return JSON.parse(jsonMatch[0]) as FunctionResponse;
    } catch {
      return { status: 500, headers: {}, body: { error: "Invalid response from function" } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack = err instanceof Error ? err.stack : "";
    console.error(`Function exec error: ${message}\n${stack}`);
    if (message.includes("timed out")) {
      return { status: 504, headers: {}, body: { error: "Function execution timed out" } };
    }
    return { status: 500, headers: {}, body: { error: message } };
  } finally {
    pool.release(podName);
  }
}
