# Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Claude chat sessions per tenant so conversations can be resumed across reconnections, with a session list/switch/delete UI in the chat panel header.

**Architecture:** Bridge receives a `conversationId` via an `init` message at connection time and uses `--resume` from the first prompt. Agent-service persists session metadata (conversationId, title, timestamps) as JSON files in `/data/tenants/{id}/sessions/`. The ChatPanel header gets a dropdown for session switching.

**Tech Stack:** Node.js fs (JSON files), WebSocket protocol extension, React dropdown UI, i18next

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `session-image/bridge.js` | Handle `init` message with conversationId |
| Create | `packages/agent-service/src/session-store.ts` | Read/write session metadata to disk |
| Modify | `packages/agent-service/src/index.ts` | Add session HTTP endpoints, pass conversationId on start, capture session_id from stream |
| Modify | `packages/agent-service/src/proxy.ts` | Capture session_id from bridge stream, notify callback |
| Modify | `packages/console/src/api.ts` | Add session API client functions |
| Modify | `packages/console/src/components/ChatLayout.tsx` | Track conversationId, support session switching |
| Modify | `packages/console/src/components/ChatPanel.tsx` | Add session dropdown header |
| Modify | `packages/console/src/i18n/ko.json` | Korean session strings |
| Modify | `packages/console/src/i18n/en.json` | English session strings |

---

### Task 1: Bridge init message support

**Files:**
- Modify: `session-image/bridge.js`

- [ ] **Step 1: Add init message handling in bridge.js**

In `session-image/bridge.js`, modify the `wss.on("connection")` handler to accept an `init` message that sets `conversationId` before any `message` is processed:

Replace lines 15-33:

```js
wss.on("connection", (socket) => {
  console.log("Agent Service connected");
  ws = socket;

  socket.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "init") {
      if (msg.conversationId) {
        conversationId = msg.conversationId;
        console.log(`Resuming conversation: ${conversationId}`);
      }
    } else if (msg.type === "message") {
      runClaude(msg.content);
    } else if (msg.type === "session.end") {
      cleanup();
      socket.close();
    }
  });

  socket.on("close", () => {
    console.log("Agent Service disconnected");
    cleanup();
  });
});
```

- [ ] **Step 2: Rebuild bridge image**

```bash
docker build -t vibeweb-session:latest /Users/cloudchamb3r/projects/vibeweb/session-image/
```

- [ ] **Step 3: Commit**

```bash
git add session-image/bridge.js
git commit -m "feat: bridge accepts init message with conversationId for resume"
```

---

### Task 2: Session store module

**Files:**
- Create: `packages/agent-service/src/session-store.ts`

- [ ] **Step 1: Create session-store.ts**

```typescript
// packages/agent-service/src/session-store.ts
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
    // If deleted session was active, clear active pointer
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
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/agent-service/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/agent-service/src/session-store.ts
git commit -m "feat: add SessionStore for persisting session metadata to disk"
```

---

### Task 3: Agent-service session endpoints and stream capture

**Files:**
- Modify: `packages/agent-service/src/index.ts`
- Modify: `packages/agent-service/src/proxy.ts`

- [ ] **Step 1: Add onSessionId callback to SessionProxy**

In `packages/agent-service/src/proxy.ts`, add a callback for session_id capture. Replace the entire file:

```typescript
import type { WebSocket } from "ws";

const PING_INTERVAL_MS = 25_000;

export class SessionProxy {
  public lastActivityAt: number;
  public onSessionId: ((id: string) => void) | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private sessionId: string, private userWs: WebSocket, private bridgeWs: WebSocket) {
    this.lastActivityAt = Date.now();
    this.startPing();
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.userWs.readyState === 1) this.userWs.ping();
      if (this.bridgeWs.readyState === 1) this.bridgeWs.ping();
    }, PING_INTERVAL_MS);
  }

  sendToBridge(msg: Record<string, unknown>): void {
    this.lastActivityAt = Date.now();
    if (this.bridgeWs.readyState === 1) this.bridgeWs.send(JSON.stringify(msg));
  }

  handleBridgeMessage(raw: string): void {
    this.lastActivityAt = Date.now();
    try {
      const { type, ...rest } = JSON.parse(raw);
      // Capture session_id from stream data
      if (type === "stream" && rest.data?.session_id && this.onSessionId) {
        this.onSessionId(rest.data.session_id);
      }
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
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.bridgeWs.readyState === 1) this.bridgeWs.close();
  }
}
```

- [ ] **Step 2: Add session HTTP endpoints and integrate SessionStore in index.ts**

In `packages/agent-service/src/index.ts`:

Add import after existing imports (after line 12):
```typescript
import { SessionStore } from "./session-store.js";
```

Add after `const sessionManager = new SessionManager(tenantsDir);` (line 25):
```typescript
const sessionStore = new SessionStore(tenantsDir);
```

Add session HTTP endpoints before the `start` function (before line 276). Place them after the DELETE `/auth/claude/:tenantId` endpoint (after line 262):

```typescript
// --- Session management endpoints ---

app.get<{ Params: { tenantId: string } }>("/sessions/:tenantId", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const sessions = sessionStore.listSessions(tenantId);
  const activeConversationId = sessionStore.getActiveConversationId(tenantId);
  return { sessions, activeConversationId };
});

app.post<{ Params: { tenantId: string }; Body: { conversationId: string } }>("/sessions/:tenantId/switch", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const { conversationId } = req.body;
  if (!conversationId) return reply.status(400).send({ error: "conversationId required" });
  const session = sessionStore.getSession(tenantId, conversationId);
  if (!session) return reply.status(404).send({ error: "Session not found" });
  sessionStore.setActiveConversationId(tenantId, conversationId);
  return { ok: true };
});

app.post<{ Params: { tenantId: string } }>("/sessions/:tenantId/new", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  sessionStore.setActiveConversationId(tenantId, null);
  return { ok: true };
});

app.delete<{ Params: { tenantId: string; conversationId: string } }>("/sessions/:tenantId/:conversationId", async (req, reply) => {
  const { tenantId, conversationId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  sessionStore.deleteSession(tenantId, conversationId);
  return { ok: true };
});
```

- [ ] **Step 3: Modify handleSessionStart to pass conversationId to bridge**

In the `handleSessionStart` function, after the bridge WebSocket connects and before creating the proxy, send the `init` message. Replace the section from `const bridgeWs = await connectWithRetry(...)` through `proxies.set(sessionId, proxy)`:

```typescript
  const bridgeWs = await connectWithRetry(bridgeUrl, 10, 500);

  // Send init with active conversationId for resume
  const activeConvId = sessionStore.getActiveConversationId(tenantId);
  bridgeWs.send(JSON.stringify({ type: "init", conversationId: activeConvId }));

  // Track the first user message for session title
  let firstUserMessage: string | null = null;
  let capturedConvId: string | null = activeConvId;

  const proxy = new SessionProxy(sessionId, userWs, bridgeWs);

  proxy.onSessionId = (convId: string) => {
    if (capturedConvId === convId) return; // already saved
    capturedConvId = convId;
    const title = firstUserMessage?.slice(0, 50) || "New conversation";
    const now = new Date().toISOString();
    if (!sessionStore.getSession(tenantId, convId)) {
      sessionStore.saveSession(tenantId, { conversationId: convId, title, createdAt: now, lastActivityAt: now });
    } else {
      sessionStore.updateLastActivity(tenantId, convId);
    }
  };

  bridgeWs.on("message", (data: Buffer) => {
    proxy.handleBridgeMessage(data.toString());
  });

  bridgeWs.on("close", () => {
    app.log.info(`Bridge WebSocket closed for session ${sessionId}`);
    proxy.sendToUser({ type: "session.closed", reason: "bridge_disconnected" });
    proxy.close();
    proxies.delete(sessionId);
    sessionManager.destroySession(sessionId);
  });

  proxies.set(sessionId, proxy);
```

- [ ] **Step 4: Capture first user message for title**

In the `handleUserMessage` function, add first-message tracking. Replace the function:

```typescript
function handleUserMessage(sessionId: string, msg: WsMessage): void {
  const proxy = proxies.get(sessionId);
  if (!proxy) { app.log.warn(`No proxy for session ${sessionId}`); return; }
  // Store first user message as session title source
  if (!(proxy as any)._firstMsgCaptured) {
    (proxy as any)._firstUserMessage = msg.content;
    (proxy as any)._firstMsgCaptured = true;
  }
  app.log.info(`Forwarding message to bridge for session ${sessionId}: ${(msg.content ?? "").substring(0, 50)}`);
  proxy.sendToBridge({ type: "message", content: msg.content });
}
```

And update the `handleSessionStart` function's `proxy.onSessionId` callback to read from proxy:

Replace the `firstUserMessage` tracking line inside `proxy.onSessionId`:

```typescript
  proxy.onSessionId = (convId: string) => {
    if (capturedConvId === convId) return;
    capturedConvId = convId;
    const title = ((proxy as any)._firstUserMessage as string)?.slice(0, 50) || "New conversation";
    const now = new Date().toISOString();
    if (!sessionStore.getSession(tenantId, convId)) {
      sessionStore.saveSession(tenantId, { conversationId: convId, title, createdAt: now, lastActivityAt: now });
    } else {
      sessionStore.updateLastActivity(tenantId, convId);
    }
  };
```

Remove the `let firstUserMessage` variable since we use `proxy._firstUserMessage` instead.

- [ ] **Step 5: Send conversationId in session.ready**

In `handleSessionStart`, update the session.ready message to include the active conversationId:

Replace:
```typescript
  userWs.send(JSON.stringify({ type: "session.ready", sessionId }));
```

With:
```typescript
  userWs.send(JSON.stringify({ type: "session.ready", sessionId, conversationId: activeConvId }));
```

- [ ] **Step 6: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/agent-service/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/agent-service/src/index.ts packages/agent-service/src/proxy.ts
git commit -m "feat: session endpoints, stream session_id capture, resume on connect"
```

---

### Task 4: Console API client and i18n

**Files:**
- Modify: `packages/console/src/api.ts`
- Modify: `packages/console/src/i18n/ko.json`
- Modify: `packages/console/src/i18n/en.json`

- [ ] **Step 1: Add session API functions to api.ts**

Append to `packages/console/src/api.ts`:

```typescript
export async function getSessions(tenantId: string) {
  const res = await fetch(`/agent-api/sessions/${tenantId}`);
  return res.json();
}
export async function switchSession(tenantId: string, conversationId: string) {
  const res = await fetch(`/agent-api/sessions/${tenantId}/switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }) });
  return res.json();
}
export async function newSession(tenantId: string) {
  const res = await fetch(`/agent-api/sessions/${tenantId}/new`, { method: "POST" });
  return res.json();
}
export async function deleteSession(tenantId: string, conversationId: string) {
  const res = await fetch(`/agent-api/sessions/${tenantId}/${conversationId}`, { method: "DELETE" });
  return res.json();
}
```

- [ ] **Step 2: Add i18n strings**

In `packages/console/src/i18n/ko.json`, inside the `"chat"` section, add after `"collapseChat"`:

```json
"newConversation": "새 대화",
"sessions": "대화 목록",
"deleteSession": "대화 삭제",
"deleteSessionConfirm": "이 대화를 삭제하시겠습니까?",
"noSessions": "대화 기록이 없습니다",
```

In `packages/console/src/i18n/en.json`, inside the `"chat"` section, add after `"collapseChat"`:

```json
"newConversation": "New Chat",
"sessions": "Conversations",
"deleteSession": "Delete conversation",
"deleteSessionConfirm": "Delete this conversation?",
"noSessions": "No conversations yet",
```

- [ ] **Step 3: Commit**

```bash
git add packages/console/src/api.ts packages/console/src/i18n/ko.json packages/console/src/i18n/en.json
git commit -m "feat: add session API client functions and i18n strings"
```

---

### Task 5: ChatLayout session state management

**Files:**
- Modify: `packages/console/src/components/ChatLayout.tsx`

- [ ] **Step 1: Add session switching support to ChatLayout**

In `packages/console/src/components/ChatLayout.tsx`:

Update imports (line 1):
```typescript
import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ChatPanel } from "@/components/ChatPanel";
import { getTenant, getSessions, switchSession, newSession, deleteSession } from "@/api";
import { MessageSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
```

Update ChatContextValue interface to include session info:
```typescript
interface ChatContextValue {
  subdomain: string;
  connected: boolean;
  sendMessage: (content: string) => void;
  tenantId: string | undefined;
  sessionTitle: string;
  activeConversationId: string | null;
  onSwitchSession: (conversationId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextValue>({
  subdomain: "", connected: false, sendMessage: () => {},
  tenantId: undefined, sessionTitle: "", activeConversationId: null,
  onSwitchSession: () => {}, onNewSession: () => {}, onDeleteSession: () => {},
});
```

Inside the `ChatLayout` component, add session state after existing state declarations (after `const [reconnectCount, setReconnectCount] = useState(0);`):

```typescript
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
```

In the WebSocket `onmessage` handler, capture `conversationId` from `session.ready`:

Replace:
```typescript
      if (msg.type === "session.ready") { setSessionId(msg.sessionId); setConnected(true); reconnectRef.current = 0; }
```

With:
```typescript
      if (msg.type === "session.ready") {
        setSessionId(msg.sessionId);
        setConnected(true);
        reconnectRef.current = 0;
        if (msg.conversationId) setActiveConversationId(msg.conversationId);
      }
```

Track first user message for title. In `handleSend`:

Replace:
```typescript
  const handleSend = useCallback((content: string) => {
    if (!wsRef.current || !sessionId) return;
    setMessages((prev) => [...prev, { role: "user", content, toolUse: [], done: true }]);
    setStatus(t("chat.status.thinking"));
    setLoading(true);
    wsRef.current.send(JSON.stringify({ type: "message", sessionId, content }));
  }, [sessionId]);
```

With:
```typescript
  const handleSend = useCallback((content: string) => {
    if (!wsRef.current || !sessionId) return;
    setMessages((prev) => {
      // Set title from first user message
      if (prev.filter(m => m.role === "user").length === 0) {
        setSessionTitle(content.slice(0, 50));
      }
      return [...prev, { role: "user", content, toolUse: [], done: true }];
    });
    setStatus(t("chat.status.thinking"));
    setLoading(true);
    wsRef.current.send(JSON.stringify({ type: "message", sessionId, content }));
  }, [sessionId]);
```

Add session management handlers after `handleSend`:

```typescript
  const handleSwitchSession = useCallback(async (conversationId: string) => {
    if (!tenantId) return;
    await switchSession(tenantId, conversationId);
    setMessages([]);
    setSessionTitle("");
    setActiveConversationId(conversationId);
    // Reconnect WebSocket to start with new active session
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "session.end", sessionId }));
      }
      wsRef.current.close();
    }
    setReconnectCount(c => c + 1);
  }, [tenantId, sessionId]);

  const handleNewSession = useCallback(async () => {
    if (!tenantId) return;
    await newSession(tenantId);
    setMessages([]);
    setSessionTitle("");
    setActiveConversationId(null);
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "session.end", sessionId }));
      }
      wsRef.current.close();
    }
    setReconnectCount(c => c + 1);
  }, [tenantId, sessionId]);

  const handleDeleteSession = useCallback(async (conversationId: string) => {
    if (!tenantId) return;
    await deleteSession(tenantId, conversationId);
    // If deleted the active session, start fresh
    if (activeConversationId === conversationId) {
      await handleNewSession();
    }
  }, [tenantId, activeConversationId, handleNewSession]);
```

Update the ChatContext.Provider value:

Replace:
```typescript
    <ChatContext.Provider value={{ subdomain, connected, sendMessage: handleSend }}>
```

With:
```typescript
    <ChatContext.Provider value={{
      subdomain, connected, sendMessage: handleSend,
      tenantId, sessionTitle, activeConversationId,
      onSwitchSession: handleSwitchSession, onNewSession: handleNewSession, onDeleteSession: handleDeleteSession,
    }}>
```

Update ChatPanel props to pass session info:

Replace:
```typescript
            <ChatPanel messages={messages} onSend={handleSend} connected={connected} loading={loading} status={status} />
```

With:
```typescript
            <ChatPanel
              messages={messages} onSend={handleSend} connected={connected} loading={loading} status={status}
              tenantId={tenantId} sessionTitle={sessionTitle} activeConversationId={activeConversationId}
              onSwitchSession={handleSwitchSession} onNewSession={handleNewSession} onDeleteSession={handleDeleteSession}
            />
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/components/ChatLayout.tsx
git commit -m "feat: ChatLayout session state management and switching"
```

---

### Task 6: ChatPanel session dropdown UI

**Files:**
- Modify: `packages/console/src/components/ChatPanel.tsx`

- [ ] **Step 1: Add session dropdown to ChatPanel header**

Replace the entire `packages/console/src/components/ChatPanel.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Wrench, ChevronDown, Plus, Trash2 } from "lucide-react";
import Markdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { getSessions } from "@/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolUse?: { tool: string; path?: string }[];
  done: boolean;
  isError?: boolean;
}

interface SessionItem {
  conversationId: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
}

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
  connected: boolean;
  loading: boolean;
  status?: string;
  tenantId?: string;
  sessionTitle?: string;
  activeConversationId?: string | null;
  onSwitchSession?: (conversationId: string) => void;
  onNewSession?: () => void;
  onDeleteSession?: (conversationId: string) => void;
}

export function ChatPanel({ messages, onSend, connected, loading, status, tenantId, sessionTitle, activeConversationId, onSwitchSession, onNewSession, onDeleteSession }: ChatPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSessions) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowSessions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSessions]);

  const loadSessions = async () => {
    if (!tenantId) return;
    try {
      const data = await getSessions(tenantId);
      setSessions(data.sessions ?? []);
    } catch { setSessions([]); }
  };

  const toggleDropdown = () => {
    if (!showSessions) loadSessions();
    setShowSessions(!showSessions);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || !connected || loading) return;
    setInput("");
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  };

  const headerTitle = sessionTitle || t("chat.title");

  return (
    <div className="flex flex-col h-full bg-gray-50/50 border-l border-gray-200">
      {/* Header with session dropdown */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 relative" ref={dropdownRef}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" : "bg-gray-300"}`} />
        <button onClick={toggleDropdown} className="flex items-center gap-1 min-w-0 flex-1 text-left">
          <span className="text-[13px] font-medium text-gray-600 truncate">{headerTitle}</span>
          <ChevronDown className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${showSessions ? "rotate-180" : ""}`} />
        </button>
        <button
          onClick={() => { onNewSession?.(); setShowSessions(false); }}
          className="flex-shrink-0 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-violet-600 transition-colors"
          title={t("chat.newConversation")}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Session dropdown */}
        {showSessions && (
          <div className="absolute top-full left-0 right-0 mt-1 mx-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
            {sessions.length > 0 ? sessions.map((s) => (
              <div
                key={s.conversationId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer group"
                onClick={() => { onSwitchSession?.(s.conversationId); setShowSessions(false); }}
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeConversationId === s.conversationId ? "bg-violet-500" : "bg-gray-300"}`} />
                <span className="text-[12px] text-gray-700 truncate flex-1">{s.title}</span>
                <span className="text-[10px] text-gray-300 flex-shrink-0">{timeAgo(s.lastActivityAt)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t("chat.deleteSessionConfirm"))) {
                      onDeleteSession?.(s.conversationId);
                      setSessions(prev => prev.filter(x => x.conversationId !== s.conversationId));
                    }
                  }}
                  className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )) : (
              <div className="px-3 py-4 text-center text-[12px] text-gray-400">{t("chat.noSessions")}</div>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-3">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === "user" ? "bg-gray-200" : msg.isError ? "bg-red-100" : "bg-violet-100"
            }`}>
              {msg.role === "user"
                ? <User className="w-3 h-3 text-gray-500" />
                : <Bot className={`w-3 h-3 ${msg.isError ? "text-red-500" : "text-violet-600"}`} />}
            </div>
            <div className="flex-1 min-w-0">
              {msg.role === "user" ? (
                <div className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap break-words">
                  {msg.content}
                </div>
              ) : msg.isError ? (
                <div className="text-[13px] leading-relaxed text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  <span className="font-medium">{t("common.error")} </span>{msg.content}
                </div>
              ) : (
                <div className="text-[13px] leading-relaxed text-gray-700 prose prose-sm prose-gray max-w-none [&_pre]:bg-gray-50 [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:text-xs [&_code]:text-violet-600 [&_code]:text-xs [&_code]:bg-gray-50 [&_code]:px-1 [&_code]:rounded [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium">
                  <TypedMarkdown content={msg.content} animate={!msg.done} />
                  {!msg.done && <span className="inline-block w-1 h-[14px] bg-violet-500 animate-pulse ml-0.5 -mb-0.5" />}
                </div>
              )}
              {msg.toolUse && msg.toolUse.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.toolUse.map((tu, j) => {
                    const friendlyToolNames: Record<string, string> = {
                      Write: t("chat.tool.Write"), Edit: t("chat.tool.Edit"), Read: t("chat.tool.Read"),
                      Bash: t("chat.tool.Bash"), Glob: t("chat.tool.Glob"), Grep: t("chat.tool.Grep"),
                    };
                    const displayName = friendlyToolNames[tu.tool] || tu.tool;
                    return (
                      <div key={j} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-gray-100 text-gray-500 font-mono border border-gray-200">
                        <Wrench className="w-3 h-3" />
                        {displayName}{tu.path ? ` ${tu.path}` : ""}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {status && (
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-violet-100">
              <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <span className="text-[13px] text-violet-600 animate-pulse">{status}</span>
          </div>
        )}
        {messages.length === 0 && !status && (
          <div className="flex flex-col items-center justify-center h-full px-4 pb-8">
            <Bot className="w-10 h-10 text-violet-300 mb-3" />
            <p className="text-sm font-medium text-gray-600 mb-1">{t("chat.welcomeTitle")}</p>
            <p className="text-xs text-gray-300 mb-5 text-center">{t("chat.welcomeSubtitle")}</p>
            <div className="space-y-2 w-full max-w-[280px]">
              {[
                { icon: "🎨", text: t("chat.example1") },
                { icon: "🗄️", text: t("chat.example2") },
                { icon: "🔌", text: t("chat.example3") },
                { icon: "📝", text: t("chat.example4") },
              ].map((example) => (
                <button
                  key={example.text}
                  onClick={() => { if (connected && !loading) onSend(example.text); }}
                  disabled={!connected || loading}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-[13px] text-gray-500 bg-gray-50 hover:bg-violet-50 hover:text-violet-700 border border-gray-100 hover:border-violet-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <span className="text-base">{example.icon}</span>
                  <span>{example.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-100">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? t("chat.placeholder") : t("chat.connecting")}
            disabled={!connected}
            className="w-full px-3 py-2.5 pr-12 bg-white border border-gray-200 rounded-lg text-[13px] text-gray-800 placeholder:text-gray-300 resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !connected || loading}
            aria-label={t("chat.sendMessage")}
            className="absolute right-2 bottom-2 p-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-30 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TypedMarkdown({ content, animate }: { content: string; animate: boolean }) {
  const [displayed, setDisplayed] = useState("");
  const targetRef = useRef(content);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!animate) { setDisplayed(content); return; }
    targetRef.current = content;
    if (indexRef.current > content.length) indexRef.current = content.length;
    const interval = setInterval(() => {
      if (indexRef.current < targetRef.current.length) {
        const step = Math.min(3, targetRef.current.length - indexRef.current);
        indexRef.current += step;
        setDisplayed(targetRef.current.substring(0, indexRef.current));
      }
    }, 15);
    return () => clearInterval(interval);
  }, [content, animate]);

  useEffect(() => {
    if (!animate && content) { setDisplayed(content); indexRef.current = content.length; }
  }, [animate, content]);

  return <Markdown>{displayed}</Markdown>;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/components/ChatPanel.tsx
git commit -m "feat: ChatPanel session dropdown with switch, new, delete"
```

---

### Task 7: Build and verify

- [ ] **Step 1: Build all packages**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx pnpm -r build 2>&1 | tail -20`
Expected: All packages build successfully

- [ ] **Step 2: Rebuild session image**

```bash
docker build -t vibeweb-session:latest /Users/cloudchamb3r/projects/vibeweb/session-image/
```

- [ ] **Step 3: Redeploy**

```bash
docker compose up --build -d
```

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A && git commit -m "chore: fix build issues from session management feature"
```
