import Docker from "dockerode";
import { SESSION_IMAGE, SESSION_BRIDGE_PORT, SESSION_MEMORY_LIMIT, SESSION_CPU_LIMIT } from "@vibeweb/shared";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes before destroying idle container

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
  private tenantSessions = new Map<string, string>(); // tenantId → sessionId
  private destroyTimers = new Map<string, ReturnType<typeof setTimeout>>(); // sessionId → timer

  constructor(private tenantsDir: string) {}

  /** Get existing live session for tenant, or create a new one */
  async getOrCreateSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId } = opts;

    // Check for existing session
    const existingSessionId = this.tenantSessions.get(tenantId);
    if (existingSessionId) {
      const existing = this.sessions.get(existingSessionId);
      if (existing) {
        // Cancel pending destroy timer
        this.cancelDestroyTimer(existingSessionId);
        // Verify container is still running
        try {
          const container = docker.getContainer(existing.containerId);
          const info = await container.inspect();
          if (info.State.Running) {
            // Reuse existing container — update sessionId for new proxy
            existing.sessionId = opts.sessionId;
            this.sessions.delete(existingSessionId);
            this.sessions.set(opts.sessionId, existing);
            this.tenantSessions.set(tenantId, opts.sessionId);
            return existing;
          }
        } catch { /* container gone, create new */ }
        // Clean up stale entry
        this.sessions.delete(existingSessionId);
        this.tenantSessions.delete(tenantId);
      }
    }

    return this.createSession(opts);
  }

  private async createSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId, sessionId, claudeMdContent, authToken } = opts;
    if (!/^[a-f0-9-]{36}$/.test(tenantId)) {
      throw new Error("Invalid tenant ID");
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

    const volumeName = process.env.TENANT_VOLUME_NAME ?? "vibeweb_tenant-data";
    const networkName = process.env.DOCKER_NETWORK ?? "vibeweb_default";

    const container = await docker.createContainer({
      Image: SESSION_IMAGE,
      Env: [
        ...env,
        `WORKSPACE=/tenant/preview`,
      ],
      ExposedPorts: { [`${SESSION_BRIDGE_PORT}/tcp`]: {} },
      HostConfig: {
        Mounts: [
          {
            Type: "volume" as const,
            Source: volumeName,
            Target: "/tenant/preview",
            ReadOnly: false,
            VolumeOptions: { Subpath: `${tenantId}/preview` } as any,
          },
          {
            Type: "volume" as const,
            Source: volumeName,
            Target: "/tenant/db",
            ReadOnly: false,
            VolumeOptions: { Subpath: `${tenantId}/db` } as any,
          },
          {
            Type: "volume" as const,
            Source: volumeName,
            Target: "/tenant/claude-auth",
            ReadOnly: true,
            VolumeOptions: { Subpath: `${tenantId}/claude-auth` } as any,
          },
          {
            Type: "volume" as const,
            Source: volumeName,
            Target: "/tenant/claude-sessions",
            ReadOnly: false,
            VolumeOptions: { Subpath: `${tenantId}/claude-sessions` } as any,
          },
        ],
        Memory: parseMemoryLimit(SESSION_MEMORY_LIMIT),
        NanoCpus: SESSION_CPU_LIMIT * 1e9,
        NetworkMode: networkName,
        PidsLimit: 512,
      },
      Cmd: ["sh", "-c", `
        mkdir -p /home/vibe/.claude /tenant/preview /tenant/db /tenant/claude-sessions /data &&
        cp -a /tenant/claude-auth/. /home/vibe/.claude/ 2>/dev/null;
        test -f /tenant/claude-auth/.claude.json && cp /tenant/claude-auth/.claude.json /home/vibe/.claude.json 2>/dev/null;
        rm -rf /home/vibe/.claude/sessions;
        ln -sf /tenant/claude-sessions /home/vibe/.claude/sessions;
        chown -R vibe:vibe /home/vibe /tenant/preview /tenant/db /tenant/claude-sessions 2>/dev/null;
        ln -sf /tenant/db /data/db;
        exec su vibe -c "HOME=/home/vibe WORKSPACE=/tenant/preview BRIDGE_PORT=${SESSION_BRIDGE_PORT} NODE_PATH=/opt/libs/node_modules CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN:-} ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-} node /opt/bridge/bridge.js"
      `],
      Labels: {
        "vibeweb.role": "agent-session",
        "vibeweb.tenant": tenantId,
        "vibeweb.session": sessionId,
      },
    });

    await container.start();
    const info = await container.inspect();
    const networks = info.NetworkSettings.Networks;
    const containerIp = networks[networkName]?.IPAddress ?? Object.values(networks)[0]?.IPAddress ?? "localhost";

    const session: SessionInfo = { sessionId, tenantId, containerId: container.id, bridgePort: SESSION_BRIDGE_PORT, startedAt: new Date().toISOString(), bridgeHost: containerIp };
    this.sessions.set(sessionId, session);
    this.tenantSessions.set(tenantId, sessionId);
    return session;
  }

  /** Schedule container destruction after grace period */
  scheduleDestroy(sessionId: string): void {
    this.cancelDestroyTimer(sessionId);
    const timer = setTimeout(() => {
      this.destroySession(sessionId);
    }, GRACE_PERIOD_MS);
    this.destroyTimers.set(sessionId, timer);
  }

  /** Cancel a pending destroy */
  private cancelDestroyTimer(sessionId: string): void {
    const timer = this.destroyTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.destroyTimers.delete(sessionId);
    }
  }

  async destroySession(sessionId: string): Promise<void> {
    this.cancelDestroyTimer(sessionId);
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
    this.destroyTimers.forEach(t => clearTimeout(t));
    this.destroyTimers.clear();
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
