import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@kubernetes/client-node", () => ({ KubeConfig: vi.fn() }));
vi.mock("@vibeweb/shared", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getK8sApi: vi.fn().mockReturnValue({
      createNamespacedPod: vi.fn().mockResolvedValue({}),
      readNamespacedPodStatus: vi.fn().mockResolvedValue({ status: { phase: "Running", podIP: "10.42.0.5" } }),
      deleteNamespacedPod: vi.fn().mockResolvedValue({}),
      listNamespacedPod: vi.fn().mockResolvedValue({ items: [] }),
    }),
    waitForPodRunning: vi.fn().mockResolvedValue("10.42.0.5"),
  };
});

import { SessionManager } from "../session.js";

describe("SessionManager", () => {
  let manager: SessionManager;
  beforeEach(() => { manager = new SessionManager("/data/tenants"); });

  it("creates a session pod", async () => {
    const session = await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-123", claudeMdContent: "# Test", authToken: "test-token" });
    expect(session.podName).toMatch(/^session-aaaaaaaa-/);
    expect(session.bridgeHost).toBe("10.42.0.5");
  });

  it("reuses existing pod for same tenant", async () => {
    const s1 = await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-1", claudeMdContent: "# Test", authToken: "token" });
    const s2 = await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-2", claudeMdContent: "# Test", authToken: "token" });
    expect(s2.podName).toBe(s1.podName);
  });

  it("destroys a session pod", async () => {
    await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-1", claudeMdContent: "# Test", authToken: "token" });
    await manager.destroySession("session-1");
    expect(manager.getSession("session-1")).toBeUndefined();
  });
});
