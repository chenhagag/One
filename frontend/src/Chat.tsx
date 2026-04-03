import { useState, useEffect, useRef, useCallback } from "react";
import { ChatUser } from "./App";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type Phase = "chatting" | "summarizing" | "confirmed" | "paused";

const s: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: "70vh", maxHeight: 600 },
  messages: {
    flex: 1, overflowY: "auto", padding: "12px 0",
    display: "flex", flexDirection: "column", gap: 12,
  },
  bubbleUser: {
    alignSelf: "flex-end", background: "#1a1a1a", color: "#fff",
    borderRadius: "16px 16px 4px 16px", padding: "10px 16px",
    maxWidth: "80%", fontSize: 15, lineHeight: 1.5,
  },
  bubbleAssistant: {
    alignSelf: "flex-start", background: "#f0f0f0", color: "#1a1a1a",
    borderRadius: "16px 16px 16px 4px", padding: "10px 16px",
    maxWidth: "80%", fontSize: 15, lineHeight: 1.5,
  },
  inputRow: {
    display: "flex", gap: 8, padding: "12px 0", borderTop: "1px solid #e5e5e5",
  },
  input: {
    flex: 1, padding: "10px 14px", fontSize: 15, border: "1px solid #ddd",
    borderRadius: 8, outline: "none", fontFamily: "inherit",
    resize: "none" as const, overflow: "hidden", lineHeight: 1.5,
    minHeight: 40, maxHeight: 160,
  },
  btn: {
    padding: "10px 20px", fontSize: 14, fontWeight: 600,
    background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
  },
  btnSecondary: {
    padding: "8px 16px", fontSize: 13, fontWeight: 500,
    background: "transparent", color: "#888", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer",
  },
  btnPrimary: {
    padding: "12px 32px", fontSize: 15, fontWeight: 600,
    background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
  },
  status: { fontSize: 12, color: "#888", textAlign: "center", padding: "4px 0" },
  bottomBar: {
    display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
    padding: "16px 0", borderTop: "1px solid #e5e5e5",
  },
};

export default function Chat({
  user,
  onSuccess,
  onPause,
}: {
  user: ChatUser;
  onSuccess: (a: any) => void;
  onPause?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("chatting");
  const [coverage, setCoverage] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [error, setError] = useState("");
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Start or resume conversation on mount
  useEffect(() => {
    if (started) return;
    setStarted(true);
    setLoading(true);

    fetch("/api/conversation/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        if (data.resumed && data.turns) {
          // Resuming — restore full history
          setMessages(data.turns);
          setTurnCount(data.turn_count);
          setCoverage(data.coverage_pct);
        } else {
          setMessages([{ role: "assistant", content: data.assistant_message }]);
        }
        setPhase(data.phase || "chatting");
      })
      .catch(() => setError("Could not reach the server"))
      .finally(() => setLoading(false));
  }, [user.id, started]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || phase === "confirmed" || phase === "paused") return;

    setInput("");
    setError("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/conversation/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, message: text }),
      });
      const data = await res.json();

      if (!res.ok) { setError(data.error || "Something went wrong"); return; }

      setMessages((prev) => [...prev, { role: "assistant", content: data.assistant_message }]);
      setCoverage(data.coverage_pct);
      setTurnCount(data.turn_count);
      setPhase(data.phase);

      if (data.analysis) setLastAnalysis(data.analysis);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    try {
      await fetch("/api/conversation/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      setPhase("paused");
      if (onPause) onPause();
    } catch {
      setError("Could not pause conversation");
    }
  }

  function handleGoToResults() {
    onSuccess({
      saved: lastAnalysis?.saved || { internal_saved: 0, external_saved: 0 },
      analysis: lastAnalysis || null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canType = phase === "chatting" || phase === "summarizing";

  return (
    <div style={s.container}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>
        {user.name} ,היי
      </h2>
      <p style={{ color: "#666", margin: "0 0 12px", fontSize: 14 }}>
        בוא/י נכיר קצת
      </p>

      {/* Messages */}
      <div ref={scrollRef} style={s.messages}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === "user" ? s.bubbleUser : s.bubbleAssistant}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ ...s.bubbleAssistant, color: "#aaa" }}>...</div>
        )}
      </div>

      {/* Status bar */}
      {turnCount > 0 && (
        <div style={s.status}>
          {phase === "confirmed"
            ? "Profile complete"
            : phase === "paused"
              ? "Conversation paused"
              : phase === "summarizing"
                ? "Reviewing your profile..."
                : `Turn ${turnCount}${coverage > 0 ? ` — ${Math.round(coverage)}% coverage` : ""}`}
        </div>
      )}

      {/* Bottom area — depends on phase */}
      {phase === "confirmed" ? (
        <div style={s.bottomBar}>
          <button style={s.btnPrimary} onClick={handleGoToResults}>
            Continue to results
          </button>
        </div>
      ) : phase === "paused" ? (
        <div style={s.bottomBar}>
          <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
            Conversation saved. You can resume anytime.
          </p>
        </div>
      ) : (
        <>
          <div style={s.inputRow}>
            <textarea
              ref={textareaRef}
              style={s.input}
              value={input}
              rows={1}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder={phase === "summarizing" ? "Add corrections or confirm..." : "Type your message..."}
              disabled={loading || !canType}
            />
            <button style={s.btn} onClick={handleSend} disabled={loading || !input.trim() || !canType}>
              Send
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
            <button
              style={s.btnSecondary}
              onClick={handlePause}
              disabled={loading}
            >
              Let's continue later
            </button>
          </div>
        </>
      )}

      {error && <p style={{ color: "#c0392b", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
