import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ChatPanel } from "@/components/ChatPanel";
import { PreviewFrame } from "@/components/PreviewFrame";
import { FileTree } from "@/components/FileTree";
import { DbExplorer } from "@/components/DbExplorer";
import { getTenant } from "@/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolUse?: { tool: string; path?: string }[];
  done: boolean;
}

export function ChatPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "files" | "db">("preview");
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

  return (
    <div className="flex h-full">
      <div className="w-[35%] min-w-[300px]">
        <ChatPanel messages={messages} onSend={handleSend} connected={connected} loading={loading} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex border-b">
          {(["preview", "files", "db"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize ${activeTab === tab ? "border-b-2 border-zinc-900 dark:border-zinc-100" : "text-zinc-500 hover:text-zinc-700"}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {activeTab === "preview" && subdomain && <PreviewFrame subdomain={subdomain} />}
          {activeTab === "files" && tenantId && <FileTree tenantId={tenantId} />}
          {activeTab === "db" && tenantId && <DbExplorer tenantId={tenantId} />}
        </div>
      </div>
    </div>
  );
}
