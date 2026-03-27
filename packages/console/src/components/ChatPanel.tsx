import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolUse?: { tool: string; path?: string }[];
  done: boolean;
}

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
  connected: boolean;
  loading: boolean;
}

export function ChatPanel({ messages, onSend, connected, loading }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !connected || loading) return;
    setInput("");
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full border-r">
      <div className="px-4 py-3 border-b flex items-center gap-2 text-sm font-medium">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-zinc-300"}`} />
        Chat
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              msg.role === "user" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"
            }`}>
              {msg.content}
              {msg.toolUse && msg.toolUse.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.toolUse.map((t, j) => (
                    <div key={j} className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 font-mono">
                      {t.tool}{t.path ? `: ${t.path}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {!msg.done && <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-0.5" />}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-zinc-400 text-sm mt-12">Start a conversation to edit your site with AI</div>
        )}
      </div>
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={connected ? "Describe what you want to change... (Ctrl+Enter to send)" : "Connecting..."}
            disabled={!connected}
            className="flex-1 px-3 py-2 border rounded-md bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400" rows={2} />
          <button onClick={handleSend} disabled={!input.trim() || !connected || loading}
            className="px-3 py-2 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 self-end">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
