import Docker from "dockerode";
import { SESSION_IMAGE, SESSION_BRIDGE_PORT, SESSION_MEMORY_LIMIT, SESSION_CPU_LIMIT } from "@vibeweb/shared";
import path from "node:path";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export interface CreateSessionOpts {
  tenantId: string;
  sessionId: string;
  claudeMdContent: string;
  authToken: string | null;
}

export interface SessionInfo {
  sessionId: string;
  tenantId: string;
  containerId: string;
  bridgePort: number;
  bridgeHost: string;
  startedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private tenantSessions = new Map<string, string>();

  constructor(private tenantsDir: string) {}

  async createSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId, sessionId, claudeMdContent, authToken } = opts;
    if (!/^[a-f0-9-]{36}$/.test(tenantId)) {
      throw new Error("Invalid tenant ID");
    }
    // Clean up existing session for this tenant if any
    const existingSessionId = this.tenantSessions.get(tenantId);
    if (existingSessionId && this.sessions.has(existingSessionId)) {
      await this.destroySession(existingSessionId);
    }

    const env = [
      `BRIDGE_PORT=${SESSION_BRIDGE_PORT}`,
      `WORKSPACE=/workspace`,
    ];
    if (authToken) {
      if (authToken.startsWith("sk-ant-oat")) {
        env.push(`CLAUDE_CODE_OAUTH_TOKEN=${authToken}`);
      } else {
        env.push(`ANTHROPIC_API_KEY=${authToken}`);
      }
    }

    // Use Docker named volume — bind mounts from container paths don't work in DinD
    const volumeName = process.env.TENANT_VOLUME_NAME ?? "vibeweb_tenant-data";
    const networkName = process.env.DOCKER_NETWORK ?? "vibeweb_default";

    const container = await docker.createContainer({
      Image: SESSION_IMAGE,
      Env: [
        ...env,
        `WORKSPACE=/data/tenants/${tenantId}/preview`,
      ],
      ExposedPorts: { [`${SESSION_BRIDGE_PORT}/tcp`]: {} },
      HostConfig: {
        Mounts: [
          { Type: "volume" as const, Source: volumeName, Target: "/data/tenants", ReadOnly: false },
        ],
        Memory: parseMemoryLimit(SESSION_MEMORY_LIMIT),
        NanoCpus: SESSION_CPU_LIMIT * 1e9,
        NetworkMode: networkName,
      },
      // Root sets up dirs/perms, then drops to 'vibe' user for claude
      Cmd: ["sh", "-c", `
        mkdir -p /home/vibe/.claude /data/tenants/${tenantId}/claude-auth /data/tenants/${tenantId}/preview &&
        cp -a /data/tenants/${tenantId}/claude-auth/. /home/vibe/.claude/ 2>/dev/null;
        test -f /data/tenants/${tenantId}/claude-auth/.claude.json && cp /data/tenants/${tenantId}/claude-auth/.claude.json /home/vibe/.claude.json 2>/dev/null;
        chown -R vibe:vibe /home/vibe /data/tenants/${tenantId}/preview /data/tenants/${tenantId}/claude-auth 2>/dev/null;
        exec su vibe -c "HOME=/home/vibe WORKSPACE=/data/tenants/${tenantId}/preview BRIDGE_PORT=${SESSION_BRIDGE_PORT} NODE_PATH=/opt/libs/node_modules CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN:-} ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-} node /opt/bridge/bridge.js"
      `],
      Labels: {
        "vibeweb.role": "agent-session",
        "vibeweb.tenant": tenantId,
        "vibeweb.session": sessionId,
      },
    });

    await container.start();
    const info = await container.inspect();
    // Get container IP on the shared network
    const networks = info.NetworkSettings.Networks;
    const containerIp = networks[networkName]?.IPAddress ?? Object.values(networks)[0]?.IPAddress ?? "localhost";
    const bridgePort = SESSION_BRIDGE_PORT; // Use internal port, connect via container IP

    const session: SessionInfo = { sessionId, tenantId, containerId: container.id, bridgePort, startedAt: new Date().toISOString(), bridgeHost: containerIp };
    this.sessions.set(sessionId, session);
    this.tenantSessions.set(tenantId, sessionId);
    return session;
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      const container = docker.getContainer(session.containerId);
      await container.stop().catch(() => {});
      await container.remove().catch(() => {});
    } catch { }
    this.sessions.delete(sessionId);
    this.tenantSessions.delete(session.tenantId);
  }

  getSession(sessionId: string): SessionInfo | undefined { return this.sessions.get(sessionId); }
  getSessionByTenant(tenantId: string): SessionInfo | undefined {
    const sid = this.tenantSessions.get(tenantId);
    return sid ? this.sessions.get(sid) : undefined;
  }

  async cleanupOrphanContainers(): Promise<void> {
    const containers = await docker.listContainers({ filters: { label: ["vibeweb.role=agent-session"] } });
    for (const c of containers) {
      const container = docker.getContainer(c.Id);
      try { await container.stop(); await container.remove(); } catch { }
    }
    this.sessions.clear();
    this.tenantSessions.clear();
  }
}

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 512 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
  return num * (multipliers[unit] ?? 1);
}
