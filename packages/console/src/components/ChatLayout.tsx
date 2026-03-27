import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ChatPanel } from "@/components/ChatPanel";
import { getTenant } from "@/api";
import { MessageSquare, PanelRightClose, PanelRightOpen } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolUse?: { tool: string; path?: string }[];
  done: boolean;
}

interface ChatContextValue {
  subdomain: string;
  connected: boolean;
}

const ChatContext = createContext<ChatContextValue>({ subdomain: "", connected: false });

export function useChatContext() {
  return useContext(ChatContext);
}

export function ChatLayout({ children }: { children: ReactNode }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then((t) => setSubdomain(t.subdomain)).catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/agent`);
    wsRef.current = ws;

    ws.onopen = () => { ws.send(JSON.stringify({ type: "session.start", tenantId })); };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "session.ready") { setSessionId(msg.sessionId); setConnected(true); }
      else if (msg.type === "stream") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant" || last.done) {
            return [...prev, { role: "assistant", content: "", toolUse: [], done: false }];
          }
          const updated = [...prev];
          const current = { ...updated[updated.length - 1] };
          if (msg.data?.type === "assistant" || msg.data?.type === "text") current.content += msg.data.content ?? "";
          else if (msg.data?.type === "tool_use") current.toolUse = [...(current.toolUse ?? []), { tool: msg.data.tool, path: msg.data.path }];
          updated[updated.length - 1] = current;
          return updated;
        });
        setLoading(true);
      } else if (msg.type === "message.done") {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], done: true };
          return updated;
        });
        setLoading(false);
      } else if (msg.type === "error") {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg.error}`, toolUse: [], done: true }]);
        setLoading(false);
      }
    };

    ws.onclose = () => { setConnected(false); setSessionId(null); };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "session.end", sessionId }));
      ws.close();
    };
  }, [tenantId]);

  const handleSend = useCallback((content: string) => {
    if (!wsRef.current || !sessionId) return;
    setMessages((prev) => [...prev, { role: "user", content, toolUse: [], done: true }]);
    wsRef.current.send(JSON.stringify({ type: "message", sessionId, content }));
  }, [sessionId]);

  const [collapsed, setCollapsed] = useState(false);

  return (
    <ChatContext.Provider value={{ subdomain, connected }}>
      <div className="flex h-full">
        <div className="flex-1 min-w-0 overflow-hidden">
          {children}
        </div>

        {collapsed ? (
          <div className="w-10 flex-shrink-0 border-l border-gray-100 bg-gray-50/50 flex flex-col items-center py-3">
            <button
              onClick={() => setCollapsed(false)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-violet-600 transition-colors"
              title="Open chat"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
            <div className={`mt-2 w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-gray-300"}`} />
          </div>
        ) : (
          <div className="w-[380px] flex-shrink-0 relative">
            <button
              onClick={() => setCollapsed(true)}
              className="absolute top-3 right-3 z-10 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Collapse chat"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
            <ChatPanel messages={messages} onSend={handleSend} connected={connected} loading={loading} />
          </div>
        )}
      </div>
    </ChatContext.Provider>
  );
}
