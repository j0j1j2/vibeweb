import { describe, it, expect, vi } from "vitest";
import { RoomManager } from "../rooms.js";

describe("RoomManager", () => {
  it("adds and removes connections by tenant", () => {
    const manager = new RoomManager();
    const mockWs1 = { send: vi.fn(), readyState: 1 } as any;
    const mockWs2 = { send: vi.fn(), readyState: 1 } as any;
    manager.join("tenant-a", mockWs1);
    manager.join("tenant-a", mockWs2);
    expect(manager.getConnections("tenant-a")).toHaveLength(2);
    manager.leave("tenant-a", mockWs1);
    expect(manager.getConnections("tenant-a")).toHaveLength(1);
  });

  it("broadcasts only to the specified tenant", () => {
    const manager = new RoomManager();
    const wsA = { send: vi.fn(), readyState: 1 } as any;
    const wsB = { send: vi.fn(), readyState: 1 } as any;
    manager.join("tenant-a", wsA);
    manager.join("tenant-b", wsB);
    manager.broadcast("tenant-a", JSON.stringify({ type: "reload", path: "/index.html" }));
    expect(wsA.send).toHaveBeenCalledOnce();
    expect(wsB.send).not.toHaveBeenCalled();
  });

  it("skips closed connections during broadcast", () => {
    const manager = new RoomManager();
    const open = { send: vi.fn(), readyState: 1 } as any;
    const closed = { send: vi.fn(), readyState: 3 } as any;
    manager.join("tenant-a", open);
    manager.join("tenant-a", closed);
    manager.broadcast("tenant-a", "test");
    expect(open.send).toHaveBeenCalledOnce();
    expect(closed.send).not.toHaveBeenCalled();
  });
});
