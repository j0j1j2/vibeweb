import type { WebSocket } from "ws";

export class SessionProxy {
  public lastActivityAt: number;

  constructor(private sessionId: string, private userWs: WebSocket, private bridgeWs: WebSocket) {
    this.lastActivityAt = Date.now();
  }

  sendToBridge(msg: Record<string, unknown>): void {
    this.lastActivityAt = Date.now();
    if (this.bridgeWs.readyState === 1) this.bridgeWs.send(JSON.stringify(msg));
  }

  handleBridgeMessage(raw: string): void {
    this.lastActivityAt = Date.now();
    try {
      const { type, ...rest } = JSON.parse(raw);
      const enriched = type !== undefined
        ? { type, sessionId: this.sessionId, ...rest }
        : { sessionId: this.sessionId, ...rest };
      if (this.userWs.readyState === 1) this.userWs.send(JSON.stringify(enriched));
    } catch {
      if (this.userWs.readyState === 1) this.userWs.send(raw);
    }
  }

  sendToUser(msg: Record<string, unknown>): void {
    const enriched = { ...msg, sessionId: this.sessionId };
    if (this.userWs.readyState === 1) this.userWs.send(JSON.stringify(enriched));
  }

  close(): void {
    if (this.bridgeWs.readyState === 1) this.bridgeWs.close();
  }
}
