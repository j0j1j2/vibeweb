import chokidar from "chokidar";
import path from "node:path";
import type { RoomManager } from "./rooms.js";

export class TenantWatcher {
  private watchers = new Map<string, chokidar.FSWatcher>();

  constructor(private tenantsDir: string, private rooms: RoomManager) {}

  watch(tenantId: string): void {
    if (this.watchers.has(tenantId)) return;
    const previewDir = path.join(this.tenantsDir, tenantId, "preview");
    const watcher = chokidar.watch(previewDir, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200 } });
    watcher.on("all", (event, filePath) => {
      const relative = path.relative(previewDir, filePath);
      const ext = path.extname(filePath);
      this.rooms.broadcast(tenantId, JSON.stringify({ type: ext === ".css" ? "css-update" : "reload", path: relative, event }));
    });
    this.watchers.set(tenantId, watcher);
  }

  unwatch(tenantId: string): void {
    const watcher = this.watchers.get(tenantId);
    if (watcher) { watcher.close(); this.watchers.delete(tenantId); }
  }

  unwatchAll(): void { for (const [id] of this.watchers) this.unwatch(id); }
}
