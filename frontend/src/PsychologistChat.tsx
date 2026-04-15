import { useState, useEffect, useRef, useCallback } from "react";
import { ChatUser } from "./App";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: "70vh", maxHeight: 600, direction: "rtl" as const },
  messages: {
    flex: 1, overflowY: "auto", padding: "12px 0",
    display: "flex", flexDirection: "column", gap: 12,
  },
  bubbleUser: {
    alignSelf: "flex-start", background: "#1a1a1a", color: "#fff",
    borderRadius: "16px 16px 16px 4px", padding: "10px 16px",
    maxWidth: "80%", fontSize: 15, lineHeight: 1.5,
    textAlign: "right" as const, direction: "rtl" as const, unicodeBidi: "isolate" as const,
  },
  bubbleAssistant: {
    alignSelf: "flex-end", background: "#f0f0f0", color: "#1a1a1a",
    borderRadius: "16px 16px 4px 16px", padding: "10px 16px",
    maxWidth: "80%", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-line" as const,
    textAlign: "right" as const, direction: "rtl" as const, unicodeBidi: "isolate" as const,
  },
  inputRow: {
    display: "flex", gap: 8, padding: "12px 0", borderTop: "1px solid #e5e5e5",
  },
  input: {
    flex: 1, padding: "10px 14px", fontSize: 15, border: "1px solid #ddd",
    borderRadius: 8, outline: "none", fontFamily: "inherit",
    resize: "none" as const, overflow: "hidden", lineHeight: 1.5,
    minHeight: 40, maxHeight: 160, direction: "rtl" as const, textAlign: "right" as const,
  },
  btn: {
    padding: "10px 20px", fontSize: 14, fontWeight: 600,
    background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
  },
  btnSecondary: {
    padding: "8px 16px", fontSize: 13, fontWeight: 500,
    background: "transparent", color: "#888", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer",
  },
};

export default function PsychologistChat({
  user,
  onBack,
}: {
  user: ChatUser;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Start or resume psychologist chat
  useEffect(() => {
    if (started) return;
    setStarted(true);
    setLoading(true);

    fetch("/api/psychologist/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        if (data.messages?.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => setError("Could not reach the server"))
      .finally(() => setLoading(false));
  }, [user.id, started]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/psychologist/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, message: text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); return; }

      setMessages((prev) => [...prev, { role: "assistant", content: data.assistant_message }]);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={s.container}>
      {/* Messages */}
      <div ref={scrollRef} style={s.messages}>
        {messages.length === 0 && !loading && (
          <div style={{
            alignSelf: "center", color: "#999", fontSize: 14,
            padding: "40px 20px", textAlign: "center",
          }}>
            טוען שיחה...
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={m.role === "user" ? s.bubbleUser : s.bubbleAssistant}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ ...s.bubbleAssistant, color: "#aaa" }}>...</div>
        )}
      </div>

      {/* Input */}
      <div style={s.inputRow}>
        <textarea
          ref={textareaRef}
          style={s.input}
          value={input}
          rows={1}
          onChange={(e) => { setInput(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          placeholder="...כתבי כאן"
          disabled={loading}
        />
        <button style={s.btn} onClick={handleSend} disabled={loading || !input.trim()}>
          שלחי
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <button style={s.btnSecondary} onClick={() => {
          // Trigger analysis on exit (fire-and-forget)
          fetch("/api/conversation/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: user.id }),
          }).catch(() => {});
          onBack();
        }} disabled={loading}>
          חזרה לדשבורד
        </button>
      </div>

      {error && <p style={{ color: "#c0392b", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
