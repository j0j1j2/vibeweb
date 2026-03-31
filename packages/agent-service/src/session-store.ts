import fs from "node:fs";
import path from "node:path";

export interface SessionMeta {
  conversationId: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
}

export class SessionStore {
  constructor(private tenantsDir: string) {}

  private sessionsDir(tenantId: string): string {
    return path.join(this.tenantsDir, tenantId, "sessions");
  }

  private activePath(tenantId: string): string {
    return path.join(this.sessionsDir(tenantId), "active.json");
  }

  private sessionPath(tenantId: string, conversationId: string): string {
    return path.join(this.sessionsDir(tenantId), `${conversationId}.json`);
  }

  getActiveConversationId(tenantId: string): string | null {
    try {
      const data = JSON.parse(fs.readFileSync(this.activePath(tenantId), "utf-8"));
      return data.conversationId ?? null;
    } catch { return null; }
  }

  setActiveConversationId(tenantId: string, conversationId: string | null): void {
    const dir = this.sessionsDir(tenantId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.activePath(tenantId), JSON.stringify({ conversationId }));
  }

  saveSession(tenantId: string, meta: SessionMeta): void {
    const dir = this.sessionsDir(tenantId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.sessionPath(tenantId, meta.conversationId), JSON.stringify(meta, null, 2));
    this.setActiveConversationId(tenantId, meta.conversationId);
  }

  updateLastActivity(tenantId: string, conversationId: string): void {
    const filePath = this.sessionPath(tenantId, conversationId);
    try {
      const meta: SessionMeta = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      meta.lastActivityAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
    } catch { /* file may not exist yet */ }
  }

  listSessions(tenantId: string): SessionMeta[] {
    const dir = this.sessionsDir(tenantId);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json") && f !== "active.json");
    const sessions: SessionMeta[] = [];
    for (const file of files) {
      try {
        sessions.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")));
      } catch { /* skip corrupted */ }
    }
    sessions.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    return sessions.slice(0, 50);
  }

  deleteSession(tenantId: string, conversationId: string): void {
    const filePath = this.sessionPath(tenantId, conversationId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (this.getActiveConversationId(tenantId) === conversationId) {
      this.setActiveConversationId(tenantId, null);
    }
  }

  getSession(tenantId: string, conversationId: string): SessionMeta | null {
    try {
      return JSON.parse(fs.readFileSync(this.sessionPath(tenantId, conversationId), "utf-8"));
    } catch { return null; }
  }
}
