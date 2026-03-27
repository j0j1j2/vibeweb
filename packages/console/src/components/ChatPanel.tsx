import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Wrench } from "lucide-react";

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
    <div className="flex flex-col h-full bg-[#0c0c10] border-l border-white/[0.06]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-white/20"}`} />
        <span className="text-[13px] font-medium text-white/70">Vibe Editor</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-3">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === "user" ? "bg-white/[0.08]" : "bg-violet-500/20"
            }`}>
              {msg.role === "user"
                ? <User className="w-3 h-3 text-white/60" />
                : <Bot className="w-3 h-3 text-violet-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap break-words">
                {msg.content}
                {!msg.done && <span className="inline-block w-1 h-[14px] bg-violet-400 animate-pulse ml-0.5 -mb-0.5" />}
              </div>
              {msg.toolUse && msg.toolUse.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.toolUse.map((t, j) => (
                    <div key={j} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-white/[0.04] text-white/40 font-mono border border-white/[0.06]">
                      <Wrench className="w-3 h-3" />
                      {t.tool}{t.path ? ` ${t.path}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-white/20 gap-3 pb-12">
            <Bot className="w-10 h-10" />
            <p className="text-sm">Describe what you want to build</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "Message... (Ctrl+Enter)" : "Connecting..."}
            disabled={!connected}
            className="w-full px-3 py-2.5 pr-12 bg-white/[0.04] border border-white/[0.08] rounded-lg text-[13px] text-white/90 placeholder:text-white/20 resize-none focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
            rows={3}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !connected || loading}
            className="absolute right-2 bottom-2 p-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-30 disabled:hover:bg-violet-600 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
