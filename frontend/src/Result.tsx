import { ChatUser, AnalysisResult } from "./App";

const s: Record<string, React.CSSProperties> = {
  heading: { marginTop: 0, marginBottom: 8, fontSize: 22 },
  sub: { color: "#666", marginBottom: 24, marginTop: 0 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 },
  traitRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  traitName: { fontSize: 13, color: "#333", width: 180, flexShrink: 0 },
  bar: { flex: 1, height: 8, borderRadius: 4, background: "#e5e5e5" },
  score: { fontSize: 12, color: "#888", width: 32, textAlign: "right" as const },
  conf: { fontSize: 11, color: "#aaa", width: 40 },
  badge: { background: "#f0f0f0", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontFamily: "monospace" },
  partnerBadge: { background: "#d6eaff", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontFamily: "monospace" },
  completeness: { background: "#fafafa", borderRadius: 8, padding: 16, marginBottom: 20 },
  btn: { marginTop: 20, width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, background: "none", color: "#1a1a1a", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer" },
};

function barColor(score: number): string {
  if (score >= 70) return "#27ae60";
  if (score >= 40) return "#f39c12";
  return "#e74c3c";
}

export default function Result({
  user,
  analysis: result,
  onReset,
}: {
  user: ChatUser;
  analysis: AnalysisResult;
  onReset: () => void;
}) {
  const { analysis, saved } = result;
  const c = analysis.profiling_completeness;

  return (
    <div>
      <h2 style={s.heading}>Profile analysis, {user.name}</h2>
      <p style={s.sub}>
        Saved {saved.internal_saved} personality + {saved.external_saved} appearance traits
      </p>

      {/* Completeness */}
      <div style={s.completeness}>
        <strong>Coverage: {c.coverage_pct}%</strong>
        {" "}({c.internal_assessed}/{c.internal_total} internal, {c.external_assessed}/{c.external_total} external)
        {c.ready_for_matching ? (
          <span style={{ color: "#27ae60", marginLeft: 8 }}>Ready for matching</span>
        ) : (
          <span style={{ color: "#e67e22", marginLeft: 8 }}>More conversation needed</span>
        )}
      </div>

      {/* Internal Traits */}
      {analysis.internal_traits.length > 0 && (
        <div style={s.section}>
          <p style={s.sectionTitle}>Personality Traits ({analysis.internal_traits.length})</p>
          {analysis.internal_traits.map((t) => (
            <div key={t.internal_name} style={s.traitRow}>
              <span style={s.traitName}>{t.internal_name.replace(/_/g, " ")}</span>
              <div style={s.bar}>
                <div style={{ height: "100%", borderRadius: 4, background: barColor(t.score), width: `${t.score}%` }} />
              </div>
              <span style={s.score}>{t.score}</span>
              <span style={s.conf}>({(t.confidence * 100).toFixed(0)}%)</span>
              {t.weight_for_match != null && (
                <span style={s.partnerBadge}>partner: {t.weight_for_match}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* External Traits */}
      {analysis.external_traits.length > 0 && (
        <div style={s.section}>
          <p style={s.sectionTitle}>Appearance ({analysis.external_traits.length})</p>
          {analysis.external_traits.map((t) => (
            <div key={t.internal_name} style={{ marginBottom: 4, fontSize: 13 }}>
              <span style={{ color: "#333", marginRight: 8 }}>{t.internal_name.replace(/_/g, " ")}:</span>
              {t.personal_value && <span style={s.badge}>self: {t.personal_value}</span>}
              {t.desired_value && <span style={{ ...s.partnerBadge, marginLeft: 4 }}>wants: {t.desired_value}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Recommended probes */}
      {analysis.recommended_probes.length > 0 && (
        <div style={s.section}>
          <p style={s.sectionTitle}>Suggested next topics</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#666" }}>
            {analysis.recommended_probes.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <button style={s.btn} onClick={onReset}>Start over</button>
    </div>
  );
}
