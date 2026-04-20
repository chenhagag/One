import { useState, useEffect, useRef, useCallback } from "react";
import { ChatUser } from "./App";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

type Phase = "chatting" | "summarizing" | "confirmed" | "paused";

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex", flexDirection: "column", height: "80vh", maxHeight: 700,
    direction: "rtl" as const,
    background: "#fafbfc",
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid #e2e8f0",
  },
  messages: {
    flex: 1, overflowY: "auto", padding: "16px 16px 8px",
    display: "flex", flexDirection: "column", gap: 10,
    background: "#fafbfc",
  },
  bubbleUser: {
    alignSelf: "flex-start",
    background: "linear-gradient(135deg, #6366F1, #818CF8)",
    color: "#fff",
    borderRadius: "18px 18px 18px 4px", padding: "10px 16px",
    maxWidth: "80%", fontSize: 15, lineHeight: 1.6,
    textAlign: "right" as const, direction: "rtl" as const, unicodeBidi: "isolate" as const,
    boxShadow: "0 1px 3px rgba(99,102,241,0.2)",
  },
  bubbleAssistant: {
    alignSelf: "flex-end",
    background: "#ffffff", color: "#1e293b",
    border: "1px solid #e2e8f0",
    borderRadius: "18px 18px 4px 18px", padding: "10px 16px",
    maxWidth: "80%", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-line" as const,
    textAlign: "right" as const, direction: "rtl" as const, unicodeBidi: "isolate" as const,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  bubbleSystem: {
    alignSelf: "center",
    background: "linear-gradient(135deg, #f0f4ff, #ede9fe)",
    color: "#4338ca",
    borderRadius: 14, padding: "14px 20px",
    maxWidth: "90%", fontSize: 14, lineHeight: 1.7, textAlign: "center" as const,
    whiteSpace: "pre-line" as const,
    border: "1px solid #c7d2fe",
  },
  inputRow: {
    display: "flex", gap: 8, padding: "12px 16px",
    background: "#fff", borderTop: "1px solid #e2e8f0",
  },
  input: {
    flex: 1, padding: "10px 14px", fontSize: 15,
    border: "1px solid #e2e8f0", borderRadius: 12,
    outline: "none", fontFamily: "inherit",
    resize: "none" as const, overflow: "hidden", lineHeight: 1.5,
    minHeight: 40, maxHeight: 160, direction: "rtl" as const, textAlign: "right" as const,
    background: "#f8fafc",
  },
  btn: {
    padding: "10px 20px", fontSize: 14, fontWeight: 600,
    background: "linear-gradient(135deg, #6366F1, #818CF8)",
    color: "#fff", border: "none", borderRadius: 12, cursor: "pointer",
  },
  btnSecondary: {
    padding: "8px 16px", fontSize: 13, fontWeight: 500,
    background: "transparent", color: "#94a3b8", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
  },
  findBtn: {
    padding: "14px 40px", fontSize: 17, fontWeight: 700,
    background: "linear-gradient(135deg, #818CF8, #6366F1, #C084FC)",
    color: "#fff", border: "none", borderRadius: 30, cursor: "pointer",
    letterSpacing: 0.5,
    boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
  },
  status: { fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "4px 0" },
  bottomBar: {
    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12,
    padding: "20px 16px", background: "#fff", borderTop: "1px solid #e2e8f0",
  },
};

export default function Chat({
  user,
  onComplete,
  onPause,
}: {
  user: ChatUser;
  onComplete: () => void;
  onPause?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("chatting");
  const [turnCount, setTurnCount] = useState(0);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const analysisFiredRef = useRef(false);

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

  // Trigger analysis when user leaves (unmount or tab close)
  useEffect(() => {
    const triggerAnalysis = () => {
      if (analysisFiredRef.current) return;
      analysisFiredRef.current = true;
      const body = JSON.stringify({ user_id: user.id });
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/conversation/pause", blob);
      } else {
        fetch("/api/conversation/pause", {
          method: "POST", headers: { "Content-Type": "application/json" }, body,
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", triggerAnalysis);
    return () => {
      window.removeEventListener("beforeunload", triggerAnalysis);
      triggerAnalysis();
    };
  }, [user.id]);

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
          setMessages(data.turns);
          setTurnCount(data.turn_count);
        } else {
          // New conversation — show the fixed intro as a system message
          setMessages([{ role: "system", content: data.assistant_message }]);
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

      if (data.phase === "confirmed") {
        // Show the fixed closing as a system message
        setMessages((prev) => [...prev, { role: "system", content: data.assistant_message }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.assistant_message }]);
      }
      setTurnCount(data.turn_count);
      setPhase(data.phase);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    analysisFiredRef.current = true; // prevent double-trigger on unmount
    try {
      // Pause the conversation (also triggers analysis on the backend)
      const pauseRes = await fetch("/api/conversation/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const pauseData = await pauseRes.json();

      // If pause didn't run analysis (e.g. state was missing), trigger it explicitly
      if (!pauseData.analysis_ran && turnCount >= 3) {
        console.log("[chat] Pause did not run analysis, triggering explicitly...");
        fetch("/api/conversation/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id }),
        }).catch(() => {}); // fire-and-forget fallback
      }

      setPhase("paused");
      if (onPause) onPause();
    } catch {
      setError("Could not pause conversation");
    }
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
      {/* Messages */}
      <div ref={scrollRef} style={s.messages}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={m.role === "system" ? s.bubbleSystem : m.role === "user" ? s.bubbleUser : s.bubbleAssistant}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ ...s.bubbleAssistant, color: "#aaa" }}>...</div>
        )}
      </div>

      {/* Bottom area */}
      {phase === "confirmed" ? (
        <div style={s.bottomBar}>
          <button style={s.findBtn} onClick={() => { analysisFiredRef.current = true; onComplete(); }}>
            Find My One ❤️
          </button>
        </div>
      ) : phase === "paused" ? (
        <div style={s.bottomBar}>
          <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
            השיחה נשמרה. אפשר להמשיך בכל זמן.
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
              placeholder={phase === "summarizing" ? "...תיקון או אישור" : "...כתבי כאן"}
              disabled={loading || !canType}
            />
            <button style={s.btn} onClick={handleSend} disabled={loading || !input.trim() || !canType}>
              שלחי
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
            <button style={s.btnSecondary} onClick={handlePause} disabled={loading}>
              נמשיך בפעם אחרת
            </button>
          </div>
        </>
      )}

      {error && <p style={{ color: "#c0392b", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
