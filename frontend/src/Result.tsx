import { ChatUser, Analysis } from "./App";

const s: Record<string, React.CSSProperties> = {
  heading: { marginTop: 0, marginBottom: 8, fontSize: 22 },
  sub: { color: "#666", marginBottom: 32, marginTop: 0 },
  card: {
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLabel: { fontSize: 14, color: "#555", margin: 0 },
  cardValue: { fontWeight: 600, fontSize: 16, margin: 0 },
  bar: {
    height: 8,
    borderRadius: 4,
    background: "#e5e5e5",
    marginTop: 8,
    width: 180,
  },
  fill: (score: number): React.CSSProperties => ({
    height: "100%",
    borderRadius: 4,
    background: score >= 7 ? "#27ae60" : score >= 4 ? "#f39c12" : "#e74c3c",
    width: `${score * 10}%`,
  }),
  badge: (val: string): React.CSSProperties => ({
    background:
      val === "serious" || val === "extroverted"
        ? "#dff0d8"
        : val === "casual" || val === "introverted"
        ? "#f9e8e8"
        : "#e8f0f9",
    color:
      val === "serious" || val === "extroverted"
        ? "#2d6a2d"
        : val === "casual" || val === "introverted"
        ? "#8b2020"
        : "#1a3a6b",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 14,
    fontWeight: 500,
  }),
  btn: {
    marginTop: 28,
    width: "100%",
    padding: "12px",
    fontSize: 15,
    fontWeight: 600,
    background: "none",
    color: "#1a1a1a",
    border: "1px solid #ddd",
    borderRadius: 8,
    cursor: "pointer",
  },
};

export default function Result({
  user,
  analysis,
  onReset,
}: {
  user: ChatUser;
  analysis: Analysis;
  onReset: () => void;
}) {
  return (
    <div>
      <h2 style={s.heading}>Your profile, {user.name}</h2>
      <p style={s.sub}>Here's what your answer revealed.</p>

      <div style={s.card}>
        <div>
          <p style={s.cardLabel}>Intelligence</p>
          <div style={s.bar}>
            <div style={s.fill(analysis.intelligence_score)} />
          </div>
        </div>
        <p style={s.cardValue}>{analysis.intelligence_score} / 10</p>
      </div>

      <div style={s.card}>
        <div>
          <p style={s.cardLabel}>Emotional depth</p>
          <div style={s.bar}>
            <div style={s.fill(analysis.emotional_depth_score)} />
          </div>
        </div>
        <p style={s.cardValue}>{analysis.emotional_depth_score} / 10</p>
      </div>

      <div style={s.card}>
        <p style={s.cardLabel}>Social style</p>
        <span style={s.badge(analysis.social_style)}>{analysis.social_style}</span>
      </div>

      <div style={s.card}>
        <p style={s.cardLabel}>Relationship goal</p>
        <span style={s.badge(analysis.relationship_goal)}>
          {analysis.relationship_goal}
        </span>
      </div>

      <button style={s.btn} onClick={onReset}>
        Start over
      </button>
    </div>
  );
}
