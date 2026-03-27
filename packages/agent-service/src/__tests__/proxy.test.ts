import { describe, it, expect, vi } from "vitest";
import { SessionProxy } from "../proxy.js";

describe("SessionProxy", () => {
  it("forwards user messages to bridge", () => {
    const userWs = { send: vi.fn(), readyState: 1 } as any;
    const bridgeWs = { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn() } as any;
    const proxy = new SessionProxy("session-1", userWs, bridgeWs);
    proxy.sendToBridge({ type: "message", content: "hello" });
    expect(bridgeWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "message", content: "hello" }));
  });

  it("forwards bridge messages to user with sessionId", () => {
    const userWs = { send: vi.fn(), readyState: 1 } as any;
    const bridgeWs = { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn() } as any;
    const proxy = new SessionProxy("session-1", userWs, bridgeWs);
    proxy.handleBridgeMessage(JSON.stringify({ type: "stream", data: { text: "hi" } }));
    expect(userWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "stream", sessionId: "session-1", data: { text: "hi" } }));
  });

  it("tracks last activity time", () => {
    const userWs = { send: vi.fn(), readyState: 1 } as any;
    const bridgeWs = { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn() } as any;
    const proxy = new SessionProxy("session-1", userWs, bridgeWs);
    const before = proxy.lastActivityAt;
    proxy.sendToBridge({ type: "message", content: "test" });
    expect(proxy.lastActivityAt).toBeGreaterThanOrEqual(before);
  });
});
