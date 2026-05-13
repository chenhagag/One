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

type Tab = "overview" | "users" | "profiles" | "traits" | "look_traits" | "enums" | "config" | "matches" | "candidates" | "bugs";

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

export default function AdminView({ onBack, onStartChat, onViewDashboard, onViewNewChat }: { onBack: () => void; onStartChat?: (user: { id: number; first_name: string; email: string }) => void; onViewDashboard?: (user: { id: number; first_name: string; email: string }) => void; onViewNewChat?: (user: { id: number; first_name: string; email: string }) => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div>
      <button style={s.backBtn} onClick={onBack}>← Back</button>
      <h2 style={s.heading}>Admin Panel</h2>

      <div style={s.tabs}>
        {([
          ["overview", "Overview"],
          ["users", "Users"],
          ["profiles", "User Profiles"],
          ["traits", "Trait Defs"],
          ["look_traits", "Look Trait Defs"],
          ["enums", "Enum Options"],
          ["config", "Config"],
          ["candidates", "Candidate Matches"],
          ["matches", "Matched"],
          ["bugs", "Bug Reports"],
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
      {tab === "users" && <UsersTab onStartChat={onStartChat} onViewDashboard={onViewDashboard} onViewNewChat={onViewNewChat} />}
      {tab === "profiles" && <UserProfilesTab />}
      {tab === "traits" && <TraitDefsTab />}
      {tab === "look_traits" && <LookTraitDefsTab />}
      {tab === "enums" && <EnumsTab />}
      {tab === "config" && <ConfigTab />}
      {tab === "matches" && <MatchesTab />}
      {tab === "candidates" && <CandidateMatchesTab />}
      {tab === "bugs" && <BugReportsTab />}
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

function UsersTab({ onStartChat, onViewDashboard, onViewNewChat }: { onStartChat?: (user: { id: number; first_name: string; email: string }) => void; onViewDashboard?: (user: { id: number; first_name: string; email: string }) => void; onViewNewChat?: (user: { id: number; first_name: string; email: string }) => void }) {
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
    return <UserDetail userId={selectedUserId} onBack={() => setSelectedUserId(null)} onStartChat={onStartChat} onViewDashboard={onViewDashboard} onViewNewChat={onViewNewChat} />;
  }

  // Split users into flagged sections
  const flaggedToxic = users.filter((u: any) => u.flag_toxic);
  const flaggedTroll = users.filter((u: any) => u.flag_troll && !u.flag_toxic);
  const flaggedIdentity = users.filter((u: any) => u.flag_identity && !u.flag_toxic && !u.flag_troll);
  const unflagged = users.filter((u: any) => !u.flag_toxic && !u.flag_troll && !u.flag_identity);

  const userHeaders = (
    <tr>
      <th style={s.th}>ID</th>
      <th style={s.th}>Name</th>
      <th style={s.th}>Email</th>
      <th style={s.th}>Age</th>
      <th style={s.th}>Gender</th>
      <th style={s.th}>Status</th>
      <th style={s.th}>Matchable</th>
      <th style={s.th}>Test Type</th>
      <th style={s.th}>Flags</th>
      <th style={s.th}>Total Cost</th>
      <th style={s.th}>Conversation</th>
      <th style={s.th}>Analysis</th>
    </tr>
  );

  function UserRow({ u }: { u: any }) {
    const flags: string[] = [];
    if (u.flag_toxic) flags.push("TOXIC");
    if (u.flag_troll) flags.push("TROLL");
    if (u.flag_identity) flags.push("IDENTITY");
    return (
      <tr
        key={u.id}
        onClick={() => setSelectedUserId(u.id)}
        style={{ cursor: "pointer", background: u.user_status === "frozen" ? "#fff0f0" : "" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f4ff")}
        onMouseLeave={(e) => (e.currentTarget.style.background = u.user_status === "frozen" ? "#fff0f0" : "")}
      >
        <td style={s.td}>{u.id}</td>
        <td style={s.td}><strong>{u.first_name}</strong></td>
        <td style={s.td}>{u.email}</td>
        <td style={s.td}>{u.age || "-"}</td>
        <td style={s.td}><span style={s.badge}>{u.gender || "-"}</span></td>
        <td style={s.td}><span style={{ ...s.badge, background: u.user_status === "frozen" ? "#f8d7da" : "" }}>{u.user_status || "-"}</span></td>
        <td style={s.td}>{u.is_matchable ? "Yes" : "No"}</td>
        <td style={s.td}><span style={{ ...s.badge, fontSize: 10, background: u.test_user_type === "Couple Tester" ? "#d4edda" : u.test_user_type ? "#cfe2ff" : "" }}>{u.test_user_type || "-"}</span></td>
        <td style={s.td}>
          {flags.map(f => (
            <span key={f} style={{
              display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, marginRight: 3,
              background: f === "TOXIC" ? "#dc3545" : f === "TROLL" ? "#fd7e14" : "#6f42c1",
              color: "#fff",
            }}>{f}</span>
          ))}
          {flags.length === 0 && "-"}
        </td>
        <td style={s.td}>{u.total_cost_usd > 0 ? `$${Number(u.total_cost_usd).toFixed(4)}` : "-"}</td>
        <td style={s.td}>{u.conversation_cost_usd > 0 ? `$${Number(u.conversation_cost_usd).toFixed(4)}` : "-"}</td>
        <td style={s.td}>{u.analysis_cost_usd > 0 ? `$${Number(u.analysis_cost_usd).toFixed(4)}` : "-"}</td>
      </tr>
    );
  }

  function FlaggedSection({ title, color, list }: { title: string; color: string; list: any[] }) {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color }} />
          <strong style={{ fontSize: 13 }}>{title} ({list.length})</strong>
        </div>
        <table style={s.table}>
          <thead>{userHeaders}</thead>
          <tbody>{list.map(u => <UserRow key={u.id} u={u} />)}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={s.scrollWrap}>
      <p style={s.sub}>
        {users.length} users — click a row to view full profile
        <span style={{ marginLeft: 16, fontWeight: 600 }}>
          Flagged: {flaggedToxic.length + flaggedTroll.length + flaggedIdentity.length} | Frozen: {users.filter((u: any) => u.user_status === "frozen").length}
        </span>
      </p>

      {/* Flagged sections at top */}
      <FlaggedSection title="Users flagged as toxic" color="#dc3545" list={flaggedToxic} />
      <FlaggedSection title="Users flagged as troll" color="#fd7e14" list={flaggedTroll} />
      <FlaggedSection title="Users flagged for declared identity variation" color="#6f42c1" list={flaggedIdentity} />

      {/* All remaining users */}
      <table style={s.table}>
        <thead>{userHeaders}</thead>
        <tbody>{unflagged.map(u => <UserRow key={u.id} u={u} />)}</tbody>
      </table>
    </div>
  );
}

// ── User Detail View ────────────────────────────────────────────

// Cache cognitive test results per user so they persist when navigating in/out
const cognitiveTestCache = new Map<number, string>();

function UserDetail({ userId, onBack, onStartChat, onViewDashboard, onViewNewChat }: { userId: number; onBack: () => void; onStartChat?: (user: { id: number; first_name: string; email: string }) => void; onViewDashboard?: (user: { id: number; first_name: string; email: string }) => void; onViewNewChat?: (user: { id: number; first_name: string; email: string }) => void }) {
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
  const [transcript, setTranscript] = useState<any>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptTab, setTranscriptTab] = useState<string>("all");
  const [copied, setCopied] = useState<string | false>(false);
  const [analysisRun, setAnalysisRun] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showCognitivePrompt, setShowCognitivePrompt] = useState(false);
  const [showCognitiveOutput, setShowCognitiveOutput] = useState(false);
  const [showStageA, setShowStageA] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [cognitiveTestOutput, setCognitiveTestOutput] = useState<string | null>(cognitiveTestCache.get(userId) ?? null);
  const [showCognitiveTest, setShowCognitiveTest] = useState(false);
  const [runningCognitiveTest, setRunningCognitiveTest] = useState(false);
  const [showEvidenceScores, setShowEvidenceScores] = useState(false);
  const [runningGroup, setRunningGroup] = useState<string | null>(null);
  const [lookTraitEdits, setLookTraitEdits] = useState<Record<number, string>>({});
  const [savingLookTraits, setSavingLookTraits] = useState(false);
  const [lookTraitsSaved, setLookTraitsSaved] = useState(false);

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
      fetch(`/api/admin/users/${userId}/analysis-run`).then(r => r.json()).then(setAnalysisRun).catch(() => {});
    } catch { alert("Network error"); }
    finally { setReanalyzing(false); }
  }

  async function handleCognitiveTest() {
    setRunningCognitiveTest(true);
    setCognitiveTestOutput(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}/cognitive-test`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) { alert(json.error || "Cognitive test failed"); return; }
      setCognitiveTestOutput(json.output);
      cognitiveTestCache.set(userId, json.output);
      setShowCognitiveTest(true);
    } catch { alert("Network error"); }
    finally { setRunningCognitiveTest(false); }
  }

  async function handleGroupReanalyze(groupKey: string) {
    setRunningGroup(groupKey);
    try {
      const r = await fetch(`/api/admin/users/${userId}/reanalyze-group`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: groupKey }),
      });
      const json = await r.json();
      if (!r.ok) { alert(json.error || "Group analysis failed"); return; }
      alert(`${groupKey}: ${json.internal_saved} internal + ${json.external_saved} external traits saved`);
      loadUserData();
    } catch { alert("Network error"); }
    finally { setRunningGroup(null); }
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
    fetch(`/api/admin/users/${userId}/full-transcript`).then(r => r.json()).then(setTranscript).catch(() => {});
    fetch(`/api/admin/users/${userId}/analysis-run`).then(r => r.json()).then(setAnalysisRun).catch(() => {});
  }, [userId]);

  // Navigate to another user's profile from match candidates
  if (viewingUserId !== null) {
    return <UserDetail userId={viewingUserId} onBack={() => setViewingUserId(null)} />;
  }

  if (loading) return <p style={s.loading}>Loading user details...</p>;
  if (error) return <p style={{ color: "red" }}>Error loading user: {error}</p>;
  if (!data) return null;

  const { user, profile, traits, lookTraits, coverage } = data;

  // Manual look traits: traits with source "manual" that accept numeric 1-100
  const manualLookTraitNames = new Set([
    "appeal", "warmth_visual", "femininity_masculinity", "glamour",
    "naturalness", "fitness_aesthetic", "style_polish", "skin_tone_range",
  ]);
  const manualLookTraits = lookTraits.filter((lt: any) => manualLookTraitNames.has(lt.internal_name));
  const otherLookTraits = lookTraits.filter((lt: any) => !manualLookTraitNames.has(lt.internal_name));

  function getLookTraitEditValue(lt: any): string {
    if (lookTraitEdits[lt.look_trait_definition_id] !== undefined)
      return lookTraitEdits[lt.look_trait_definition_id];
    return lt.personal_value ?? "";
  }

  function setLookTraitEdit(lt: any, value: string) {
    setLookTraitEdits(prev => ({ ...prev, [lt.look_trait_definition_id]: value }));
    setLookTraitsSaved(false);
  }

  async function saveLookTraits() {
    setSavingLookTraits(true);
    const traitsToSave = manualLookTraits.map((lt: any) => {
      const val = lookTraitEdits[lt.look_trait_definition_id] !== undefined
        ? lookTraitEdits[lt.look_trait_definition_id]
        : (lt.personal_value ?? "");
      return {
        look_trait_definition_id: lt.look_trait_definition_id,
        personal_value: val === "" ? null : val,
      };
    });
    try {
      await fetch(`/api/admin/users/${userId}/look-traits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traits: traitsToSave }),
      });
      setLookTraitsSaved(true);
      loadUserData();
    } catch { alert("Save failed"); }
    finally { setSavingLookTraits(false); }
  }

  // Split traits into visible, internal-use, text (deal_breakers), and deal_breakers
  const visibleTraits = traits.filter((t: any) => t.calc_type !== "internal_use" && t.calc_type !== "text" && t.internal_name !== "trans");
  const internalTraits = traits.filter((t: any) => t.calc_type === "internal_use");
  const dealBreakers = traits.find((t: any) => t.internal_name === "deal_breakers");
  const advantages = traits.find((t: any) => t.internal_name === "advantages");
  const specialInfo = traits.find((t: any) => t.internal_name === "special_info");

  // ── Computed profiles (confidence-weighted averages) ──────────
  function traitData(name: string): { score: number; confidence: number } | null {
    const t = traits.find((t: any) => t.internal_name === name);
    if (t?.score == null || t?.confidence == null) return null;
    return { score: t.score, confidence: t.confidence };
  }

  function weightedAvg(names: string[]): { score: number; count: number; total: number } | null {
    const items = names.map(traitData).filter((d): d is { score: number; confidence: number } => d != null);
    if (items.length === 0) return null;
    const sumWeighted = items.reduce((s, d) => s + d.score * d.confidence, 0);
    const sumConf = items.reduce((s, d) => s + d.confidence, 0);
    if (sumConf === 0) return null;
    return { score: Math.round(sumWeighted / sumConf), count: items.length, total: names.length };
  }

  // פרופיל קוגניטיבי — מחושב ב-cognitiveScore.ts ונשמר ב-users.cognitive_score
  // תכונות: analytical_reasoning (x3), abstract_thinking, cognitive_flexibility,
  // conceptual_precision, verbal_articulation, verbal_reasoning,
  // depth_of_thought, intellectualism, career_prestige, eq
  function computeCognitiveProfile() {
    if (user.cognitive_score != null) return { score: Math.round(user.cognitive_score), count: 1, total: 1 };
    return null;
  }

  // תכונות: social_intuitive_intelligence, eq, self_awareness, positivity, warmth
  function computeEmotionalSocialIntelligence() {
    return weightedAvg([
      "social_intuitive_intelligence", "eq", "self_awareness", "positivity", "warmth",
    ]);
  }

  // תכונות: neuroticism, emotional_intensity, emotional_expressiveness
  function computeEmotionality() {
    return weightedAvg([
      "neuroticism", "emotional_intensity", "emotional_expressiveness",
    ]);
  }

  // Evidence-based cognitive profile from cognitive test output
  type EvidenceTraitScore = { score: number; confidence: number; positiveCount: number; negativeCount: number };
  type EvidenceProfile = { overallScore: number; traits: Record<string, EvidenceTraitScore> };

  function computeEvidenceBasedProfile(): EvidenceProfile | null {

    if (!cognitiveTestOutput) return null;
    let parsed: any;
    try { parsed = JSON.parse(cognitiveTestOutput); } catch { return null; }
    if (!parsed?.traits) return null;

    const traitScores: Record<string, EvidenceTraitScore> = {};


    for (const [name, data] of Object.entries(parsed.traits) as [string, any][]) {
      const evidence = data?.evidence || [];
      // Filter out placeholders (strength 0)
      const realEvidence = evidence.filter((e: any) => (Number(e.strength) || 0) > 0);

      if (realEvidence.length === 0) {
        traitScores[name] = { score: 30, confidence: 0.3, positiveCount: 0, negativeCount: 0 };
        continue;
      }

      // Exponential weight mapping: strong evidence dominates weak evidence.
      // Negative evidence gets 2.5x penalty multiplier.
      const strengthToPoints: Record<number, number> = {
        1: 2, 2: 5, 3: 8, 4: 10, 5: 20, 6: 40, 7: 80, 8: 160, 9: 320, 10: 640,
      };
      let rawWeight = 0, posCount = 0, negCount = 0;
      for (const e of realEvidence) {
        const raw = Math.max(1, Math.min(10, Number(e.strength) || 1));
        const points = strengthToPoints[raw] || raw;
        if (e.direction === "positive") {
          rawWeight += points; posCount++;
        } else {
          rawWeight -= points * 2.5; negCount++;
        }
      }

      // No positive evidence at all → pull score down significantly
      // (absence of positive signal is itself a negative signal)
      if (posCount === 0) rawWeight -= 200;

      // tanh maps rawWeight to [-1, 1] smoothly. Sensitivity controls how much
      // evidence is needed to reach the extremes (lower = more evidence needed).
      const sensitivity = 0.003;
      const score = Math.round(Math.max(0, Math.min(100, 50 + 50 * Math.tanh(rawWeight * sensitivity))));

      // Confidence: based on total evidence volume
      const totalStrength = evidence.reduce((s: number, e: any) => s + (Number(e.strength) || 0), 0);
      const confidence = Math.round(Math.min(totalStrength / 20, 1.0) * 100) / 100;

      traitScores[name] = { score, confidence, positiveCount: posCount, negativeCount: negCount };
    }

    // Overall: weighted avg excluding social_intuitive_intelligence, analytical_reasoning x3
    const weights: Record<string, number> = {
      analytical_reasoning: 3,
      abstract_thinking: 1, cognitive_flexibility: 1, conceptual_precision: 1,
      verbal_articulation: 1, verbal_reasoning: 1, depth_of_thought: 1,
      intellectualism: 1,
    };
    let sumW = 0, sumC = 0;
    for (const [name, weight] of Object.entries(weights)) {
      const t = traitScores[name];
      if (!t || t.confidence === 0) continue;
      sumW += t.score * t.confidence * weight;
      sumC += t.confidence * weight;
    }

    const overallScore = sumC > 0 ? Math.round(sumW / sumC) : 50;
    return { overallScore, traits: traitScores };
  }

  const evidenceProfile = computeEvidenceBasedProfile();

  // תכונות: energetic_intensity, assertiveness_forcefulness, charismatic_presence
  function computeCommunicationTone() {
    return weightedAvg([
      "energetic_intensity", "assertiveness_forcefulness", "charismatic_presence",
    ]);
  }

  // סחיות — תכונות: mainstreamness, conformity, openness_to_experience (inverted)
  const vibeProfile = (() => {
    const items = [
      traitData("mainstreamness"),
      traitData("conformity"),
      // openness_to_experience is inverted (high openness = low vibe)
      (() => { const d = traitData("openness_to_experience"); return d ? { score: 100 - d.score, confidence: d.confidence } : null; })(),
    ].filter((d): d is { score: number; confidence: number } => d != null);
    if (items.length === 0) return null;
    const sumW = items.reduce((s, d) => s + d.score * d.confidence, 0);
    const sumC = items.reduce((s, d) => s + d.confidence, 0);
    if (sumC === 0) return null;
    return { score: Math.round(sumW / sumC), count: items.length, total: 3 };
  })();

  // עממיות — תכונות: oriental, mainstreamness, broad_appeal
  const popularityProfile = weightedAvg(["oriental", "mainstreamness", "broad_appeal"]);

  // Extract estimated_psychometric and intelligence_type from cognitive AI output
  const cognitiveExtras = (() => {
    const outputText = analysisRun?.stage_a_output || "";
    const cogMarker = "=== Cognitive Profile";
    const startIdx = outputText.indexOf(cogMarker);
    if (startIdx === -1) return null;
    const nextSection = outputText.indexOf("\n===", startIdx + cogMarker.length);
    const cogSection = outputText.substring(startIdx, nextSection === -1 ? undefined : nextSection);
    const psychMatch = cogSection.match(/"estimated_psychometric"\s*:\s*(\d+)/);
    const typeMatch = cogSection.match(/"intelligence_type"\s*:\s*"(analytical|intuitive|balanced)"/i);
    const psychometric = psychMatch ? parseInt(psychMatch[1], 10) : null;
    const intelligenceType = typeMatch ? typeMatch[1].toLowerCase() : null;
    return {
      psychometric: (psychometric && psychometric >= 200 && psychometric <= 800) ? psychometric : null,
      intelligenceType,
    };
  })();
  const estimatedPsychometric = cognitiveExtras?.psychometric ?? null;
  const intelligenceType = cognitiveExtras?.intelligenceType ?? null;
  const intelligenceTypeHe: Record<string, string> = { analytical: "אנליטי", intuitive: "אינטואיטיבי", balanced: "מאוזן" };

  // Extract estimated_general_intelligence from any group output (generic prompt)
  const estimatedGeneralIntelligence = (() => {
    const outputText = analysisRun?.stage_a_output || "";
    const match = outputText.match(/"estimated_general_intelligence"\s*:\s*(\d+)/);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    return (val >= 0 && val <= 100) ? val : null;
  })();

  const computedProfiles = [
    { name: "פרופיל קוגניטיבי", nameEn: "Cognitive Profile", color: "#6366F1", ...(computeCognitiveProfile() || { score: null, count: 0, total: 8 }) },
    { name: "אינטליגנציה רגשית-חברתית", nameEn: "Emotional-Social Intelligence", color: "#8b5cf6", ...(computeEmotionalSocialIntelligence() || { score: null, count: 0, total: 5 }) },
    { name: "מידת רגשנות", nameEn: "Emotionality", color: "#ec4899", ...(computeEmotionality() || { score: null, count: 0, total: 3 }) },
    ...(evidenceProfile ? [{ name: "קוגניטיבי (ראיות)", nameEn: "Evidence Cognitive", color: "#7c3aed", score: evidenceProfile.overallScore, count: Object.values(evidenceProfile.traits).filter(t => t.confidence > 0).length, total: Object.keys(evidenceProfile.traits).length }] : []),
    { name: "טון תקשורת", nameEn: "Communication Tone", color: "#14b8a6", ...(computeCommunicationTone() || { score: null, count: 0, total: 8 }) },
    { name: "סחיות (Vibe)", nameEn: "Vibe", color: "#f59e0b", ...(vibeProfile || { score: null, count: 0, total: 3 }) },
    { name: "עממיות", nameEn: "Popularity", color: "#10b981", ...(popularityProfile || { score: null, count: 0, total: 3 }) },
  ];

  // Big Five extreme traits (score >= 65 or <= 45)
  const bigFiveExtremes = (() => {
    const bigFiveTraits: { name: string; he: string; heHigh: string; heLow: string }[] = [
      { name: "extraversion", he: "מוחצנות", heHigh: "מוחצנות", heLow: "מוחצנות" },
      { name: "conscientiousness", he: "מצפוניות", heHigh: "מצפוניות", heLow: "מצפוניות" },
      { name: "agreeableness", he: "נעימות", heHigh: "נעימות", heLow: "נעימות" },
      { name: "neuroticism", he: "נוירוטיות", heHigh: "נוירוטיות", heLow: "נוירוטיות" },
      { name: "openness_to_experience", he: "פתיחות", heHigh: "פתיחות", heLow: "פתיחות" },
    ];
    const items: { label: string; score: number; direction: "high" | "low" | "mid" }[] = [];
    for (const t of bigFiveTraits) {
      const d = traitData(t.name);
      if (!d) continue;
      if (d.score >= 65) items.push({ label: t.heHigh, score: d.score, direction: "high" });
      else if (d.score <= 45) items.push({ label: t.heLow, score: d.score, direction: "low" });
      else items.push({ label: t.he, score: d.score, direction: "mid" });
    }
    return items;
  })();

  // MBTI type — computed from extraversion (Big Five) + sensing/intuition/thinking/feeling/judging/perceiving
  const mbtiTypes = (() => {
    const ext = traitData("extraversion");
    const sen = traitData("sensing");
    const int_ = traitData("intuition");
    const thi = traitData("thinking");
    const fee = traitData("feeling");
    const jud = traitData("judging");
    const per = traitData("perceiving");

    // Need at least the MBTI traits to compute
    if (!sen && !int_ && !thi && !fee && !jud && !per) return null;

    // Each axis produces one or two letters
    const axis1 = !ext ? ["X"] : ext.score > 50 ? ["E"] : ext.score < 50 ? ["I"] : ["E", "I"];
    const axis2 = (!sen && !int_) ? ["X"] :
      !sen ? ["N"] : !int_ ? ["S"] :
      sen.score > int_.score ? ["S"] : sen.score < int_.score ? ["N"] : ["S", "N"];
    // T gets +20 bonus because conversational tone biases F scores upward
    const axis3 = (!thi && !fee) ? ["X"] :
      !thi ? ["F"] : !fee ? ["T"] :
      (() => { const adjT = thi.score + 10; return adjT > fee.score ? ["T"] : adjT < fee.score ? ["F"] : ["T", "F"]; })();
    const axis4 = (!jud && !per) ? ["X"] :
      !jud ? ["P"] : !per ? ["J"] :
      jud.score > per.score ? ["J"] : jud.score < per.score ? ["P"] : ["J", "P"];

    // Generate all combinations
    const types: string[] = [];
    for (const a of axis1) for (const b of axis2) for (const c of axis3) for (const d of axis4)
      types.push(a + b + c + d);
    return types;
  })();

  // Personal Style highlights (score >= 65)
  const styleHighlights = (() => {
    const styleTraits: { name: string; he: string }[] = [
      { name: "mainstreamness", he: "מיינסטרימי" },
      { name: "oriental", he: "מזרחי" },
      { name: "broad_appeal", he: "נורמטיבי רחב" },
      { name: "value_rigidity", he: "שמרן ערכית" },
      { name: "family_of_origin_closeness", he: "קרוב למשפחה" },
      { name: "childishness", he: "ילדותי" },
      { name: "humor", he: "הומוריסטי" },
      { name: "right_wing", he: "ימני" },
      { name: "left_wing", he: "שמאלני" },
      { name: "social_activism", he: "אקטיביסט" },
      { name: "party_orientation", he: "מסיבתי" },
      { name: "religiosity", he: "דתי" },
      { name: "secularity", he: "חילוני" },
      { name: "hipsterishness", he: "היפסטר" },
      { name: "geekiness", he: "גיקי" },
      { name: "hippie_style", he: "היפי" },
      { name: "soviet_style", he: "סובייטי" },
      { name: "theatricality", he: "תיאטרלי" },
    ];
    const highlights: { label: string; score: number }[] = [];
    for (const t of styleTraits) {
      const d = traitData(t.name);
      if (!d || d.score < 65) continue;
      highlights.push({ label: t.he, score: d.score });
    }
    highlights.sort((a, b) => b.score - a.score);
    return highlights;
  })();

  // Schwartz Values extreme traits (top 4 most extreme: >= 70 or <= 40)
  const schwartzExtremes = (() => {
    const schwartzTraits: { name: string; he: string }[] = [
      { name: "hedonism", he: "נהנתנות" },
      { name: "achievement", he: "הישגיות" },
      { name: "power", he: "כוח" },
      { name: "self_direction", he: "עצמאות" },
      { name: "stimulation", he: "גירוי" },
      { name: "security", he: "ביטחון" },
      { name: "conformity", he: "ציות" },
      { name: "tradition", he: "מסורת" },
      { name: "benevolence", he: "נדיבות" },
      { name: "universalism", he: "אוניברסליות" },
      { name: "spirituality", he: "רוחניות" },
    ];
    const all: { label: string; score: number; direction: "high" | "low"; distance: number }[] = [];
    for (const t of schwartzTraits) {
      const d = traitData(t.name);
      if (!d) continue;
      if (d.score >= 70) all.push({ label: t.he, score: d.score, direction: "high", distance: d.score - 50 });
      else if (d.score <= 40) all.push({ label: t.he, score: d.score, direction: "low", distance: 50 - d.score });
    }
    // Sort by distance from center (most extreme first)
    all.sort((a, b) => b.distance - a.distance);
    return all;
  })();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button style={s.backBtn} onClick={onBack}>← Back to Users</button>
        <div style={{ display: "flex", gap: 8 }}>
          {onViewDashboard && (
            <button
              style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6 }}
              onClick={() => onViewDashboard({ id: user.id, first_name: user.first_name, email: user.email })}
            >
              צפייה במסך המשתמש
            </button>
          )}
          {onViewNewChat && (
            <button
              style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6 }}
              onClick={() => onViewNewChat({ id: user.id, first_name: user.first_name, email: user.email })}
            >
              צפייה בממשק השיחה החדש
            </button>
          )}
          {onStartChat && !coverage?.profile_complete && user.is_real_user !== 0 && (
            <button
              style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4 }}
              onClick={() => onStartChat({ id: user.id, first_name: user.first_name, email: user.email })}
            >
              חזרה לשיחה
            </button>
          )}
          <button
            style={{
              padding: "4px 12px", fontSize: 12, cursor: "pointer", border: "none", borderRadius: 4,
              background: user.user_status === "frozen" ? "#28a745" : "#fd7e14", color: "#fff",
            }}
            onClick={async () => {
              const action = user.user_status === "frozen" ? "unfreeze" : "freeze";
              if (!confirm(action === "freeze"
                ? `Freeze user #${userId} (${user.first_name})? They will not be included in matching.`
                : `Unfreeze user #${userId} (${user.first_name})? They will return to matching pool.`
              )) return;
              try {
                const r = await fetch(`/api/admin/users/${userId}/${action}`, { method: "POST" });
                const json = await r.json();
                if (!r.ok) { alert(json.error || `${action} failed`); return; }
                alert(`User ${action === "freeze" ? "frozen" : "unfrozen"}.`);
                loadUserData();
              } catch { alert("Network error"); }
            }}
          >
            {user.user_status === "frozen" ? "Unfreeze User" : "Freeze User"}
          </button>
          <button
            style={{ padding: "4px 12px", fontSize: 12, cursor: "pointer", background: "#dc3545", color: "#fff", border: "none", borderRadius: 4 }}
            onClick={handleDeleteUser}
          >
            Delete User
          </button>
        </div>
      </div>

      {/* Frozen banner */}
      {user.user_status === "frozen" && (
        <div style={{ background: "#f8d7da", border: "1px solid #f5c6cb", borderRadius: 6, padding: "8px 14px", marginBottom: 8, fontSize: 13, color: "#721c24", fontWeight: 600 }}>
          This user is frozen and excluded from matching.
        </div>
      )}

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
        Matchable: <strong style={{ color: user.is_matchable ? "#28a745" : "#dc3545" }}>{user.is_matchable ? "Yes" : "No"}</strong>
        <button
          style={{
            marginLeft: 6,
            padding: "1px 8px",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            border: "1px solid",
            borderRadius: 4,
            background: user.is_matchable ? "#fff3cd" : "#d4edda",
            borderColor: user.is_matchable ? "#ffc107" : "#28a745",
            color: user.is_matchable ? "#856404" : "#155724",
          }}
          onClick={async () => {
            try {
              const res = await fetch(`/api/admin/users/${user.id}/toggle-matchable`, { method: "POST" });
              const data = await res.json();
              if (!res.ok) {
                alert(`Error: ${data.error || res.statusText}`);
                return;
              }
              // Refresh user data
              setUser((prev: any) => prev ? { ...prev, is_matchable: data.is_matchable } : prev);
              if (data.forced) {
                alert(`Forced matchable = TRUE for user ${user.id}`);
              } else {
                alert(`Recalculated: matchable = ${data.is_matchable} (readiness: ${Math.round((data.readiness_score ?? 0) * 100)}%)`);
              }
            } catch (err: any) {
              alert("Failed to toggle matchable: " + (err?.message || "network error"));
            }
          }}
        >
          {user.is_matchable ? "Recalculate" : "Force Matchable"}
        </button>
         |
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

          {/* Computed Profiles — derived from trait scores */}
          {computedProfiles.some(p => p.score != null) && (
            <>
              <SectionHeading title="Computed Profiles" />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                {computedProfiles.map(p => (
                  <div key={p.nameEn} style={{
                    flex: "1 1 140px", padding: "14px 16px", borderRadius: 12,
                    background: p.score != null ? "#f8fafc" : "#fafafa",
                    border: `2px solid ${p.score != null ? p.color + "40" : "#e5e5e5"}`,
                    textAlign: "center", minWidth: 140,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>{p.name}</div>
                    {p.nameEn === "Intelligence Type" ? (
                      <div style={{ fontSize: 20, fontWeight: 700, color: p.color, marginTop: 4 }}>
                        {intelligenceType === "analytical" ? "🧠" : intelligenceType === "intuitive" ? "🌊" : "⚖️"}
                      </div>
                    ) : p.score != null ? (
                      <>
                        <div style={{ fontSize: 28, fontWeight: 700, color: p.color }}>{p.score}</div>
                        <div style={{ background: "#eee", borderRadius: 4, height: 6, marginTop: 8, overflow: "hidden" }}>
                          <div style={{ background: p.color, height: "100%", width: `${p.nameEn === "Est. Psychometric" ? Math.round((p.score - 200) * 100 / 600) : p.score}%`, borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>
                          {p.nameEn === "Est. Psychometric" || p.nameEn === "General Intelligence"
                            ? "AI estimate"
                            : `${p.count}/${p.total} traits`}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 14, color: "#bbb" }}>—</div>
                    )}
                  </div>
                ))}
                {bigFiveExtremes.length > 0 && (/* always show if any Big Five data */
                  <div style={{
                    flex: "1 1 180px", padding: "14px 16px", borderRadius: 12,
                    background: "#f8fafc", border: "2px solid #3b82f640",
                    minWidth: 180,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>Big Five — תכונות בולטות</div>
                    {bigFiveExtremes.map((e, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: e.direction === "high" ? "#3b82f6" : e.direction === "low" ? "#f59e0b" : "#888" }}>{e.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: e.direction === "high" ? "#3b82f6" : e.direction === "low" ? "#f59e0b" : "#888" }}>{e.score}</span>
                      </div>
                    ))}
                  </div>
                )}
                {schwartzExtremes.length > 0 && (
                  <div style={{
                    flex: "1 1 180px", padding: "14px 16px", borderRadius: 12,
                    background: "#f8fafc", border: "2px solid #8b5cf640",
                    minWidth: 180,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>ערכים בולטים (שוורץ)</div>
                    {schwartzExtremes.map((e, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: e.direction === "high" ? "#8b5cf6" : "#f59e0b" }}>{e.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: e.direction === "high" ? "#8b5cf6" : "#f59e0b" }}>{e.score}</span>
                      </div>
                    ))}
                  </div>
                )}
                {styleHighlights.length > 0 && (
                  <div style={{
                    flex: "1 1 180px", padding: "14px 16px", borderRadius: 12,
                    background: "#f8fafc", border: "2px solid #f9731640",
                    minWidth: 180,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>סגנון בולט</div>
                    {styleHighlights.map((e, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#f97316" }}>{e.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f97316" }}>{e.score}</span>
                      </div>
                    ))}
                  </div>
                )}
                {mbtiTypes && (
                  <div style={{
                    flex: "1 1 140px", padding: "14px 16px", borderRadius: 12,
                    background: "#f8fafc", border: "2px solid #0ea5e940",
                    textAlign: "center", minWidth: 140,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 6 }}>MBTI</div>
                    <div style={{ fontSize: mbtiTypes.length > 2 ? 18 : 28, fontWeight: 700, color: "#0ea5e9" }}>
                      {mbtiTypes.join(" / ")}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Evidence-based cognitive scores detail */}
          {evidenceProfile && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <button
                  style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: showEvidenceScores ? "#7c3aed" : "#f3e8ff", color: showEvidenceScores ? "#fff" : "#7c3aed", border: "1px solid #7c3aed", borderRadius: 4 }}
                  onClick={() => setShowEvidenceScores(!showEvidenceScores)}
                >{showEvidenceScores ? "Hide Evidence Scores" : "Show Evidence Scores"}</button>
              </div>
              {showEvidenceScores && (() => {
                const traitLabels: Record<string, string> = {
                  analytical_reasoning: "חשיבה אנליטית (x3)",
                  abstract_thinking: "חשיבה מופשטת",
                  cognitive_flexibility: "גמישות מחשבתית",
                  conceptual_precision: "בהירות מושגית",
                  verbal_articulation: "יכולת ניסוח",
                  verbal_reasoning: "הסקה מילולית",
                  depth_of_thought: "עומק מחשבתי",
                  social_intuitive_intelligence: "אינטליגנציה אינטואיטיבית",
                  intellectualism: "אינטלקטואליות",
                };
                return (
                  <table style={{ ...s.table, marginBottom: 16, maxWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={s.th}>Trait</th>
                        <th style={{ ...s.th, textAlign: "center" }}>Score</th>
                        <th style={{ ...s.th, textAlign: "center" }}>Confidence</th>
                        <th style={{ ...s.th, textAlign: "center" }}>+ Evidence</th>
                        <th style={{ ...s.th, textAlign: "center" }}>- Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(evidenceProfile.traits).map(([name, t]) => (
                        <tr key={name} style={{ background: name === "social_intuitive_intelligence" ? "#f5f3ff" : undefined }}>
                          <td style={s.td}>{traitLabels[name] || name}</td>
                          <td style={{ ...s.td, textAlign: "center", fontWeight: 600, color: t.score >= 60 ? "#22c55e" : t.score <= 40 ? "#ef4444" : "#666" }}>{t.score}</td>
                          <td style={{ ...s.td, textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 40, background: "#eee", borderRadius: 3, height: 5, overflow: "hidden" }}>
                                <div style={{ background: "#7c3aed", height: "100%", width: `${t.confidence * 100}%`, borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, color: "#888" }}>{(t.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ ...s.td, textAlign: "center", color: "#22c55e", fontWeight: 600 }}>{t.positiveCount || "—"}</td>
                          <td style={{ ...s.td, textAlign: "center", color: "#ef4444", fontWeight: 600 }}>{t.negativeCount || "—"}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                        <td style={s.td}>Overall Score</td>
                        <td style={{ ...s.td, textAlign: "center", color: "#7c3aed", fontSize: 16 }}>{evidenceProfile.overallScore}</td>
                        <td colSpan={3} style={s.td}></td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </>
          )}

          {/* Personality Traits */}
          <SectionHeading title={`Personality Traits (${visibleTraits.length})`} />
          <p style={{ fontSize: 11, color: "#888", margin: "0 0 8px" }}>
            Effective = system_weight × user_weight × weight_confidence
          </p>
          {/* Analysis toolbar — always visible */}
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
            <button
              style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4 }}
              onClick={handleCognitiveTest}
              disabled={runningCognitiveTest}
            >
              {runningCognitiveTest ? "Running..." : "Cognitive Test"}
            </button>
            {traits.length === 0 && lookTraits.length === 0 && (
              <span style={{ fontSize: 12, color: "#856404", background: "#fff3cd", padding: "4px 10px", borderRadius: 4 }}>
                No trait data — click Re-analyze to generate
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "#888", alignSelf: "center", marginRight: 4 }}>Run single group:</span>
            {[
              { key: "cognitive", label: "Cognitive", color: "#6366F1" },
              { key: "personality", label: "Big Five + Schwartz", color: "#3b82f6" },
              { key: "communication", label: "Comm. Tone", color: "#14b8a6" },
              { key: "style", label: "Personal Style", color: "#f97316" },
              { key: "emotional", label: "Emotional", color: "#ec4899" },
              { key: "general", label: "General Info", color: "#6b7280" },
              { key: "mbti", label: "MBTI", color: "#0ea5e9" },
              { key: "external", label: "External", color: "#8b5cf6" },
            ].map(g => (
              <button key={g.key}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer", background: runningGroup === g.key ? g.color : "#fff", color: runningGroup === g.key ? "#fff" : g.color, border: `1px solid ${g.color}`, borderRadius: 4, opacity: runningGroup && runningGroup !== g.key ? 0.5 : 1 }}
                onClick={() => handleGroupReanalyze(g.key)}
                disabled={!!runningGroup}
              >{runningGroup === g.key ? "Running..." : g.label}</button>
            ))}
          </div>
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
          <div style={{ background: "#fff8f0", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13, border: "1px solid #ffe0b2" }}>
            {dealBreakers?.source
              ? <span>{dealBreakers.score || "Analyzed — no specific deal breakers found"}</span>
              : <span style={{ color: "#999" }}>Not analyzed</span>}
          </div>

          {/* Advantages */}
          <SectionHeading title="Advantages" />
          <div style={{ background: "#f0fff4", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13, border: "1px solid #c3e6cb" }}>
            {advantages?.source
              ? <span>{advantages.score || "Analyzed — no specific advantages found"}</span>
              : <span style={{ color: "#999" }}>Not analyzed</span>}
          </div>

          {/* External Traits — Manual Visual Scores */}
          <SectionHeading title="External Traits — Manual" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            {manualLookTraits.map((lt: any) => {
              const id = lt.look_trait_definition_id;
              const val = getLookTraitEditValue(lt);
              return (
                <div key={id} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 130 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>
                    {lt.display_name_he || lt.internal_name}
                  </label>
                  <input
                    type="number" min={1} max={100}
                    value={val}
                    onChange={e => setLookTraitEdit(lt, e.target.value)}
                    placeholder="1-100"
                    style={{ ...s.configInput, width: 70 }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
            <button
              onClick={saveLookTraits}
              disabled={savingLookTraits}
              style={{ ...s.configSave, padding: "6px 16px", fontSize: 12 }}
            >{savingLookTraits ? "Saving..." : "Save External Traits"}</button>
            {lookTraitsSaved && <span style={{ fontSize: 12, color: "#28a745" }}>Saved</span>}
          </div>

          {/* Other Look Traits (AI-analyzed, read-only) */}
          {otherLookTraits.length > 0 && (
            <>
              <SectionHeading title={`Other Look Traits (${otherLookTraits.length})`} />
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
                  {otherLookTraits.map((lt: any, i: number) => {
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
            </>
          )}
        </div>
      </div>

      {/* Full Conversation */}
      {transcript && transcript.messages?.length > 0 && (() => {
        // Build per-channel message groups
        const channelGroups: { key: string; label: string; color: string; msgs: any[] }[] = [];
        const interviewerMsgs = transcript.messages.filter((m: any) => m.chat_type === "interviewer");
        const psychMsgs = transcript.messages.filter((m: any) => m.chat_type === "psychologist");
        const generalMsgs = transcript.messages.filter((m: any) => m.chat_type === "new_chat");
        const cognitiveMsgs = transcript.messages.filter((m: any) => m.chat_type === "new_chat_cognitive");
        const tasteMsgs = transcript.messages.filter((m: any) => m.chat_type === "new_chat_taste");

        // Only show tabs that have messages
        if (interviewerMsgs.length > 0) channelGroups.push({ key: "interviewer", label: `מעבדת אישיות (${interviewerMsgs.length})`, color: "#e67e22", msgs: interviewerMsgs });
        if (psychMsgs.length > 0) channelGroups.push({ key: "psychologist", label: `שיחת עומק (${psychMsgs.length})`, color: "#7c3aed", msgs: psychMsgs });
        if (generalMsgs.length > 0) channelGroups.push({ key: "new_chat", label: `צ'אט כללי (${generalMsgs.length})`, color: "#6366f1", msgs: generalMsgs });
        if (cognitiveMsgs.length > 0) channelGroups.push({ key: "new_chat_cognitive", label: `סגנון חשיבה (${cognitiveMsgs.length})`, color: "#0ea5e9", msgs: cognitiveMsgs });
        if (tasteMsgs.length > 0) channelGroups.push({ key: "new_chat_taste", label: `ניתוח טעם (${tasteMsgs.length})`, color: "#ec4899", msgs: tasteMsgs });

        const filteredMsgs = transcriptTab === "all" ? transcript.messages
          : (channelGroups.find(g => g.key === transcriptTab)?.msgs || transcript.messages);
        return (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <SectionHeading title={`Conversation (${transcript.messages.length} messages)`} />
            <button
              style={{ padding: "3px 10px", fontSize: 11, cursor: "pointer", background: transcriptOpen ? "#eee" : "#f0f4ff", border: "1px solid #ddd", borderRadius: 4 }}
              onClick={() => setTranscriptOpen(!transcriptOpen)}
            >
              {transcriptOpen ? "Hide" : "Show"}
            </button>
            {/* Copy buttons — one per non-empty channel + Copy All */}
            {channelGroups.map(g => (
              <button key={`copy-${g.key}`}
                style={{ padding: "3px 10px", fontSize: 11, cursor: "pointer", background: copied === g.key ? "#d4edda" : "#f0f4ff", border: "1px solid #ddd", borderRadius: 4 }}
                onClick={() => {
                  const text = g.msgs.map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
                  navigator.clipboard.writeText(text).then(() => { setCopied(g.key); setTimeout(() => setCopied(false), 2000); });
                }}
              >
                {copied === g.key ? "Copied!" : `Copy ${g.label}`}
              </button>
            ))}
            <button
              style={{ padding: "3px 10px", fontSize: 11, cursor: "pointer", background: copied === "all" ? "#d4edda" : "#fff", border: "1px solid #ddd", borderRadius: 4 }}
              onClick={() => {
                const tagNames: Record<string, string> = { interviewer: "Lab", psychologist: "Depth", new_chat: "General", new_chat_cognitive: "Cognitive", new_chat_taste: "Taste" };
                const text = transcript.messages
                  .map((m: any) => `[${tagNames[m.chat_type] || m.chat_type}] ${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
                  .join("\n\n");
                navigator.clipboard.writeText(text).then(() => { setCopied("all"); setTimeout(() => setCopied(false), 2000); });
              }}
            >
              {copied === "all" ? "Copied!" : "Copy All"}
            </button>
          </div>
          {transcriptOpen && (
            <>
              {/* Tabs for chat type — only show non-empty */}
              <div style={{ display: "flex", gap: 4, marginBottom: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={() => setTranscriptTab("all")} style={{
                  padding: "4px 12px", fontSize: 11, border: "1px solid #ddd", borderRadius: 4, cursor: "pointer",
                  background: transcriptTab === "all" ? "#1a1a1a" : "#fff", color: transcriptTab === "all" ? "#fff" : "#333",
                }}>{`הכל (${transcript.messages.length})`}</button>
                {channelGroups.map(g => (
                  <button key={g.key} onClick={() => setTranscriptTab(g.key)} style={{
                    padding: "4px 12px", fontSize: 11, border: `1px solid ${transcriptTab === g.key ? g.color : "#ddd"}`, borderRadius: 4, cursor: "pointer",
                    background: transcriptTab === g.key ? g.color : "#fff", color: transcriptTab === g.key ? "#fff" : "#333",
                  }}>{g.label}</button>
                ))}
              </div>
              <div style={{ background: "#fafafa", borderRadius: 8, padding: 16, marginBottom: 16, maxHeight: 500, overflowY: "auto", fontSize: 13, lineHeight: 1.7 }}>
              {filteredMsgs.map((m: any, i: number) => (
                <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
                  <span style={{
                    display: "inline-block", padding: "1px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600, marginBottom: 4,
                    background: m.role === "user" ? "#1a1a1a" : m.role === "assistant" ? "#e8e8e8" : "#f8f4e8",
                    color: m.role === "user" ? "#fff" : "#333",
                  }}>
                    {m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System"}
                  </span>
                  {(() => {
                    const tagMap: Record<string, { label: string; color: string }> = {
                      interviewer: { label: "מעבדה", color: "#e67e22" },
                      psychologist: { label: "עומק", color: "#7c3aed" },
                      new_chat: { label: "כללי", color: "#6366f1" },
                      new_chat_cognitive: { label: "חשיבה", color: "#0ea5e9" },
                      new_chat_taste: { label: "טעם", color: "#ec4899" },
                    };
                    const tag = tagMap[m.chat_type];
                    return tag ? <span style={{ fontSize: 9, color: tag.color, marginLeft: 6 }}>{tag.label}</span> : null;
                  })()}
                  {m.timestamp && <span style={{ fontSize: 10, color: "#aaa", marginLeft: 8 }}>{m.timestamp}</span>}
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{m.content}</div>
                </div>
              ))}
              </div>
            </>
          )}
        </>
        );
      })()}

      {/* Analysis Debug View */}
      {analysisRun?.exists && (
        <>
          {/* Generated Trait Prompt */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
            <SectionHeading title="Generated Trait Prompt" />
            <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: showPrompt ? "#eee" : "#f0f4ff", border: "1px solid #ddd", borderRadius: 4 }}
              onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? "Hide" : "Show"}</button>
          </div>
          {showPrompt && (
            <div style={{ background: "#fafafa", borderRadius: 6, padding: 12, marginBottom: 12, maxHeight: 400, overflowY: "auto", fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
              {analysisRun.generated_prompt}
            </div>
          )}

          {/* Cognitive Profile Prompt & Output */}
          {(() => {
            const promptText = analysisRun.generated_prompt || "";
            const outputText = analysisRun.stage_a_output || "";
            const extractSection = (text: string, sectionName: string) => {
              const marker = `=== ${sectionName}`;
              const startIdx = text.indexOf(marker);
              if (startIdx === -1) return null;
              const nextSection = text.indexOf("\n===", startIdx + marker.length);
              return text.substring(startIdx, nextSection === -1 ? undefined : nextSection).trim();
            };
            const cogPrompt = extractSection(promptText, "Cognitive Profile");
            const cogOutput = extractSection(outputText, "Cognitive Profile");
            if (!cogPrompt && !cogOutput) return null;
            return (
              <>
                {cogPrompt && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <SectionHeading title="Cognitive Profile — Prompt" />
                      <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: showCognitivePrompt ? "#eee" : "#ede9fe", border: "1px solid #ddd", borderRadius: 4 }}
                        onClick={() => setShowCognitivePrompt(!showCognitivePrompt)}>{showCognitivePrompt ? "Hide" : "Show"}</button>
                      <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: copiedLabel === "cog-p" ? "#d4edda" : "#ede9fe", border: "1px solid #ddd", borderRadius: 4 }}
                        onClick={() => { navigator.clipboard.writeText(cogPrompt); setCopiedLabel("cog-p"); setTimeout(() => setCopiedLabel(l => l === "cog-p" ? null : l), 1500); }}>{copiedLabel === "cog-p" ? "Copied ✓" : "Copy"}</button>
                    </div>
                    {showCognitivePrompt && (
                      <div style={{ background: "#f5f3ff", borderRadius: 6, padding: 12, marginBottom: 12, maxHeight: 400, overflowY: "auto", fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "monospace", borderLeft: "3px solid #6366F1" }}>
                        {cogPrompt}
                      </div>
                    )}
                  </>
                )}
                {cogOutput && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <SectionHeading title="Cognitive Profile — AI Output" />
                      <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: showCognitiveOutput ? "#eee" : "#ede9fe", border: "1px solid #ddd", borderRadius: 4 }}
                        onClick={() => setShowCognitiveOutput(!showCognitiveOutput)}>{showCognitiveOutput ? "Hide" : "Show"}</button>
                      <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: copiedLabel === "cog-o" ? "#d4edda" : "#ede9fe", border: "1px solid #ddd", borderRadius: 4 }}
                        onClick={() => { navigator.clipboard.writeText(cogOutput); setCopiedLabel("cog-o"); setTimeout(() => setCopiedLabel(l => l === "cog-o" ? null : l), 1500); }}>{copiedLabel === "cog-o" ? "Copied ✓" : "Copy"}</button>
                    </div>
                    {showCognitiveOutput && (
                      <div style={{ background: "#faf5ff", borderRadius: 6, padding: 12, marginBottom: 12, maxHeight: 500, overflowY: "auto", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", borderLeft: "3px solid #8b5cf6" }}>
                        {cogOutput}
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}

          {/* Cognitive Test Output */}
          {cognitiveTestOutput && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SectionHeading title="Cognitive Test (Experimental)" />
                <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: showCognitiveTest ? "#eee" : "#f3e8ff", border: "1px solid #ddd", borderRadius: 4 }}
                  onClick={() => setShowCognitiveTest(!showCognitiveTest)}>{showCognitiveTest ? "Hide" : "Show"}</button>
                <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: copiedLabel === "cog-test" ? "#d4edda" : "#f3e8ff", border: "1px solid #ddd", borderRadius: 4 }}
                  onClick={() => { navigator.clipboard.writeText(cognitiveTestOutput); setCopiedLabel("cog-test"); setTimeout(() => setCopiedLabel(l => l === "cog-test" ? null : l), 1500); }}>{copiedLabel === "cog-test" ? "Copied ✓" : "Copy"}</button>
              </div>
              {showCognitiveTest && (() => {
                const traitLabels: Record<string, string> = {
                  analytical_reasoning: "חשיבה אנליטית",
                  abstract_thinking: "חשיבה מופשטת",
                  cognitive_flexibility: "גמישות מחשבתית",
                  conceptual_precision: "בהירות מושגית",
                  verbal_articulation: "יכולת ניסוח",
                  verbal_reasoning: "הסקה מילולית",
                  depth_of_thought: "עומק מחשבתי",
                  social_intuitive_intelligence: "אינטליגנציה חברתית-אינטואיטיבית",
                  intellectualism: "אינטלקטואליות",
                };
                let parsed: any = null;
                try { parsed = JSON.parse(cognitiveTestOutput!); } catch {}
                if (!parsed?.traits) {
                  return (
                    <div style={{ background: "#faf5ff", borderRadius: 6, padding: 12, marginBottom: 12, maxHeight: 600, overflowY: "auto", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", borderLeft: "3px solid #7c3aed" }}>
                      {cognitiveTestOutput}
                    </div>
                  );
                }
                return (
                  <div style={{ background: "#faf5ff", borderRadius: 6, padding: 16, marginBottom: 12, maxHeight: 700, overflowY: "auto", borderLeft: "3px solid #7c3aed" }}>
                    {Object.entries(parsed.traits).map(([traitName, traitData]: [string, any]) => {
                      const evidence = traitData?.evidence || [];
                      return (
                        <div key={traitName} style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#4c1d95", marginBottom: 6 }}>
                            {traitLabels[traitName] || traitName}
                            <span style={{ fontWeight: 400, fontSize: 11, color: "#888", marginLeft: 8 }}>({evidence.length} evidence)</span>
                          </div>
                          {evidence.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#aaa", marginLeft: 12 }}>אין ראיות</div>
                          ) : (
                            evidence.map((e: any, i: number) => (
                              <div key={i} style={{ marginLeft: 12, marginBottom: 8, fontSize: 12, lineHeight: 1.6, display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <span style={{
                                  flexShrink: 0, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 10, fontWeight: 700, color: "#fff",
                                  background: e.direction === "positive" ? "#22c55e" : "#ef4444",
                                }}>{e.strength}</span>
                                <div>
                                  <div style={{ color: "#333" }}>"{e.quote}"</div>
                                  <div style={{ color: "#666", fontSize: 11 }}>{e.explanation}</div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}

          {/* Stage A Analysis */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SectionHeading title="AI Analysis — Stage A (Text)" />
            <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: showStageA ? "#eee" : "#f0f4ff", border: "1px solid #ddd", borderRadius: 4 }}
              onClick={() => setShowStageA(!showStageA)}>{showStageA ? "Hide" : "Show"}</button>
            <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: copiedLabel === "a" ? "#d4edda" : "#f0f4ff", border: "1px solid #ddd", borderRadius: 4 }}
              onClick={() => { navigator.clipboard.writeText(analysisRun.stage_a_output || ""); setCopiedLabel("a"); setTimeout(() => setCopiedLabel(l => l === "a" ? null : l), 1500); }}>{copiedLabel === "a" ? "Copied ✓" : "Copy Stage A"}</button>
            <button style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer", background: copiedLabel === "b" ? "#d4edda" : "#f0f4ff", border: "1px solid #ddd", borderRadius: 4 }}
              onClick={() => { const raw = analysisRun.stage_b_output || ""; let text: string; try { text = typeof raw === "string" ? JSON.stringify(JSON.parse(raw), null, 2) : JSON.stringify(raw, null, 2); } catch { text = String(raw); } navigator.clipboard.writeText(text); setCopiedLabel("b"); setTimeout(() => setCopiedLabel(l => l === "b" ? null : l), 1500); }}>{copiedLabel === "b" ? "Copied ✓" : "Copy Stage B"}</button>
          </div>
          {showStageA && (
            <div style={{ background: "#fffde7", borderRadius: 6, padding: 12, marginBottom: 12, maxHeight: 500, overflowY: "auto", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {analysisRun.stage_a_output}
            </div>
          )}

          <p style={{ fontSize: 10, color: "#aaa", margin: "0 0 16px" }}>
            Last analysis run: {analysisRun.created_at}
          </p>
        </>
      )}

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

// ── User Profiles Tab ────────────────────────────────────────────

function UserProfilesTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    fetch("/api/admin/user-profiles")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p style={s.loading}>Loading profiles...</p>;

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortCol) return 0;
    const av = a[sortCol] ?? -1;
    const bv = b[sortCol] ?? -1;
    return sortAsc ? av - bv : bv - av;
  });

  const profileCols = [
    { key: "cognitive", label: "קוגניטיבי", color: "#6366F1" },
    { key: "emotional_social", label: "רגשית-חברתית", color: "#8b5cf6" },
    { key: "emotionality", label: "רגשנות", color: "#ec4899" },
    { key: "communication", label: "תקשורת", color: "#14b8a6" },
    { key: "vibe", label: "סחיות", color: "#f59e0b" },
    { key: "popularity", label: "עממיות", color: "#10b981" },
    { key: "big_five", label: "ביג פייב", color: "#3b82f6" },
    { key: "schwartz", label: "שוורץ", color: "#f97316" },
    { key: "style", label: "סגנון", color: "#a855f7" },
  ];

  const scoreCell = (val: number | null, color: string) => {
    if (val == null) return <td style={{ ...s.td, textAlign: "center" }}><span style={s.none}>—</span></td>;
    return (
      <td style={{ ...s.td, textAlign: "center" }}>
        <span style={{ fontWeight: 600, color, fontSize: 13 }}>{val}</span>
      </td>
    );
  };

  return (
    <div style={s.scrollWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Name</th>
            {profileCols.map(c => (
              <th key={c.key} style={{ ...s.th, cursor: "pointer", textAlign: "center" }} onClick={() => handleSort(c.key)}>
                {c.label} {sortCol === c.key ? (sortAsc ? "▲" : "▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(u => (
            <tr key={u.id}>
              <td style={s.td}>{u.first_name}</td>
              {profileCols.map(c => scoreCell(u[c.key], c.color))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

  // Group traits by trait_group for visual organization
  const groups: Record<string, any[]> = {};
  for (const t of data) {
    const g = t.trait_group || "Ungrouped";
    if (!groups[g]) groups[g] = [];
    groups[g].push(t);
  }
  const groupEntries = Object.entries(groups);

  return (
    <div style={s.scrollWrap}>
      <p style={s.sub}>{data.length} trait definitions in {groupEntries.length} groups</p>
      {groupEntries.map(([groupName, traits]) => (
        <div key={groupName} style={{ marginBottom: 24 }}>
          <h4 style={{ margin: "12px 0 6px", fontSize: 14, color: "#6C63FF" }}>
            {groupName} ({traits.length})
          </h4>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>#</th>
            <th style={s.th}>Internal Name</th>
            <th style={s.th}>Hebrew</th>
            <th style={s.th}>Weight</th>
            <th style={s.th}>Req. Conf.</th>
            <th style={s.th}>Calc Type</th>
            <th style={s.th}>AI Desc</th>
            <th style={s.th}>Active</th>
            <th style={s.th}>Edit</th>
          </tr>
        </thead>
        <tbody>
          {traits.map((t) => {
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
      ))}
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
                <td style={s.td}>{
                  // possible_values is JSONB (pg auto-parses) — accept both
                  // a pre-parsed array (current) and a JSON string (legacy).
                  (() => {
                    if (!t.possible_values) return "-";
                    const v = typeof t.possible_values === "string"
                      ? (() => { try { return JSON.parse(t.possible_values); } catch { return null; } })()
                      : t.possible_values;
                    return Array.isArray(v) ? v.join(", ") : "-";
                  })()
                }</td>
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

  // Run Algorithm (Force) = same as runAlgorithm but skips is_matchable filter.
  async function runAlgorithmForce() {
    setRunning("algorithm-force");
    setResult(null);
    try {
      const r = await fetch("/api/admin/run-matching-force", { method: "POST" });
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
          onClick={runAlgorithmForce}
          disabled={running !== null}
          style={{ padding: "8px 16px", fontSize: 14, background: "#fd7e14", color: "#fff", border: "none", borderRadius: 6, cursor: running ? "wait" : "pointer", fontWeight: 600 }}
        >
          {running === "algorithm-force" ? "Running..." : "Run Algorithm (Force All)"}
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
                <th style={s.th}>Profile</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Shared Priority</th>
                <th style={s.th}>Match Priority</th>
                <th style={s.th}>Internal</th>
                <th style={s.th}>External</th>
                <th style={s.th}>קוגניטיבי</th>
                <th style={s.th}>רגשית-חברתית</th>
                <th style={s.th}>רגשנות</th>
                <th style={s.th}>תקשורת</th>
                <th style={s.th}>סחיות</th>
                <th style={s.th}>עממיות</th>
                <th style={s.th}>ביג פייב</th>
                <th style={s.th}>שוורץ</th>
                <th style={s.th}>סגנון</th>
                <th style={s.th}>כללי</th>
                <th style={s.th}>MBTI</th>
              </tr>
            </thead>
            <tbody>
              {data.map((cm: any) => (
                <tr key={cm.id}>
                  <td style={s.td}><button style={s.expandBtn} onClick={() => setSelectedUserId(cm.user_id)}>{cm.user1_name}</button> ({cm.user1_age}, {cm.user1_city})</td>
                  <td style={s.td}><button style={s.expandBtn} onClick={() => setSelectedUserId(cm.candidate_user_id)}>{cm.user2_name}</button> ({cm.user2_age}, {cm.user2_city})</td>
                  <td style={s.td}>{cm.final_score != null ? <strong style={{ color: cm.final_score >= 70 ? "#28a745" : cm.final_score >= 50 ? "#856404" : "#dc3545" }}>{cm.final_score}</strong> : "-"}</td>
                  <td style={s.td}>{cm.profile_score != null ? <strong style={{ color: cm.profile_score >= 70 ? "#28a745" : cm.profile_score >= 50 ? "#856404" : "#dc3545" }}>{cm.profile_score}</strong> : "-"}</td>
                  <td style={s.td}>{cm.match_status ? <span style={matchStatusColor(cm.match_status)}>{cm.match_status}</span> : <span style={s.badge}>{cm.status}</span>}</td>
                  <td style={s.td}>{cm.pair_priority != null ? cm.pair_priority : "-"}</td>
                  <td style={s.td}>{cm.final_match_priority != null ? <strong>{cm.final_match_priority}</strong> : "-"}</td>
                  <td style={s.td}>{cm.internal_score ?? "-"}</td>
                  <td style={s.td}>{cm.external_score ?? "-"}</td>
                  <td style={s.td}>{cm.score_cognitive ?? "-"}</td>
                  <td style={s.td}>{cm.score_emotional_social ?? "-"}</td>
                  <td style={s.td}>{cm.score_emotionality ?? "-"}</td>
                  <td style={s.td}>{cm.score_communication ?? "-"}</td>
                  <td style={s.td}>{cm.score_vibe ?? "-"}</td>
                  <td style={s.td}>{cm.score_popularity ?? "-"}</td>
                  <td style={s.td}>{cm.score_big_five ?? "-"}</td>
                  <td style={s.td}>{cm.score_schwartz ?? "-"}</td>
                  <td style={s.td}>{cm.score_style ?? "-"}</td>
                  <td style={s.td}>{cm.score_general ?? "-"}</td>
                  <td style={s.td}>{cm.score_mbti ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BUG REPORTS TAB
// ════════════════════════════════════════════════════════════════

function BugReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    loadReports();
  }, []);

  function loadReports() {
    setLoading(true);
    fetch("/api/admin/bug-reports")
      .then(r => r.json())
      .then(data => { setReports(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleDelete(id: number) {
    if (!confirm("למחוק את הדיווח?")) return;
    await fetch(`/api/admin/bug-reports/${id}`, { method: "DELETE" });
    setReports(prev => prev.filter(r => r.id !== id));
  }

  function startEdit(report: any) {
    setEditingId(report.id);
    setEditText(report.report_text);
  }

  async function saveEdit(id: number) {
    const res = await fetch(`/api/admin/bug-reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_text: editText }),
    });
    if (res.ok) {
      setReports(prev => prev.map(r => r.id === id ? { ...r, report_text: editText } : r));
      setEditingId(null);
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h3 style={{ margin: "0 0 16px" }}>Bug Reports ({reports.length})</h3>
      {reports.length === 0 ? (
        <p style={{ color: "#888" }}>No bug reports yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map(r => (
            <div key={r.id} style={{
              background: "#fff", border: "1px solid #e5e5e5", borderRadius: 8,
              padding: 16, position: "relative",
            }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{r.first_name || "Anonymous"}</strong>
                  {r.email && <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>{r.email}</span>}
                </div>
                <span style={{ fontSize: 11, color: "#aaa" }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString("he-IL") : ""}
                </span>
              </div>

              {/* Body — edit mode or display mode */}
              {editingId === r.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    style={{
                      width: "100%", minHeight: 60, padding: 8, fontSize: 13,
                      border: "1px solid #ddd", borderRadius: 6, resize: "vertical",
                      boxSizing: "border-box", direction: "rtl",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button
                      style={{ padding: "4px 12px", fontSize: 12, background: "#28a745", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                      onClick={() => saveEdit(r.id)}
                    >
                      Save
                    </button>
                    <button
                      style={{ padding: "4px 12px", fontSize: 12, background: "#888", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", direction: "rtl" }}>
                  {r.report_text}
                </p>
              )}

              {/* Actions */}
              {editingId !== r.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    style={{ padding: "3px 10px", fontSize: 11, background: "#f0f4ff", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
                    onClick={() => startEdit(r)}
                  >
                    Edit
                  </button>
                  <button
                    style={{ padding: "3px 10px", fontSize: 11, background: "#fff0f0", border: "1px solid #f5c6cb", borderRadius: 4, cursor: "pointer", color: "#dc3545" }}
                    onClick={() => handleDelete(r.id)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
