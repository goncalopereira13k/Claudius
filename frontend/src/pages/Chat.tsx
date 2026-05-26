import { useState, useRef, useEffect } from "react";
import { agentApi } from "../services/api";
import type { ChatMessage } from "../types";

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Salve! Ego sum Claudius, magister tuus. Interroga me de exercitatione tua." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    const reply = await agentApi.chat(text).catch(() => "Non potui respondere. Verifica API key.");
    setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    setLoading(false);
  }

  return (
    <div className="w-full flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
      <div className="flex items-center gap-4 mb-6 shrink-0">
        <h1 className="text-2xl font-cinzel tracking-widest uppercase">Colloquium</h1>
        <div className="flex-1 h-px bg-stone" />
      </div>

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
              {m.content}
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
