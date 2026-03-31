import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../session.js";

vi.mock("dockerode", () => {
  const mockContainer = {
    id: "container-123",
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      State: { Running: true },
      NetworkSettings: { Networks: { vibeweb_default: { IPAddress: "172.18.0.5" } } },
    }),
  };
  return {
    default: vi.fn().mockImplementation(() => ({
      createContainer: vi.fn().mockResolvedValue(mockContainer),
      listContainers: vi.fn().mockResolvedValue([]),
      getContainer: vi.fn().mockReturnValue(mockContainer),
    })),
  };
});

describe("SessionManager", () => {
  let manager: SessionManager;
  beforeEach(() => { manager = new SessionManager("/data/tenants"); });

  it("creates a session with correct container config", async () => {
    const session = await manager.getOrCreateSession({ tenantId: "tenant-abc", sessionId: "session-123", claudeMdContent: "# Test", authToken: "test-token" });
    expect(session.containerId).toBe("container-123");
    expect(session.bridgePort).toBeDefined();
  });

  it("reuses existing container for same tenant", async () => {
    const s1 = await manager.getOrCreateSession({ tenantId: "tenant-abc", sessionId: "session-1", claudeMdContent: "# Test", authToken: "token" });
    const s2 = await manager.getOrCreateSession({ tenantId: "tenant-abc", sessionId: "session-2", claudeMdContent: "# Test", authToken: "token" });
    expect(s2.containerId).toBe(s1.containerId);
    expect(s2.sessionId).toBe("session-2");
  });

  it("destroys a session and removes container", async () => {
    await manager.getOrCreateSession({ tenantId: "tenant-abc", sessionId: "session-1", claudeMdContent: "# Test", authToken: "token" });
    await manager.destroySession("session-1");
    expect(manager.getSession("session-1")).toBeUndefined();
  });
});
