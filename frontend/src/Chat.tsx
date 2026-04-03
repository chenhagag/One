import { useState } from "react";
import { ChatUser, Analysis } from "./App";

const QUESTION = "What are you looking for in a partner?";

const s: Record<string, React.CSSProperties> = {
  heading: { marginTop: 0, marginBottom: 8, fontSize: 22 },
  sub: { color: "#666", marginBottom: 32, marginTop: 0 },
  bubble: {
    background: "#f5f5f5",
    borderRadius: "16px 16px 16px 4px",
    padding: "14px 18px",
    fontSize: 16,
    lineHeight: 1.5,
    marginBottom: 28,
    display: "inline-block",
  },
  aiLabel: { fontSize: 12, color: "#888", marginBottom: 8 },
  textarea: {
    width: "100%",
    padding: "12px",
    fontSize: 15,
    border: "1px solid #ddd",
    borderRadius: 8,
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: 120,
    outline: "none",
    marginBottom: 18,
    fontFamily: "inherit",
  },
  btn: {
    width: "100%",
    padding: "12px",
    fontSize: 15,
    fontWeight: 600,
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  hint: { fontSize: 13, color: "#888", marginTop: 10, textAlign: "center" },
  error: { color: "#c0392b", fontSize: 13, marginTop: 10 },
};

export default function Chat({
  user,
  onSuccess,
}: {
  user: ChatUser;
  onSuccess: (a: Analysis) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (answer.trim().length < 10) {
      setError("Please write a bit more — at least a sentence.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, answer }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Analysis failed");
        return;
      }

      onSuccess(data.analysis);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={s.heading}>Hi {user.name} 👋</h2>
      <p style={s.sub}>Step 2 of 2 — One question</p>

      <p style={s.aiLabel}>Matchmaker AI</p>
      <div style={s.bubble}>{QUESTION}</div>

      <textarea
        style={s.textarea}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Take your time — be honest…"
        disabled={loading}
      />

      <button style={s.btn} type="submit" disabled={loading || !answer.trim()}>
        {loading ? "Analysing your answer…" : "Analyse →"}
      </button>

      <p style={s.hint}>This usually takes 5–10 seconds.</p>
      {error && <p style={s.error}>{error}</p>}
    </form>
  );
}
