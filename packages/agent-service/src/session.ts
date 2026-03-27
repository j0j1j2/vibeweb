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
  startedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private tenantSessions = new Map<string, string>();

  constructor(private tenantsDir: string) {}

  async createSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId, sessionId, claudeMdContent, authToken } = opts;
    const existingSessionId = this.tenantSessions.get(tenantId);
    if (existingSessionId && this.sessions.has(existingSessionId)) {
      throw new Error(`Tenant ${tenantId} already has an active session`);
    }

    const previewDir = path.join(this.tenantsDir, tenantId, "preview");
    const dbDir = path.join(this.tenantsDir, tenantId, "db");

    const env = [
      `BRIDGE_PORT=${SESSION_BRIDGE_PORT}`,
      `WORKSPACE=/workspace`,
    ];
    if (authToken) {
      env.push(`ANTHROPIC_API_KEY=${authToken}`);
    }

    const container = await docker.createContainer({
      Image: SESSION_IMAGE,
      Env: env,
      ExposedPorts: { [`${SESSION_BRIDGE_PORT}/tcp`]: {} },
      HostConfig: {
        Binds: [
          `${previewDir}:/workspace:rw`,
          `${dbDir}:/data/db:rw`,
          `${path.join(this.tenantsDir, "..", "claude-auth")}:/root/.claude:ro`,
        ],
        PortBindings: { [`${SESSION_BRIDGE_PORT}/tcp`]: [{ HostPort: "0" }] },
        Memory: parseMemoryLimit(SESSION_MEMORY_LIMIT),
        NanoCpus: SESSION_CPU_LIMIT * 1e9,
      },
      Labels: {
        "vibeweb.role": "agent-session",
        "vibeweb.tenant": tenantId,
        "vibeweb.session": sessionId,
      },
    });

    await container.start();
    const info = await container.inspect();
    const portBindings = info.NetworkSettings.Ports[`${SESSION_BRIDGE_PORT}/tcp`];
    const bridgePort = parseInt(portBindings[0].HostPort, 10);

    const session: SessionInfo = { sessionId, tenantId, containerId: container.id, bridgePort, startedAt: new Date().toISOString() };
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
