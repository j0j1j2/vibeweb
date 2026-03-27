import type { WebSocket } from "ws";

export class RoomManager {
  private rooms = new Map<string, Set<WebSocket>>();

  join(tenantId: string, ws: WebSocket): void {
    if (!this.rooms.has(tenantId)) this.rooms.set(tenantId, new Set());
    this.rooms.get(tenantId)!.add(ws);
  }

  leave(tenantId: string, ws: WebSocket): void {
    const room = this.rooms.get(tenantId);
    if (room) { room.delete(ws); if (room.size === 0) this.rooms.delete(tenantId); }
  }

  getConnections(tenantId: string): WebSocket[] {
    return Array.from(this.rooms.get(tenantId) ?? []);
  }

  broadcast(tenantId: string, message: string): void {
    const room = this.rooms.get(tenantId);
    if (!room) return;
    for (const ws of room) { if (ws.readyState === 1) ws.send(message); }
  }
}
