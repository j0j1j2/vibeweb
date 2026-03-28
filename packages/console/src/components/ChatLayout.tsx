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
  isError?: boolean;
}

interface ChatContextValue {
  subdomain: string;
  connected: boolean;
  sendMessage: (content: string) => void;
}

const ChatContext = createContext<ChatContextValue>({ subdomain: "", connected: false, sendMessage: () => {} });

export function useChatContext() {
  return useContext(ChatContext);
}

export function ChatLayout({ children }: { children: ReactNode }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const [reconnectCount, setReconnectCount] = useState(0);

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
      if (msg.type === "session.ready") { setSessionId(msg.sessionId); setConnected(true); reconnectRef.current = 0; }
      else if (msg.type === "stream") {
        const d = msg.data;

        // Update status indicator based on event type
        if (d?.type === "system") {
          setStatus("Connecting...");
        } else if (d?.type === "assistant") {
          const blocks = d.message?.content;
          if (Array.isArray(blocks)) {
            const hasThinking = blocks.some((b: any) => b.type === "thinking");
            const hasToolUse = blocks.some((b: any) => b.type === "tool_use");
            const hasText = blocks.some((b: any) => b.type === "text");
            if (hasToolUse) {
              const tool = blocks.find((b: any) => b.type === "tool_use");
              const toolName = tool?.name ?? "";
              const filePath = tool?.input?.file_path || tool?.input?.command || "";
              if (toolName === "Write" || toolName === "Edit") setStatus(`Writing ${filePath.split("/").pop() || "file"}...`);
              else if (toolName === "Read") setStatus(`Reading ${filePath.split("/").pop() || "file"}...`);
              else if (toolName === "Bash") setStatus("Running command...");
              else if (toolName) setStatus(`Using ${toolName}...`);
              else setStatus("Working...");
            } else if (hasText) {
              setStatus("");
            } else if (hasThinking) {
              setStatus("Thinking...");
            }
          }
        } else if (d?.type === "user") {
          // tool_result — Claude got the result, processing next step
          setStatus("Working...");
        } else if (d?.type === "result") {
          setStatus("");
        }

        // Update messages
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant" || last.done) {
            return [...prev, { role: "assistant", content: "", toolUse: [], done: false }];
          }
          const updated = [...prev];
          const current = { ...updated[updated.length - 1] };
          if (d?.type === "assistant") {
            const msgContent = d.message?.content;
            if (Array.isArray(msgContent)) {
              for (const block of msgContent) {
                if (block.type === "text") current.content += block.text ?? "";
                else if (block.type === "tool_use") current.toolUse = [...(current.toolUse ?? []), { tool: block.name, path: block.input?.file_path }];
              }
            } else if (typeof d.content === "string") {
              current.content += d.content;
            }
          } else if (d?.type === "text") {
            current.content += d.content ?? "";
          } else if (d?.type === "tool_use") {
            current.toolUse = [...(current.toolUse ?? []), { tool: d.tool ?? d.name, path: d.path }];
          }
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
        setStatus("");
        // Notify preview to refresh after Claude finishes a turn
        window.dispatchEvent(new Event("vibeweb:preview-refresh"));
      } else if (msg.type === "error") {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: msg.error || "Something went wrong",
          toolUse: [],
          done: true,
          isError: true,
        }]);
        setLoading(false);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setSessionId(null);
      // Auto-reconnect after 2 seconds (max 5 retries)
      if (reconnectRef.current < 5) {
        reconnectRef.current += 1;
        setTimeout(() => {
          // Re-trigger the effect by updating a reconnect counter
          setReconnectCount(c => c + 1);
        }, 2000);
      } else {
        setStatus("Connection lost. Please refresh the page.");
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "session.end", sessionId }));
      ws.close();
    };
  }, [tenantId, reconnectCount]);

  const handleSend = useCallback((content: string) => {
    if (!wsRef.current || !sessionId) return;
    setMessages((prev) => [...prev, { role: "user", content, toolUse: [], done: true }]);
    setStatus("Thinking...");
    setLoading(true);
    wsRef.current.send(JSON.stringify({ type: "message", sessionId, content }));
  }, [sessionId]);

  const [collapsed, setCollapsed] = useState(false);

  return (
    <ChatContext.Provider value={{ subdomain, connected, sendMessage: handleSend }}>
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
              aria-label="Open chat"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
            <div className={`mt-2 w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-gray-300"}`} />
          </div>
        ) : (
          <div className="w-[340px] flex-shrink-0 relative">
            <button
              onClick={() => setCollapsed(true)}
              className="absolute top-3 right-3 z-10 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Collapse chat"
              aria-label="Collapse chat"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
            <ChatPanel messages={messages} onSend={handleSend} connected={connected} loading={loading} status={status} />
          </div>
        )}
      </div>
    </ChatContext.Provider>
  );
}
