import { useEffect, useState } from "react";

/**
 * Admin View — Multi-table data explorer
 *
 * Tabs:
 * - Overview (stats)
 * - Users (with expandable trait details)
 * - Trait Definitions
 * - Look Trait Definitions
 * - Enum Options
 * - Config (editable)
 * - Matches
 */

type Tab = "overview" | "users" | "traits" | "look_traits" | "enums" | "config" | "matches" | "candidates";

const s: Record<string, React.CSSProperties> = {
  heading: { marginTop: 0, marginBottom: 8, fontSize: 22 },
  sub: { color: "#666", marginBottom: 20, marginTop: 0 },
  backBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: "#555", fontSize: 14, padding: 0, marginBottom: 20, textDecoration: "underline",
  },
  tabs: { display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 24 },
  tab: {
    padding: "8px 14px", fontSize: 13, border: "1px solid #ddd",
    borderRadius: 6, background: "#fff", cursor: "pointer", fontWeight: 500,
  },
  tabActive: {
    padding: "8px 14px", fontSize: 13, border: "1px solid #1a1a1a",
    borderRadius: 6, background: "#1a1a1a", color: "#fff", cursor: "pointer", fontWeight: 600,
  },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12, marginTop: 12 },
  th: {
    textAlign: "left" as const, padding: "8px 8px", borderBottom: "2px solid #e5e5e5",
    fontWeight: 600, fontSize: 11, color: "#555", textTransform: "uppercase" as const, letterSpacing: "0.04em",
    whiteSpace: "nowrap" as const,
  },
  td: { padding: "8px 8px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" as const, maxWidth: 200, overflow: "hidden" as const, textOverflow: "ellipsis" as const },
  badge: { background: "#f0f0f0", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontFamily: "monospace" },
  none: { color: "#aaa", fontSize: 12 },
  loading: { color: "#888", padding: "20px 0" },
  statCard: { background: "#fafafa", borderRadius: 8, padding: "16px", display: "inline-block", margin: "4px", minWidth: 140, textAlign: "center" as const },
  statNum: { fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: 0 },
  statLabel: { fontSize: 12, color: "#888", marginTop: 4 },
  expandBtn: { background: "none", border: "none", cursor: "pointer", color: "#1a7af8", fontSize: 12, padding: "2px 4px", textDecoration: "underline" },
  configInput: { padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12, width: 120 },
  configSave: { padding: "4px 10px", border: "none", borderRadius: 4, background: "#1a1a1a", color: "#fff", fontSize: 11, cursor: "pointer", marginLeft: 4 },
  scrollWrap: { overflowX: "auto" as const },
};

export default function AdminView({ onBack, onStartChat }: { onBack: () => void; onStartChat?: (user: { id: number; first_name: string; email: string }) => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div>
      <button style={s.backBtn} onClick={onBack}>← Back</button>
      <h2 style={s.heading}>Admin Panel</h2>

      <div style={s.tabs}>
        {([
          ["overview", "Overview"],
          ["users", "Users"],
          ["traits", "Trait Defs"],
          ["look_traits", "Look Trait Defs"],
          ["enums", "Enum Options"],
          ["config", "Config"],
          ["candidates", "Candidate Matches"],
          ["matches", "Matched"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            style={tab === key ? s.tabActive : s.tab}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab onStartChat={onStartChat} />}
      {tab === "traits" && <TraitDefsTab />}
      {tab === "look_traits" && <LookTraitDefsTab />}
      {tab === "enums" && <EnumsTab />}
      {tab === "config" && <ConfigTab />}
      {tab === "matches" && <MatchesTab />}
      {tab === "candidates" && <CandidateMatchesTab />}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  if (!stats) return <p style={s.loading}>Loading...</p>;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {Object.entries(stats).map(([key, val]) => (
        <div key={key} style={s.statCard}>
          <p style={s.statNum}>{val}</p>
          <p style={s.statLabel}>{key.replace(/_/g, " ")}</p>
        </div>
      ))}
    </div>
  );
}

// ── Users Tab ────────────────────────────────────────────────────

function UsersTab({ onStartChat }: { onStartChat?: (user: { id: number; first_name: string; email: string }) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={s.loading}>Loading...</p>;

  if (selectedUserId !== null) {
    return <UserDetail userId={selectedUserId} onBack={() => setSelectedUserId(null)} onStartChat={onStartChat} />;
  }

  return (
    <div style={s.scrollWrap}>
      <p style={s.sub}>
        {users.length} users — click a row to view full profile
        <span style={{ marginLeft: 16, fontWeight: 600 }}>
          Users currently in match: {users.filter((u: any) => u.user_status === "in_match").length} / {users.length}
        </span>
      </p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>ID</th>
            <th style={s.th}>Name</th>
            <th style={s.th}>Email</th>
            <th style={s.th}>Age</th>
            <th style={s.th}>Gender</th>
            <th style={s.th}>City</th>
            <th style={s.th}>Height</th>
            <th style={s.th}>Status</th>
            <th style={s.th}>Looking For</th>
            <th style={s.th}>Matchable</th>
            <th style={s.th}>Wait Days</th>
            <th style={s.th}>Sys Priority</th>
            <th style={s.th}>Tokens</th>
            <th style={s.th}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              onClick={() => setSelectedUserId(u.id)}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f4ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <td style={s.td}>{u.id}</td>
              <td style={s.td}><strong>{u.first_name}</strong></td>
              <td style={s.td}>{u.email}</td>
              <td style={s.td}>{u.age || "-"}</td>
              <td style={s.td}><span style={s.badge}>{u.gender || "-"}</span></td>
              <td style={s.td}>{u.city || "-"}</td>
              <td style={s.td}>{u.height || "-"}</td>
              <td style={s.td}><span style={s.badge}>{u.user_status || "-"}</span></td>
              <td style={s.td}><span style={s.badge}>{u.looking_for_gender || "-"}</span></td>
              <td style={s.td}>{u.is_matchable ? "Yes" : "No"}</td>
              <td style={s.td}>{u.waiting_days ?? 0}</td>
              <td style={s.td}>{u.system_match_priority != null ? <strong>{u.system_match_priority}</strong> : "-"}</td>
              <td style={s.td}>{u.total_tokens ? u.total_tokens.toLocaleString() : "-"}</td>
              <td style={s.td}>{u.total_cost_usd ? `$${u.total_cost_usd.toFixed(4)}` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── User Detail View ────────────────────────────────────────────

function UserDetail({ userId, onBack, onStartChat }: { userId: number; onBack: () => void; onStartChat?: (user: { id: number; first_name: string; email: string }) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);
  const [tokenUsage, setTokenUsage] = useState<any>(null);
  const [ratingInProgress, setRatingInProgress] = useState<number | null>(null);
  const [cancelInProgress, setCancelInProgress] = useState<number | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [resetting, setResetting] = useState(false);

  function loadMatches() {
    fetch(`/api/admin/users/${userId}/matches`)
      .then((r) => r.json())
      .then(setMatches)
      .catch(() => {});
  }

  async function submitRating(matchId: number, rating: string) {
    setRatingInProgress(matchId);
    try {
      const r = await fetch(`/api/matches/${matchId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, rating }),
      });
      const json = await r.json();
      if (!r.ok) {
        alert(json.error || "Rating failed");
      }
      loadMatches();
    } catch {
      alert("Network error");
    } finally {
      setRatingInProgress(null);
    }
  }

  async function cancelMatch(matchId: number) {
    if (!confirm("Cancel this match?")) return;
    setCancelInProgress(matchId);
    try {
      const r = await fetch(`/api/admin/matches/${matchId}/cancel`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) alert(json.error || "Cancel failed");
      loadMatches();
    } catch {
      alert("Network error");
    } finally {
      setCancelInProgress(null);
    }
  }

  function loadUserData() {
    fetch(`/api/admin/users/${userId}/full`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  async function handleReanalyze() {
    if (!confirm("Re-analyze this user? This will overwrite current trait scores with fresh results from the latest prompts.")) return;
    setReanalyzing(true);
    try {
      const r = await fetch(`/api/admin/users/${userId}/reanalyze`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) { alert(json.error || "Re-analysis failed"); return; }
      alert(`Re-analysis complete: ${json.saved.internal_saved} internal + ${json.saved.external_saved} external traits saved`);
      loadUserData();
    } catch { alert("Network error"); }
    finally { setReanalyzing(false); }
  }

  async function handleResetAnalysis() {
    if (!confirm(
      "Reset all analysis data for this user?\n\n" +
      "This will DELETE:\n" +
      "  - All personality trait scores (user_traits)\n" +
      "  - All look trait scores (user_look_traits)\n" +
      "  - Cached analysis JSON in profiles\n\n" +
      "This will KEEP:\n" +
      "  - The user record\n" +
      "  - All conversation answers (raw_answer)\n" +
      "  - Match history\n\n" +
      "You can re-analyze afterwards to regenerate traits."
    )) return;
    setResetting(true);
    try {
      const r = await fetch(`/api/admin/users/${userId}/reset-analysis`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) { alert(json.error || "Reset failed"); return; }
      alert(`Reset complete: ${json.deleted_traits} traits + ${json.deleted_look_traits} look traits deleted, ${json.cleared_profiles} profiles cleared`);
      loadUserData();
    } catch { alert("Network error"); }
    finally { setResetting(false); }
  }

  async function handleDeleteUser() {
    if (!confirm(
      `Permanently delete user #${userId}?\n\n` +
      "This will delete:\n" +
      "  - The user record\n" +
      "  - All conversation answers\n" +
      "  - All trait data\n" +
      "  - All matches and candidates\n\n" +
      "This cannot be undone."
    )) return;

    try {
      const r = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const json = await r.json();
      if (!r.ok) { alert(json.error || "Delete failed"); return; }
      alert(`User #${userId} deleted.`);
      onBack();
    } catch { alert("Network error"); }
  }

  useEffect(() => {
    loadUserData();
    loadMatches();
    fetch(`/api/admin/users/${userId}/token-usage`).then(r => r.json()).then(setTokenUsage).catch(() => {});
  }, [userId]);

  // Navigate to another user's profile from match candidates
  if (viewingUserId !== null) {
    return <UserDetail userId={viewingUserId} onBack={() => setViewingUserId(null)} />;
  }

  if (loading) return <p style={s.loading}>Loading user details...</p>;
  if (error) return <p style={{ color: "red" }}>Error loading user: {error}</p>;
  if (!data) return null;

  const { user, profile, traits, lookTraits, coverage } = data;

  // Split traits into visible, internal-use, text (deal_breakers), and deal_breakers
  const visibleTraits = traits.filter((t: any) => t.calc_type !== "internal_use" && t.calc_type !== "text");
  const internalTraits = traits.filter((t: any) => t.calc_type === "internal_use");
  const dealBreakers = traits.find((t: any) => t.internal_name === "deal_breakers" || t.calc_type === "text");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button style={s.backBtn} onClick={onBack}>← Back to Users</button>
        <div style={{ display: "flex", gap: 8 }}>
          {onStartChat && !coverage?.profile_complete && user.is_real_user !== 0 && (
            <button
              style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4 }}
              onClick={() => onStartChat({ id: user.id, first_name: user.first_name, email: user.email })}
            >
              חזרה לשיחה
            </button>
          )}
          <button
            style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", background: "#dc3545", color: "#fff", border: "none", borderRadius: 4 }}
            onClick={handleDeleteUser}
          >
            Delete User
          </button>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>{user.first_name}</h3>
        <span style={{ ...s.badge, fontSize: 12 }}>#{user.id}</span>
        <span style={{ ...s.badge, fontSize: 12 }}>{user.gender}</span>
        <span style={{ ...s.badge, fontSize: 12 }}>age {user.age}</span>
        <span style={{ ...s.badge, fontSize: 12 }}>{user.city}</span>
        {!user.is_real_user && <span style={{ ...s.badge, background: "#e8daef", fontSize: 11 }}>seed user</span>}
      </div>
      <p style={{ ...s.sub, marginBottom: 8 }}>
        Status: <strong>{user.user_status}</strong> |
        Readiness: <strong>{coverage?.readiness_score != null ? `${Math.round(coverage.readiness_score * 100)}%` : "-"}</strong> |
        Matchable: <strong style={{ color: user.is_matchable ? "#28a745" : "#dc3545" }}>{user.is_matchable ? "Yes" : "No"}</strong> |
        Profile complete: <strong>{coverage?.profile_complete ? "Yes" : "No"}</strong> |
        Traits complete: <strong>{coverage ? `${coverage.met_count}/${coverage.total_count}` : "-"}</strong>
      </p>
      <p style={{ ...s.sub, marginBottom: 24 }}>
        Pickiness: <strong>{user.pickiness_score ?? "-"}</strong> | Attraction signal: <strong>{user.initial_attraction_signal ?? "-"}</strong> |
        Matches: <strong>{user.total_matches ?? 0}</strong> | Good matches: <strong>{user.good_matches ?? 0}</strong> |
        Waiting days: <strong>{user.waiting_days ?? 0}</strong> | System priority: <strong>{user.system_match_priority ?? "-"}</strong>
      </p>

      {/* Token Usage */}
      {tokenUsage && tokenUsage.total_tokens > 0 && (
        <div style={{ background: "#f8f9fa", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 12 }}>
          <strong>Token Usage:</strong>{" "}
          {tokenUsage.total_tokens.toLocaleString()} tokens ({tokenUsage.total_calls} calls) — ${tokenUsage.total_cost_usd.toFixed(4)}
          {tokenUsage.by_action.length > 0 && (
            <span style={{ color: "#888", marginLeft: 12 }}>
              {tokenUsage.by_action.map((a: any) => `${a.action_type}: ${a.total_tokens.toLocaleString()}`).join(" | ")}
            </span>
          )}
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>

        {/* Left column: Registration + Preferences + Chat */}
        <div style={{ minWidth: 280, maxWidth: 360 }}>

          {/* Registration Data */}
          <SectionHeading title="Registration Data" />
          <dl style={dlStyle}>
            <DlRow label="Email" value={user.email} />
            <DlRow label="Height" value={user.height ? `${user.height} cm` : "-"} />
            <DlRow label="Looking for" value={user.looking_for_gender || "-"} />
            <DlRow label="Style" value={Array.isArray(user.self_style) ? user.self_style.join(", ") : user.self_style || "-"} />
          </dl>

          {/* Preferences */}
          <SectionHeading title="Preferences" />
          <dl style={dlStyle}>
            <DlRow label="Age range" value={`${user.desired_age_min ?? "?"} – ${user.desired_age_max ?? "?"}`} />
            <DlRow label="Age flexibility" value={user.age_flexibility} />
            <DlRow label="Height range" value={`${user.desired_height_min ?? "?"} – ${user.desired_height_max ?? "?"} cm`} />
            <DlRow label="Height flexibility" value={user.height_flexibility} />
            <DlRow label="Location range" value={user.desired_location_range} />
          </dl>

          {/* Chat / AI Analysis */}
          {profile && (
            <>
              <SectionHeading title="Chat Answer" />
              <p style={{ fontSize: 12, lineHeight: 1.6, color: "#444", background: "#f8f9fa", padding: 10, borderRadius: 6, margin: "0 0 12px" }}>
                "{profile.raw_answer}"
              </p>
              <SectionHeading title="AI Analysis Summary" />
              <AnalysisSummary analysis={profile.analysis} serverCoverage={coverage} />
            </>
          )}
        </div>

        {/* Right column: Traits + Look Traits */}
        <div style={{ flex: 1, minWidth: 400 }}>

          {/* Personality Traits */}
          <SectionHeading title={`Personality Traits (${visibleTraits.length})`} />
          <p style={{ fontSize: 11, color: "#888", margin: "0 0 8px" }}>
            Effective = system_weight × user_weight × weight_confidence
          </p>
          {/* Analysis toolbar */}
          {profile && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <button
                style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4 }}
                onClick={handleReanalyze}
                disabled={reanalyzing || resetting}
              >
                {reanalyzing ? "Re-analyzing..." : "Re-analyze"}
              </button>
              <button
                style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#dc3545", color: "#fff", border: "none", borderRadius: 4 }}
                onClick={handleResetAnalysis}
                disabled={resetting || reanalyzing}
              >
                {resetting ? "Resetting..." : "Reset analysis"}
              </button>
              {traits.length === 0 && lookTraits.length === 0 && (
                <span style={{ fontSize: 12, color: "#856404", background: "#fff3cd", padding: "4px 10px", borderRadius: 4 }}>
                  No trait data — click Re-analyze to generate
                </span>
              )}
            </div>
          )}
          <table style={{ ...s.table, marginBottom: 24 }}>
            <thead>
              <tr>
                <th style={s.th}>Trait</th>
                <th style={s.th}>Group</th>
                <th style={s.th}>Score</th>
                <th style={{ ...s.th, width: 100 }}>Bar</th>
                <th style={s.th}>Conf.</th>
                <th style={s.th}>Sys W</th>
                <th style={s.th}>User W</th>
                <th style={s.th}>Effective</th>
              </tr>
            </thead>
            <tbody>
              {visibleTraits.map((t: any, i: number) => {
                const analyzed = t.score != null;
                return (
                  <tr key={i} style={analyzed ? {} : { opacity: 0.45 }}>
                    <td style={s.td}>
                      {t.display_name_he || t.internal_name}
                      <span style={{ color: "#aaa", fontSize: 10, marginLeft: 4 }}>{t.internal_name}</span>
                    </td>
                    <td style={s.td}><span style={{ ...s.badge, fontSize: 10 }}>{t.trait_group || "-"}</span></td>
                    <td style={s.td}>
                      {analyzed
                        ? <span style={{ ...s.badge, background: scoreColor(t.score) }}>{t.score}</span>
                        : <span style={{ color: "#bbb", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={s.td}>
                      {analyzed
                        ? <div style={{ background: "#eee", borderRadius: 3, height: 8, width: 80 }}><div style={{ background: barColor(t.score), borderRadius: 3, height: 8, width: `${t.score}%` }} /></div>
                        : null}
                    </td>
                    <td style={s.td}>{analyzed ? t.confidence?.toFixed(2) : <span style={{ color: "#bbb" }}>—</span>}</td>
                    <td style={s.td}>{t.default_weight}</td>
                    <td style={s.td}>{t.weight_for_match ?? <span style={{ color: "#bbb" }}>—</span>}</td>
                    <td style={s.td}><strong>{analyzed ? t.effective_weight : "—"}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Internal-use Traits */}
          {internalTraits.length > 0 && (
            <>
              <SectionHeading title={`Internal Traits (${internalTraits.length})`} />
              <table style={{ ...s.table, marginBottom: 24 }}>
                <thead>
                  <tr>
                    <th style={s.th}>Trait</th>
                    <th style={s.th}>Score</th>
                    <th style={s.th}>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {internalTraits.map((t: any, i: number) => (
                    <tr key={i}>
                      <td style={s.td}>
                        {t.display_name_en || t.internal_name}
                        <span style={{ color: "#aaa", fontSize: 10, marginLeft: 4 }}>{t.sensitivity}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: scoreColor(t.score) }}>{t.score}</span>
                      </td>
                      <td style={s.td}>{t.confidence?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Deal Breakers */}
          <SectionHeading title="Deal Breakers" />
          <div style={{ background: "#fafafa", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
            {dealBreakers?.score != null || dealBreakers?.source
              ? <span>{dealBreakers.score || "Analyzed — no specific deal breakers found"}</span>
              : <span style={{ color: "#999" }}>Not analyzed</span>}
          </div>

          {/* Look Traits */}
          <SectionHeading title={`Look Traits (${lookTraits.length})`} />
          <p style={{ fontSize: 11, color: "#888", margin: "0 0 8px" }}>
            Effective = weight × weight_confidence × value_confidence
          </p>
          <table style={{ ...s.table, marginBottom: 24 }}>
            <thead>
              <tr>
                <th style={s.th}>Trait</th>
                <th style={s.th}>Personal</th>
                <th style={s.th}>P. Conf.</th>
                <th style={s.th}>Desired</th>
                <th style={s.th}>D. Conf.</th>
                <th style={s.th}>Weight</th>
                <th style={s.th}>Effective</th>
              </tr>
            </thead>
            <tbody>
              {lookTraits.map((lt: any, i: number) => {
                const analyzed = lt.personal_value != null || lt.desired_value != null;
                return (
                  <tr key={i} style={analyzed ? {} : { opacity: 0.45 }}>
                    <td style={s.td}>
                      {lt.display_name_he || lt.internal_name}
                      <span style={{ color: "#aaa", fontSize: 10, marginLeft: 4 }}>{lt.internal_name}</span>
                    </td>
                    <td style={s.td}>{lt.personal_value ? <span style={s.badge}>{lt.personal_value}</span> : <span style={{ color: "#bbb" }}>—</span>}</td>
                    <td style={s.td}>{lt.personal_value_confidence != null ? lt.personal_value_confidence.toFixed(2) : <span style={{ color: "#bbb" }}>—</span>}</td>
                    <td style={s.td}>{lt.desired_value ? <span style={{ ...s.badge, background: "#d6eaff" }}>{lt.desired_value}</span> : <span style={{ color: "#bbb" }}>—</span>}</td>
                    <td style={s.td}>{lt.desired_value_confidence != null ? lt.desired_value_confidence.toFixed(2) : <span style={{ color: "#bbb" }}>—</span>}</td>
                    <td style={s.td}>{lt.default_weight}</td>
                    <td style={s.td}><strong>{analyzed ? lt.effective_weight : "—"}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matches */}
      <SectionHeading title={`Matches (${matches.length})`} />
      {matches.length > 0 ? (
        <table style={{ ...s.table, marginBottom: 24 }}>
          <thead>
            <tr>
              <th style={s.th}>Other User</th>
              <th style={s.th}>Match Status</th>
              <th style={s.th}>Score</th>
              <th style={s.th}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m: any) => {
              const msStyle = m.status === "pre_match" ? { ...s.badge, background: "#d4edda", color: "#155724" }
                : m.status === "in_match" ? { ...s.badge, background: "#cce5ff", color: "#004085" }
                : m.status === "frozen" ? { ...s.badge, background: "#e2e3e5", color: "#383d41" }
                : m.status === "cancelled" ? { ...s.badge, background: "#f8d7da", color: "#721c24" }
                : m.status === "rejected_by_users" ? { ...s.badge, background: "#f8d7da", color: "#721c24" }
                : m.status === "approved_by_both" ? { ...s.badge, background: "#d4edda", color: "#155724" }
                : s.badge;

              // Determine if this user should rate now
              const p1 = m.user1_pickiness ?? 0;
              const p2 = m.user2_pickiness ?? 0;
              const firstRaterId = p2 > p1 ? m.user2_id : m.user1_id;
              const secondRaterId = firstRaterId === m.user1_id ? m.user2_id : m.user1_id;

              const canRate =
                (m.status === "waiting_first_rating" && userId === firstRaterId) ||
                (m.status === "waiting_second_rating" && userId === secondRaterId);

              const isRating = ratingInProgress === m.id;

              return (
                <tr key={m.id}>
                  <td style={s.td}>
                    <button style={s.expandBtn} onClick={() => setViewingUserId(m.other_id)}>
                      {m.other_name}
                    </button>
                  </td>
                  <td style={s.td}><span style={msStyle}>{m.status}</span></td>
                  <td style={s.td}>{m.match_score != null ? <strong>{m.match_score}</strong> : "-"}</td>
                  <td style={s.td}>
                    {canRate ? (
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        {(["bullseye", "possible", "miss"] as const).map((r) => (
                          <button
                            key={r}
                            disabled={isRating}
                            onClick={() => submitRating(m.id, r)}
                            style={{
                              padding: "3px 8px", fontSize: 11, border: "none", borderRadius: 4, cursor: isRating ? "wait" : "pointer", fontWeight: 600,
                              background: r === "bullseye" ? "#28a745" : r === "possible" ? "#ffc107" : "#dc3545",
                              color: r === "possible" ? "#333" : "#fff",
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </span>
                    ) : (m.status === "pre_match" || m.status === "in_match") ? (
                      <button
                        disabled={cancelInProgress === m.id}
                        onClick={() => cancelMatch(m.id)}
                        style={{ padding: "3px 8px", fontSize: 11, border: "none", borderRadius: 4, cursor: cancelInProgress === m.id ? "wait" : "pointer", fontWeight: 600, background: "#dc3545", color: "#fff" }}
                      >
                        {cancelInProgress === m.id ? "..." : "Cancel Match"}
                      </button>
                    ) : (
                      <span style={{ color: "#aaa", fontSize: 11 }}>
                        {m.status === "waiting_first_rating" || m.status === "waiting_second_rating" ? "waiting for other side" : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p style={s.none}>No matches.</p>
      )}
    </div>
  );
}

// ── Shared small components ─────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return <h4 style={{ fontSize: 14, margin: "16px 0 8px", borderBottom: "1px solid #e5e5e5", paddingBottom: 4 }}>{title}</h4>;
}

function DlRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ fontWeight: 600, fontSize: 11, color: "#666", textTransform: "uppercase" }}>{label}</dt>
      <dd style={{ margin: "0 0 8px", fontSize: 13 }}>{value}</dd>
    </>
  );
}

const dlStyle: React.CSSProperties = { margin: "0 0 12px", lineHeight: 1.6 };

function traitStatus(confidence: number | null | undefined): { label: string; color: string } {
  if (confidence == null) return { label: "missing", color: "#dc3545" };
  if (confidence < 0.4) return { label: "weak", color: "#ffc107" };
  return { label: "filled", color: "#28a745" };
}

function AnalysisSummary({ analysis, serverCoverage }: { analysis: any; serverCoverage?: any }) {
  if (!analysis || typeof analysis !== "object") return <p style={{ fontSize: 12, color: "#888" }}>No analysis data.</p>;

  // Old-format analysis (flat fields like intelligence_score) — render as simple key/value
  if (!analysis.internal_traits && !analysis.external_traits) {
    return (
      <dl style={dlStyle}>
        {Object.entries(analysis).map(([k, v]) => (
          <DlRow key={k} label={k.replace(/_/g, " ")} value={typeof v === "object" ? JSON.stringify(v) : String(v ?? "-")} />
        ))}
      </dl>
    );
  }

  // New-format analysis — render structured sections
  const { internal_traits = [], external_traits = [], missing_traits = [] } = analysis;
  const tinyBadge = (text: string, bg: string): React.CSSProperties => ({
    display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: bg, color: "#fff", marginLeft: 4
  });

  return (
    <div style={{ fontSize: 12 }}>
      {/* Server-side profiling status (from computeCoverage, not LLM self-report) */}
      {serverCoverage && (
        <div style={{ background: "#f0f4ff", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
          <strong>Traits complete:</strong> {serverCoverage.met_count}/{serverCoverage.total_count}
          {" | "}<strong>Below threshold:</strong> {serverCoverage.below_count}
          {" | "}<strong>Missing:</strong> {serverCoverage.missing_count}
          {" | "}<strong>Readiness:</strong> {Math.round(serverCoverage.readiness_score * 100)}%
          {" | "}<strong>Profile complete:</strong> {serverCoverage.profile_complete ? "Yes" : "No"}
          {" | "}<strong>Ready for match:</strong>{" "}
          <span style={{ color: serverCoverage.ready_for_matching ? "#28a745" : "#dc3545", fontWeight: 600 }}>
            {serverCoverage.ready_for_matching ? "Yes" : "No"}
          </span>
          {serverCoverage.unmet_traits?.length > 0 && (
            <div style={{ color: "#888", marginTop: 4, fontSize: 11 }}>
              Unmet: {serverCoverage.unmet_traits.slice(0, 10).join(", ")}{serverCoverage.unmet_traits.length > 10 ? "..." : ""}
            </div>
          )}
        </div>
      )}

      {/* Internal traits summary */}
      {internal_traits.length > 0 && (
        <>
          <strong>Assessed Internal Traits ({internal_traits.length}):</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>Trait</th>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>Score</th>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>Conf.</th>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {internal_traits.map((t: any, i: number) => {
                const st = traitStatus(t.confidence);
                return (
                  <tr key={i}>
                    <td style={{ padding: "2px 6px" }}>{t.internal_name}</td>
                    <td style={{ padding: "2px 6px" }}>{t.score}</td>
                    <td style={{ padding: "2px 6px" }}>{t.confidence?.toFixed(2) ?? "-"}</td>
                    <td style={{ padding: "2px 6px" }}><span style={tinyBadge(st.label, st.color)}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* External traits summary */}
      {external_traits.length > 0 && (
        <>
          <strong>Assessed External Traits ({external_traits.length}):</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>Trait</th>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>Personal</th>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>P.Conf</th>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>Desired</th>
                <th style={{ textAlign: "left", fontSize: 10, color: "#888", padding: "2px 6px" }}>D.Conf</th>
              </tr>
            </thead>
            <tbody>
              {external_traits.map((t: any, i: number) => (
                <tr key={i}>
                  <td style={{ padding: "2px 6px" }}>{t.internal_name}</td>
                  <td style={{ padding: "2px 6px" }}>{t.personal_value ?? <span style={{ color: "#aaa" }}>-</span>}</td>
                  <td style={{ padding: "2px 6px" }}>{t.personal_value_confidence?.toFixed(2) ?? <span style={{ color: "#aaa" }}>-</span>}</td>
                  <td style={{ padding: "2px 6px" }}>{t.desired_value ?? <span style={{ color: "#aaa" }}>-</span>}</td>
                  <td style={{ padding: "2px 6px" }}>{t.desired_value_confidence?.toFixed(2) ?? <span style={{ color: "#aaa" }}>-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Missing traits */}
      {missing_traits.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <strong>Missing Traits ({missing_traits.length}):</strong>
          <div style={{ color: "#888", marginTop: 2, lineHeight: 1.8 }}>
            {missing_traits.map((name: string, i: number) => (
              <span key={i} style={{ display: "inline-block", padding: "1px 8px", margin: "2px 3px", borderRadius: 3, background: "#f8d7da", fontSize: 11 }}>{name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return "#d4edda";
  if (score >= 40) return "#fff3cd";
  return "#f8d7da";
}

function barColor(score: number): string {
  if (score >= 70) return "#28a745";
  if (score >= 40) return "#ffc107";
  return "#dc3545";
}

// ── Trait Definitions Tab ────────────────────────────────────────

function TraitDefsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<number, any>>({});
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/trait-definitions")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(t: any) {
    setEditing((prev) => ({ ...prev, [t.id]: { weight: t.weight, is_filter: t.is_filter || "no", filter_type: t.filter_type || "", min_value: t.min_value ?? "", max_value: t.max_value ?? "" } }));
  }

  function updateField(id: number, field: string, value: string) {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveRow(id: number) {
    const e = editing[id];
    await fetch(`/api/admin/trait-definitions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weight: Number(e.weight),
        is_filter: e.is_filter,
        filter_type: e.filter_type || null,
        min_value: e.min_value !== "" ? Number(e.min_value) : null,
        max_value: e.max_value !== "" ? Number(e.max_value) : null,
      }),
    });
    setData((prev) => prev.map((t) => t.id === id ? { ...t, weight: Number(e.weight), is_filter: e.is_filter, filter_type: e.filter_type || null, min_value: e.min_value !== "" ? Number(e.min_value) : null, max_value: e.max_value !== "" ? Number(e.max_value) : null } : t));
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setSaved(id);
    setTimeout(() => setSaved(null), 1500);
  }

  if (loading) return <p style={s.loading}>Loading...</p>;

  return (
    <div style={s.scrollWrap}>
      <p style={s.sub}>{data.length} trait definitions</p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>#</th>
            <th style={s.th}>Internal Name</th>
            <th style={s.th}>Hebrew</th>
            <th style={s.th}>Group</th>
            <th style={s.th}>Weight</th>
            <th style={s.th}>Req. Conf.</th>
            <th style={s.th}>Calc Type</th>
            <th style={s.th}>AI Guidance</th>
            <th style={s.th}>Active</th>
            <th style={s.th}>Edit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => {
            const e = editing[t.id];
            return (
              <tr key={t.id}>
                <td style={s.td}>{t.sort_order}</td>
                <td style={s.td}><code style={s.badge}>{t.internal_name}</code></td>
                <td style={s.td}>{t.display_name_he || t.display_name_en}</td>
                <td style={s.td}><span style={s.badge}>{t.trait_group || "-"}</span></td>
                <td style={s.td}>
                  {e ? <input style={s.configInput} value={e.weight} onChange={(ev) => updateField(t.id, "weight", ev.target.value)} /> : <strong>{t.weight}</strong>}
                </td>
                <td style={s.td}>{t.required_confidence ?? "-"}</td>
                <td style={s.td}><span style={s.badge}>{t.calc_type}</span></td>
                <td style={{ ...s.td, maxWidth: 200, fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.ai_description || ""}>
                  {t.ai_description ? t.ai_description.slice(0, 60) + (t.ai_description.length > 60 ? "..." : "") : "-"}
                </td>
                <td style={s.td}>{t.is_active ? "Yes" : "No"}</td>
                <td style={s.td}>
                  {e ? (
                    <>
                      <button style={s.configSave} onClick={() => saveRow(t.id)}>Save</button>
                      <button style={{ ...s.configSave, background: "#888", marginLeft: 2 }} onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[t.id]; return n; })}>X</button>
                    </>
                  ) : saved === t.id ? (
                    <span style={{ color: "green", fontSize: 12 }}>Saved</span>
                  ) : (
                    <button style={s.expandBtn} onClick={() => startEdit(t)}>Edit</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Look Trait Definitions Tab ───────────────────────────────────

function LookTraitDefsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<number, any>>({});
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/look-trait-definitions")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(t: any) {
    setEditing((prev) => ({ ...prev, [t.id]: { weight: t.weight, is_filter: t.is_filter || "no", filter_type: t.filter_type || "", min_value: t.min_value ?? "", max_value: t.max_value ?? "" } }));
  }

  function updateField(id: number, field: string, value: string) {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveRow(id: number) {
    const e = editing[id];
    await fetch(`/api/admin/look-trait-definitions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weight: Number(e.weight),
        is_filter: e.is_filter,
        filter_type: e.filter_type || null,
        min_value: e.min_value !== "" ? Number(e.min_value) : null,
        max_value: e.max_value !== "" ? Number(e.max_value) : null,
      }),
    });
    setData((prev) => prev.map((t) => t.id === id ? { ...t, weight: Number(e.weight), is_filter: e.is_filter, filter_type: e.filter_type || null, min_value: e.min_value !== "" ? Number(e.min_value) : null, max_value: e.max_value !== "" ? Number(e.max_value) : null } : t));
    setEditing((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setSaved(id);
    setTimeout(() => setSaved(null), 1500);
  }

  if (loading) return <p style={s.loading}>Loading...</p>;

  return (
    <div style={s.scrollWrap}>
      <p style={s.sub}>{data.length} look trait definitions</p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>#</th>
            <th style={s.th}>Internal Name</th>
            <th style={s.th}>English</th>
            <th style={s.th}>Source</th>
            <th style={s.th}>Weight</th>
            <th style={s.th}>Is Filter</th>
            <th style={s.th}>Filter Type</th>
            <th style={s.th}>Min</th>
            <th style={s.th}>Max</th>
            <th style={s.th}>Values</th>
            <th style={s.th}>Edit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => {
            const e = editing[t.id];
            return (
              <tr key={t.id}>
                <td style={s.td}>{t.sort_order}</td>
                <td style={s.td}><code style={s.badge}>{t.internal_name}</code></td>
                <td style={s.td}>{t.display_name_en || t.display_name_he}</td>
                <td style={s.td}><span style={s.badge}>{t.source}</span></td>
                <td style={s.td}>
                  {e ? <input style={s.configInput} value={e.weight} onChange={(ev) => updateField(t.id, "weight", ev.target.value)} /> : <strong>{t.weight}</strong>}
                </td>
                <td style={s.td}>
                  {e ? (
                    <select style={s.configInput} value={e.is_filter} onChange={(ev) => updateField(t.id, "is_filter", ev.target.value)}>
                      <option value="no">no</option>
                      <option value="yes">yes</option>
                      <option value="user_defined">user_defined</option>
                    </select>
                  ) : <span style={s.badge}>{t.is_filter || "no"}</span>}
                </td>
                <td style={s.td}>
                  {e ? (
                    <select style={s.configInput} value={e.filter_type} onChange={(ev) => updateField(t.id, "filter_type", ev.target.value)}>
                      <option value="">—</option>
                      <option value="range">range</option>
                      <option value="fixed">fixed</option>
                    </select>
                  ) : <span style={s.badge}>{t.filter_type || "-"}</span>}
                </td>
                <td style={s.td}>
                  {e ? <input style={{ ...s.configInput, width: 60 }} value={e.min_value} onChange={(ev) => updateField(t.id, "min_value", ev.target.value)} /> : (t.min_value ?? "-")}
                </td>
                <td style={s.td}>
                  {e ? <input style={{ ...s.configInput, width: 60 }} value={e.max_value} onChange={(ev) => updateField(t.id, "max_value", ev.target.value)} /> : (t.max_value ?? "-")}
                </td>
                <td style={s.td}>{t.possible_values ? JSON.parse(t.possible_values).join(", ") : "-"}</td>
                <td style={s.td}>
                  {e ? (
                    <>
                      <button style={s.configSave} onClick={() => saveRow(t.id)}>Save</button>
                      <button style={{ ...s.configSave, background: "#888", marginLeft: 2 }} onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[t.id]; return n; })}>X</button>
                    </>
                  ) : saved === t.id ? (
                    <span style={{ color: "green", fontSize: 12 }}>Saved</span>
                  ) : (
                    <button style={s.expandBtn} onClick={() => startEdit(t)}>Edit</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Enum Options Tab ─────────────────────────────────────────────

function EnumsTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/enum-options")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={s.loading}>Loading...</p>;

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const item of data) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return (
    <div>
      <p style={s.sub}>{data.length} options across {Object.keys(grouped).length} categories</p>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 14, margin: "0 0 8px" }}>
            <code style={s.badge}>{cat}</code> ({items.length})
          </h4>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Value</th>
                <th style={s.th}>Hebrew</th>
                <th style={s.th}>English</th>
                <th style={s.th}>Order</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td style={s.td}><code style={s.badge}>{item.value}</code></td>
                  <td style={s.td}>{item.label_he}</td>
                  <td style={s.td}>{item.label_en || "-"}</td>
                  <td style={s.td}>{item.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Config Tab (editable) ────────────────────────────────────────

function ConfigTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function saveConfig(key: string) {
    const value = editing[key];
    if (value === undefined) return;

    await fetch(`/api/admin/config/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });

    // Update local state
    setData((prev) => prev.map((c) => (c.key === key ? { ...c, value } : c)));
    setEditing((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setSaved(key);
    setTimeout(() => setSaved(null), 1500);
  }

  if (loading) return <p style={s.loading}>Loading...</p>;

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const item of data) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return (
    <div>
      <p style={s.sub}>{data.length} config keys</p>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 14, margin: "0 0 8px" }}>
            <code style={s.badge}>{cat}</code>
          </h4>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Key</th>
                <th style={s.th}>Value</th>
                <th style={s.th}>Description</th>
                <th style={s.th}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c: any) => (
                <tr key={c.key}>
                  <td style={s.td}><code style={s.badge}>{c.key}</code></td>
                  <td style={s.td}>
                    <input
                      style={s.configInput}
                      value={editing[c.key] !== undefined ? editing[c.key] : c.value}
                      onChange={(e) => setEditing((prev) => ({ ...prev, [c.key]: e.target.value }))}
                    />
                  </td>
                  <td style={s.td}>{c.description || "-"}</td>
                  <td style={s.td}>
                    {editing[c.key] !== undefined && editing[c.key] !== c.value ? (
                      <button style={s.configSave} onClick={() => saveConfig(c.key)}>Save</button>
                    ) : saved === c.key ? (
                      <span style={{ color: "green", fontSize: 12 }}>Saved</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Matches Tab ──────────────────────────────────────────────────

function MatchesTab() {
  const [allData, setAllData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/admin/matches")
      .then((r) => r.json())
      .then(setAllData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Show only active matches: pre_match and in_match
  const data = allData.filter((m: any) => m.status === "pre_match" || m.status === "in_match");

  const statusColor = (status: string) => {
    if (status === "pre_match") return { ...s.badge, background: "#d4edda", color: "#155724" };
    if (status === "in_match") return { ...s.badge, background: "#cce5ff", color: "#004085" };
    if (status === "rejected_by_users" || status === "cancelled") return { ...s.badge, background: "#f8d7da", color: "#721c24" };
    return s.badge;
  };

  if (loading) return <p style={s.loading}>Loading...</p>;

  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <p style={{ color: "#888", fontSize: 14 }}>No active matches yet.</p>
        <p style={{ color: "#aaa", fontSize: 12 }}>Run the matchmaking algorithm from the Candidate Matches tab to generate matches.</p>
      </div>
    );
  }

  return (
    <div style={s.scrollWrap}>
      <p style={s.sub}>{data.length} active matches</p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>ID</th>
            <th style={s.th}>User 1</th>
            <th style={s.th}>User 2</th>
            <th style={s.th}>Score</th>
            <th style={s.th}>Status</th>
            <th style={s.th}>Pair Priority</th>
            <th style={s.th}>Final Priority</th>
            <th style={s.th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m: any) => (
            <tr key={m.id}>
              <td style={s.td}>{m.id}</td>
              <td style={s.td}>{m.user1_name} (#{m.user1_id})</td>
              <td style={s.td}>{m.user2_name} (#{m.user2_id})</td>
              <td style={s.td}><strong>{m.match_score ?? "-"}</strong></td>
              <td style={s.td}><span style={statusColor(m.status)}>{m.status}</span></td>
              <td style={s.td}>{m.pair_priority != null ? m.pair_priority : "-"}</td>
              <td style={s.td}>{m.final_match_priority != null ? <strong>{m.final_match_priority}</strong> : "-"}</td>
              <td style={s.td}>{m.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Candidate Matches Tab ───────────────────────────────────────

function CandidateMatchesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/admin/candidate-matches")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Run Algorithm = filter + score + promote to rating flow.
  // Does NOT select pre_match or freeze.
  async function runAlgorithm() {
    setRunning("algorithm");
    setResult(null);
    try {
      const r = await fetch("/api/admin/run-matching", { method: "POST" });
      const json = await r.json();
      setResult(json);
      load();
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setRunning(null);
    }
  }

  // Run Matchmaking = prioritize + select + freeze on existing approved matches.
  // Does NOT regenerate candidates or re-score.
  async function runMatchmaking() {
    setRunning("matchmaking");
    setResult(null);
    try {
      const r = await fetch("/api/admin/run-matchmaking", { method: "POST" });
      const json = await r.json();
      setResult(json);
      load();
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setRunning(null);
    }
  }

  async function resetMatches() {
    setRunning("reset");
    setResult(null);
    try {
      const r = await fetch("/api/admin/reset-matches", { method: "POST" });
      const json = await r.json();
      setResult({ reset: true, ...json });
      load();
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setRunning(null);
    }
  }

  async function approveAllRatings() {
    setRunning("approve");
    setResult(null);
    try {
      const r = await fetch("/api/admin/approve-all-ratings", { method: "POST" });
      const json = await r.json();
      setResult({ approve_action: true, ...json });
      load();
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setRunning(null);
    }
  }

  const matchStatusColor = (status: string | null) => {
    if (status === "pre_match") return { ...s.badge, background: "#d4edda", color: "#155724" };
    if (status === "in_match") return { ...s.badge, background: "#cce5ff", color: "#004085" };
    if (status === "frozen") return { ...s.badge, background: "#e2e3e5", color: "#383d41" };
    if (status === "approved_by_both") return { ...s.badge, background: "#fff3cd", color: "#856404" };
    if (status === "rejected_by_users" || status === "cancelled") return { ...s.badge, background: "#f8d7da", color: "#721c24" };
    return s.badge;
  };

  if (selectedUserId !== null) {
    return <UserDetail userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          onClick={runAlgorithm}
          disabled={running !== null}
          style={{ padding: "8px 16px", fontSize: 14, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, cursor: running ? "wait" : "pointer", fontWeight: 600 }}
        >
          {running === "algorithm" ? "Running..." : "Run Algorithm"}
        </button>
        <button
          onClick={runMatchmaking}
          disabled={running !== null}
          style={{ padding: "8px 16px", fontSize: 14, background: "#28a745", color: "#fff", border: "none", borderRadius: 6, cursor: running ? "wait" : "pointer", fontWeight: 600 }}
        >
          {running === "matchmaking" ? "Running..." : "Run Matchmaking"}
        </button>
        <button
          onClick={approveAllRatings}
          disabled={running !== null}
          style={{ padding: "8px 16px", fontSize: 14, background: "#6f42c1", color: "#fff", border: "none", borderRadius: 6, cursor: running ? "wait" : "pointer", fontWeight: 600 }}
        >
          {running === "approve" ? "Approving..." : "Approve All Ratings"}
        </button>
        <button
          onClick={resetMatches}
          disabled={running !== null}
          style={{ padding: "8px 16px", fontSize: 14, background: "#dc3545", color: "#fff", border: "none", borderRadius: 6, cursor: running ? "wait" : "pointer", fontWeight: 600 }}
        >
          {running === "reset" ? "Clearing..." : "Reset All"}
        </button>
        {result && !result.error && result.stage1 && (
          <span style={{ fontSize: 13, color: "#28a745" }}>
            {result.stage1.users} eligible, {result.stage1.pairs} filtered, {result.stage2.scored} scored,{" "}
            {result.stage2.promoted_to_matches ?? 0} new matches
          </span>
        )}
        {result && !result.error && result.selection && (
          <span style={{ fontSize: 13, color: "#28a745" }}>
            {result.selection.promoted} promoted to pre-match, {result.selection.frozen} frozen
          </span>
        )}
        {result && !result.error && result.approve_action && (
          <span style={{ fontSize: 13, color: "#6f42c1" }}>
            {result.approved ?? 0} matches approved
          </span>
        )}
        {result && !result.error && result.reset && (
          <span style={{ fontSize: 13, color: "#888" }}>
            {result.deleted_candidates ?? 0} candidates + {result.deleted_matches ?? 0} matches cleared
          </span>
        )}
        {result?.error && (
          <span style={{ fontSize: 13, color: "red" }}>Error: {result.error}</span>
        )}
      </div>

      {loading ? (
        <p style={s.loading}>Loading...</p>
      ) : data.length === 0 ? (
        <p style={s.none}>No candidate matches yet. Run the algorithm to generate them.</p>
      ) : (
        <div style={s.scrollWrap}>
          <p style={s.sub}>{data.length} candidate pairs</p>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>User</th>
                <th style={s.th}>Candidate</th>
                <th style={s.th}>Score</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Shared Priority</th>
                <th style={s.th}>Match Priority</th>
                <th style={s.th}>Internal</th>
                <th style={s.th}>External</th>
              </tr>
            </thead>
            <tbody>
              {data.map((cm: any) => (
                <tr key={cm.id}>
                  <td style={s.td}><button style={s.expandBtn} onClick={() => setSelectedUserId(cm.user_id)}>{cm.user1_name}</button> ({cm.user1_age}, {cm.user1_city})</td>
                  <td style={s.td}><button style={s.expandBtn} onClick={() => setSelectedUserId(cm.candidate_user_id)}>{cm.user2_name}</button> ({cm.user2_age}, {cm.user2_city})</td>
                  <td style={s.td}>{cm.final_score != null ? <strong style={{ color: cm.final_score >= 70 ? "#28a745" : cm.final_score >= 50 ? "#856404" : "#dc3545" }}>{cm.final_score}</strong> : "-"}</td>
                  <td style={s.td}>{cm.match_status ? <span style={matchStatusColor(cm.match_status)}>{cm.match_status}</span> : <span style={s.badge}>{cm.status}</span>}</td>
                  <td style={s.td}>{cm.pair_priority != null ? cm.pair_priority : "-"}</td>
                  <td style={s.td}>{cm.final_match_priority != null ? <strong>{cm.final_match_priority}</strong> : "-"}</td>
                  <td style={s.td}>{cm.internal_score ?? "-"}</td>
                  <td style={s.td}>{cm.external_score ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
