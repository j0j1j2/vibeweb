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
  onSwitchSession?: (conversationId: string, title?: string) => void;
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

        {showSessions && (
          <div className="absolute top-full left-0 right-0 mt-1 mx-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
            {sessions.length > 0 ? sessions.map((s) => (
              <div
                key={s.conversationId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer group"
                onClick={() => { onSwitchSession?.(s.conversationId, s.title); setShowSessions(false); }}
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
