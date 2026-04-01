import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Wrench } from "lucide-react";
import Markdown from "react-markdown";
import { useTranslation } from "react-i18next";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolUse?: { tool: string; path?: string }[];
  done: boolean;
  isError?: boolean;
}

interface ChatPanelProps {
  messages: Message[];
  onSend: (content: string) => void;
  connected: boolean;
  loading: boolean;
  status?: string;
  subdomain?: string;
}

export function ChatPanel({ messages, onSend, connected, loading, status, subdomain }: ChatPanelProps) {
  const { t } = useTranslation();
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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/50 border-l border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 pr-10">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" : "bg-gray-300"}`} />
        <span className="text-[13px] font-medium text-gray-600">{t("chat.title")}</span>
        {subdomain && <span className="text-[11px] text-gray-300 font-mono ml-auto truncate">{subdomain}</span>}
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
                <div className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap break-words">{msg.content}</div>
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
