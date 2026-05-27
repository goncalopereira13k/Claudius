import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { agentApi, syncApi } from "../services/api";
import type { ChatMessage } from "../types";

const STORAGE_KEY = "claudius_conversation_id";

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "Salve! Ego sum Claudius, magister tuus. Interroga me de exercitatione tua.",
};

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    setRestoring(true);
    agentApi
      .getMessages(conversationId)
      .then((msgs) => {
        if (msgs.length === 0) {
          setMessages([WELCOME]);
          return;
        }
        setMessages(msgs.map((m) => ({ role: m.role, content: m.content })));
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setConversationId(null);
        setMessages([WELCOME]);
      })
      .finally(() => setRestoring(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const { reply, conversation_id } = await agentApi.chat(text, conversationId ?? undefined);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (!conversationId) {
        setConversationId(conversation_id);
        localStorage.setItem(STORAGE_KEY, String(conversation_id));
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Non potui respondere. Verifica API key." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startNewConversation() {
    const conv = await agentApi.createConversation().catch(() => null);
    if (!conv) return;
    localStorage.setItem(STORAGE_KEY, String(conv.id));
    setConversationId(conv.id);
    setMessages([WELCOME]);
  }

  async function syncAndReset() {
    await syncApi.trigger().catch(() => null);
    localStorage.removeItem(STORAGE_KEY);
    setConversationId(null);
    setMessages([
      WELCOME,
      { role: "assistant", content: "Sync triggered. Data will be ready in ~60 seconds. Ask me anything once it completes." },
    ]);
  }

  return (
    <div className="w-full flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
      <div className="flex items-center gap-4 mb-6 shrink-0">
        <h1 className="text-2xl font-cinzel tracking-widest uppercase">Colloquium</h1>
        <div className="flex-1 h-px bg-stone" />
        <button
          onClick={syncAndReset}
          className="text-[9px] font-cinzel tracking-[0.25em] uppercase text-ash hover:text-ink border border-stone px-3 py-1.5 transition-colors"
        >
          Sync
        </button>
        <button
          onClick={startNewConversation}
          className="text-[9px] font-cinzel tracking-[0.25em] uppercase text-ash hover:text-ink border border-stone px-3 py-1.5 transition-colors"
        >
          Nova Sessio
        </button>
      </div>

      {restoring && (
        <p className="text-[10px] font-cinzel tracking-widest text-ash text-center mb-2 animate-pulse">
          A recuperar conversatio...
        </p>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-xl px-5 py-4 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-ink text-parchment font-cinzel tracking-wide"
                  : "bg-tablet border border-stone text-ink"
              }`}
            >
              {m.role === "assistant" && (
                <p className="text-[9px] font-cinzel tracking-[0.3em] text-ash uppercase mb-2">Claudius</p>
              )}
              {m.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    code: ({ children }) => <code className="font-mono text-xs bg-stone/30 px-1">{children}</code>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-tablet border border-stone px-5 py-4">
              <p className="text-[9px] font-cinzel tracking-[0.3em] text-ash uppercase mb-2">Claudius</p>
              <p className="text-sm text-ash font-cinzel animate-pulse tracking-widest">Cogitans...</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-3 border-t-2 border-stone pt-4 shrink-0">
        <input
          className="flex-1 bg-parchment border border-stone px-4 py-3 text-sm font-cinzel tracking-wide text-ink placeholder-ash/50 focus:outline-none focus:border-ink transition-colors"
          placeholder="Scribe hic..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-6 py-3 bg-ink text-parchment text-[10px] font-cinzel tracking-[0.25em] uppercase hover:bg-bronze disabled:opacity-40 transition-colors"
        >
          Mitte
        </button>
      </div>
    </div>
  );
}
