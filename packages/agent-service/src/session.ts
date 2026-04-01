import { SESSION_IMAGE, SESSION_BRIDGE_PORT, SESSION_MEMORY_LIMIT, SESSION_CPU_LIMIT, K8S_NAMESPACE, K8S_PVC_NAME } from "@vibeweb/shared";
import { getK8sApi, waitForPodRunning } from "./k8s.js";
import crypto from "node:crypto";

const GRACE_PERIOD_MS = 5 * 60 * 1000;
const SESSION_IMAGE_K8S = process.env.SESSION_IMAGE ?? SESSION_IMAGE;

export interface CreateSessionOpts {
  tenantId: string;
  sessionId: string;
  claudeMdContent: string;
  authToken: string | null;
}

export interface SessionInfo {
  sessionId: string;
  tenantId: string;
  podName: string;
  bridgePort: number;
  bridgeHost: string;
  startedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private tenantSessions = new Map<string, string>();
  private destroyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private tenantsDir: string) {}

  async getOrCreateSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId } = opts;
    const api = getK8sApi();
    const namespace = K8S_NAMESPACE;

    const existingSessionId = this.tenantSessions.get(tenantId);
    if (existingSessionId) {
      const existing = this.sessions.get(existingSessionId);
      if (existing) {
        this.cancelDestroyTimer(existingSessionId);
        try {
          const pod = await api.readNamespacedPodStatus({ name: existing.podName, namespace });
          if (pod?.status?.phase === "Running") {
            existing.sessionId = opts.sessionId;
            this.sessions.delete(existingSessionId);
            this.sessions.set(opts.sessionId, existing);
            this.tenantSessions.set(tenantId, opts.sessionId);
            return existing;
          }
        } catch { /* pod gone */ }
        this.sessions.delete(existingSessionId);
        this.tenantSessions.delete(tenantId);
      }
    }

    return this.createSession(opts);
  }

  private async createSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId, sessionId, authToken } = opts;
    if (!/^[a-f0-9-]{36}$/.test(tenantId)) throw new Error("Invalid tenant ID");

    const api = getK8sApi();
    const namespace = K8S_NAMESPACE;
    const podName = `session-${tenantId.slice(0, 8)}-${crypto.randomBytes(4).toString("hex")}`;

    const env: { name: string; value: string }[] = [
      { name: "BRIDGE_PORT", value: String(SESSION_BRIDGE_PORT) },
      { name: "WORKSPACE", value: "/tenant/preview" },
    ];
    if (authToken) {
      if (authToken.startsWith("sk-ant-oat")) {
        env.push({ name: "CLAUDE_CODE_OAUTH_TOKEN", value: authToken });
      } else {
        env.push({ name: "ANTHROPIC_API_KEY", value: authToken });
      }
    }

    const pod = {
      metadata: {
        name: podName,
        namespace,
        labels: {
          "vibeweb.role": "agent-session",
          "vibeweb.tenant": tenantId,
        },
      },
      spec: {
        restartPolicy: "Never" as const,
        automountServiceAccountToken: false,
        containers: [
          {
            name: "session",
            image: SESSION_IMAGE_K8S,
            imagePullPolicy: "Always",
            command: ["sh", "-c", [
              "mkdir -p /home/vibe/.claude /tenant/preview /tenant/db /data",
              "cp -a /tenant/claude-auth/. /home/vibe/.claude/ 2>/dev/null",
              "test -f /tenant/claude-auth/.claude.json && cp /tenant/claude-auth/.claude.json /home/vibe/.claude.json 2>/dev/null",
              "chown -R vibe:vibe /home/vibe /tenant/preview /tenant/db 2>/dev/null",
              "ln -sf /tenant/db /data/db",
              `exec su vibe -c "HOME=/home/vibe WORKSPACE=/tenant/preview BRIDGE_PORT=${SESSION_BRIDGE_PORT} CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN:-} ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-} node /opt/bridge/bridge.js"`,
            ].join(" && ")],
            ports: [{ containerPort: SESSION_BRIDGE_PORT }],
            env,
            volumeMounts: [
              { name: "tenant-data", mountPath: "/tenant/preview", subPath: `tenants/${tenantId}/preview` },
              { name: "tenant-data", mountPath: "/tenant/db", subPath: `tenants/${tenantId}/db` },
              { name: "tenant-data", mountPath: "/tenant/claude-auth", subPath: `tenants/${tenantId}/claude-auth`, readOnly: true },
            ],
            resources: {
              requests: {
                memory: "128Mi",
                cpu: "100m",
              },
            },
          },
        ],
        volumes: [
          { name: "tenant-data", persistentVolumeClaim: { claimName: K8S_PVC_NAME } },
        ],
      },
    };

    await api.createNamespacedPod({ namespace, body: pod });
    const podIp = await waitForPodRunning(api, namespace, podName, 60_000);

    const session: SessionInfo = {
      sessionId, tenantId, podName,
      bridgePort: SESSION_BRIDGE_PORT, bridgeHost: podIp,
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    this.tenantSessions.set(tenantId, sessionId);
    return session;
  }

  scheduleDestroy(sessionId: string): void {
    this.cancelDestroyTimer(sessionId);
    const timer = setTimeout(() => { this.destroySession(sessionId); }, GRACE_PERIOD_MS);
    this.destroyTimers.set(sessionId, timer);
  }

  private cancelDestroyTimer(sessionId: string): void {
    const timer = this.destroyTimers.get(sessionId);
    if (timer) { clearTimeout(timer); this.destroyTimers.delete(sessionId); }
  }

  async destroySession(sessionId: string): Promise<void> {
    this.cancelDestroyTimer(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try { await getK8sApi().deleteNamespacedPod({ name: session.podName, namespace: K8S_NAMESPACE }); } catch {}
    this.sessions.delete(sessionId);
    this.tenantSessions.delete(session.tenantId);
  }

  getSession(sessionId: string): SessionInfo | undefined { return this.sessions.get(sessionId); }
  getSessionByTenant(tenantId: string): SessionInfo | undefined {
    const sid = this.tenantSessions.get(tenantId);
    return sid ? this.sessions.get(sid) : undefined;
  }

  async cleanupOrphanPods(): Promise<void> {
    const api = getK8sApi();
    try {
      const podList = await api.listNamespacedPod({ namespace: K8S_NAMESPACE, labelSelector: "vibeweb.role=agent-session" });
      for (const pod of podList.items) {
        if (pod.metadata?.name) {
          try { await api.deleteNamespacedPod({ name: pod.metadata.name, namespace: K8S_NAMESPACE }); } catch {}
        }
      }
    } catch {}
    this.sessions.clear();
    this.tenantSessions.clear();
    this.destroyTimers.forEach(t => clearTimeout(t));
    this.destroyTimers.clear();
  }
}
