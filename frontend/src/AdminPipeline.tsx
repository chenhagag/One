import { useEffect, useState } from "react";
import { apiFetch } from "./lib/api";

// ════════════════════════════════════════════════════════════════
// AdminPipeline — 6-stage user management dashboard
// ════════════════════════════════════════════════════════════════

interface PipelineUser {
  id: number;
  first_name: string;
  email: string;
  gender: string | null;
  age: number | null;
  city: string | null;
  looking_for_gender: string | null;
  height: number | null;
  desired_age_min: number | null;
  desired_age_max: number | null;
  age_flexibility: string | null;
  desired_height_min: number | null;
  desired_height_max: number | null;
  height_flexibility: string | null;
  desired_location_range: string | null;
  cognitive_score: number | null;
  created_at: string;
  test_user_type: string | null;
  is_matchable: boolean;
  in_matching_pool: boolean;
  user_status: string | null;
  // Chat
  chat_count: number;
  chat_closed: boolean;
  summary_fields: number;
  cog_count: number;
  cog_closed: boolean;
  taste_count: number;
  taste_closed: boolean;
  // Analysis
  analysis_run_count: number;
  analysis_completed: boolean;
  has_manual_insights: boolean;
  // Login
  total_visits: number;
  first_visit: string | null;
  last_visit: string | null;
  // Email
  last_email_subject: string | null;
  last_email_sent: string | null;
  emails: { subject: string; sent_at: string }[];
  email_updates: boolean;
  // Activity
  last_activity: string | null;
  // Pipeline
  admin_contacted: boolean;
  admin_processing_done: boolean;
  admin_processing_done_at: string | null;
  admin_checklist: Record<string, boolean>;
  partner_in_system: boolean;
  couple_handled_at: string | null;
  admin_notes: string;
  admin_location_override: string | null;
  pool_email_pending: boolean;
  partner_name: string | null;
  photo_count: number;
  has_profile_details: boolean;
}

type Stage = "new" | "in_process" | "completed_partial" | "completed_all" | "ready_pool" | "auto_pool" | "pool" | "couples" | "couples_done";

function getStage(u: PipelineUser): Stage {
  if (u.test_user_type === "Couple Tester" && !u.in_matching_pool) {
    if (u.admin_contacted) {
      // If there's new activity after being marked as done, move back to active couples
      if (u.couple_handled_at && u.last_activity && u.last_activity > u.couple_handled_at) {
        return "couples";
      }
      return "couples_done";
    }
    return "couples";
  }
  if (u.in_matching_pool && u.pool_email_pending) return "auto_pool";
  if (u.in_matching_pool) return "pool";
  if (u.admin_processing_done) return "ready_pool";
  if (u.chat_closed) {
    const allDone = u.chat_closed && u.cog_closed && u.taste_closed;
    return allDone ? "completed_all" : "completed_partial";
  }
  if (u.admin_contacted && !u.chat_closed) return "in_process";
  return "new";
}

function getCompletionSub(u: PipelineUser): string {
  const hasPhoto = u.photo_count >= 1;
  const hasDetails = u.has_profile_details;
  if (hasPhoto && hasDetails) return "תמונה + פרטים";
  if (hasPhoto) return "תמונה בלבד";
  if (hasDetails) return "פרטים בלבד";
  return "שיחות בלבד";
}

function getPoolSub(u: PipelineUser): { label: string; color: string } {
  const allChannels = u.chat_closed && u.cog_closed && u.taste_closed;
  const hasPhoto = u.photo_count >= 1;
  if (allChannels && hasPhoto) return { label: "✓ תהליך מלא", color: "#16a34a" };
  const issues: string[] = [];
  if (!allChannels) issues.push("חסרים ערוצים");
  if (!hasPhoto) issues.push("ללא תמונה");
  return { label: "⚠ " + issues.join(" + "), color: "#d97706" };
}

function isUserIncomplete(u: { chat_closed?: boolean; cog_closed?: boolean; taste_closed?: boolean; photo_count?: number }): boolean {
  return !(u.chat_closed && u.cog_closed && u.taste_closed) || (u.photo_count ?? 0) < 1;
}

const STAGE_CONFIG: { key: Stage; title: string; color: string; bg: string }[] = [
  { key: "new", title: "משתמשים חדשים", color: "#7c3aed", bg: "#f5f3ff" },
  { key: "couples", title: "זוגות לטיפול", color: "#ec4899", bg: "#fdf2f8" },
  { key: "completed_all", title: "השלימו את כל התהליך", color: "#0ea5e9", bg: "#f0f9ff" },
  { key: "completed_partial", title: "כמעט השלימו (חסרים ערוצים)", color: "#38bdf8", bg: "#f0f9ff" },
  { key: "ready_pool", title: "מוכנים למאגר", color: "#16a34a", bg: "#f0fdf4" },
  { key: "auto_pool", title: "📬 נכנסו אוטומטית למאגר — ממתינים למייל", color: "#7c3aed", bg: "#f5f3ff" },
  { key: "pool", title: "במאגר", color: "#059669", bg: "#ecfdf5" },
  { key: "in_process", title: "בתהליך (לא דורשים טיפול)", color: "#d97706", bg: "#fffbeb" },
  { key: "couples_done", title: "זוגות — לא דורשים טיפול", color: "#f9a8d4", bg: "#fdf2f8" },
];

// ── Email Templates ──────────────────────────────────────────────

function buildWelcomeEmail(name: string, isFemale: boolean): { subject: string; html: string } {
  const g = (m: string, f: string) => isFemale ? f : m;
  return {
    subject: `${g("ברוך הבא", "ברוכה הבאה")} ל-One`,
    html: wrapEmail(`
<p>היי,</p>
<p>${g("ברוך הבא", "ברוכה הבאה")} ל-One, ${g("שמחים שהצטרפת", "שמחים שהצטרפת")} אלינו 🤍</p>
<p>ברגע ש${g("תשלים", "תשלימי")} את השיחה עם הצ׳אט שלנו, נוכל להתחיל לעבוד על הניתוח האישי ${g("שלך", "שלך")} — להבין טוב יותר מי ${g("אתה", "את")}, מה חשוב ${g("לך", "לך")} בקשר, ואיזה סוג חיבור באמת יכול ${g("להתאים לך", "להתאים לך")}.</p>
<p>אנחנו נמצאים עכשיו בשלב שבו One מתרחבת ואוספת משתמשים ראשונים למאגר. ככל שיותר אנשים יצטרפו וישלימו את התהליך, נוכל להתחיל לחפש התאמות מדויקות יותר — ומקווים שבקרוב נגיע גם ל-One ${g("שלך", "שלך")}.</p>
${emailBtn("להמשך תהליך ההיכרות")}
<p>${g("שמחים שאתה כאן", "שמחים שאת כאן")},<br>צוות One</p>`),
  };
}

function buildPoolEmail(name: string, isFemale: boolean): { subject: string; html: string } {
  const g = (m: string, f: string) => isFemale ? f : m;
  return {
    subject: `הניתוח ${g("שלך", "שלך")} ב-One הושלם`,
    html: wrapEmail(`
<p>היי,</p>
<p>${g("ברוך הבא", "ברוכה הבאה")} ל-One, ${g("שמחים שהצטרפת", "שמחים שהצטרפת")} אלינו.</p>
<p>הניתוח האישי ${g("שלך", "שלך")} הושלם, והוא זמין ${g("עבורך", "עבורך")} כעת בתוך המערכת.</p>
<p>הניתוח מבוסס על השיחה ש${g("קיימת", "קיימת")} עם One, ונועד לשקף תובנות ראשוניות על סגנון הקשר ${g("שלך", "שלך")}, ההעדפות המרכזיות ${g("שלך", "שלך")}, והמאפיינים שעשויים להיות משמעותיים ${g("עבורך", "עבורך")} בהתאמה זוגית.</p>
<p>בשלב זה ${g("נכנסת", "נכנסת")} למאגר ההתאמות שלנו.<br>One נמצאת כעת בתהליך התרחבות ואיסוף משתמשים נוספים, וככל שהמאגר יגדל — נוכל לאתר התאמות מדויקות ורלוונטיות יותר.</p>
<p>כדי שנוכל להציג ${g("לך", "לך")} ולצד השני הסבר אישי על ההתאמה כשנמצא אותה, יש לאשר את בניית <strong>כרטיס ההתאמה</strong> ${g("שלך", "שלך")} במערכת. הסבר מלא ואפשרות אישור מחכים ${g("לך", "לך")} בתוך האפליקציה.</p>
${emailBtn(`${g("כנס", "כנסי")} למערכת לאישור`)}
<p>מקווים למצוא ${g("לך", "לך")} את ה-One ${g("שלך", "שלך")} בקרוב.</p>
<p>בברכה,<br>צוות One</p>
<p style="margin-top:16px;font-size:13px;color:#888">לנוחותך, ניתן להיכנס למערכת גם דרך:<br><a href="https://joinone.io" style="color:#7b5fa3">joinone.io</a></p>`),
  };
}

function buildReminderEmail(name: string, isFemale: boolean): { subject: string; html: string } {
  const g = (m: string, f: string) => isFemale ? f : m;
  return {
    subject: "תזכורת ממערכת One",
    html: wrapEmail(`
<p>היי,</p>
<p>שמנו לב שהתחלת את תהליך ההיכרות עם One אבל עדיין לא ${g("השלמת", "השלמת")} את כל השלבים.</p>
<p>ככל שנכיר אותך לעומק — דרך שיחת החשיבה ומבחן הטעם — כך נוכל לדייק את הניתוח ולמצוא ${g("לך", "לך")} התאמה טובה יותר.</p>
<p>זה לוקח רק כמה דקות, ואפשר להמשיך מאיפה ש${g("הפסקת", "הפסקת")}.</p>
${emailBtn("להמשך התהליך")}
<p>מחכים ${g("לך", "לך")},<br>צוות One</p>`),
  };
}

function buildCoupleEmail(name: string, isFemale: boolean): { subject: string; html: string } {
  const g = (m: string, f: string) => isFemale ? f : m;
  return {
    subject: "תודה על ההשתתפות ב-One",
    html: wrapEmail(`
<p>היי${name ? " " + name : ""},</p>
<p>תודה רבה על הסיוע באימון המערכת של One 🤍</p>
<p>בעזרתכם נוכל לדייק התאמות ולמצוא חיבורים טובים יותר למי שעוד לא מצא את האחד או האחת שלו.</p>
<p>התובנות האישיות ${g("שלך", "שלך")} זמינות ${g("לך", "לך")} בתוך המערכת — ${g("מוזמן", "מוזמנת")} להיכנס ולקרוא אותן.</p>
${emailBtn("לצפייה בתובנות")}
<p>תודה רבה,<br>צוות One</p>`),
  };
}

function emailBtn(text: string) {
  return `<p style="margin:28px 0"><a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${text}</a></p>`;
}

function wrapEmail(inner: string) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#333;max-width:500px">${inner}</div>`;
}

// ── System Message Templates (for no-email users) ───────────────

function buildWelcomeMessage(isFemale: boolean): string {
  const g = (m: string, f: string) => isFemale ? f : m;
  return `היי, ${g("ברוך הבא", "ברוכה הבאה")} ל-One! ברגע ש${g("תשלים", "תשלימי")} את השיחה, נתחיל לעבוד על הניתוח האישי ${g("שלך", "שלך")}. ככל שיותר אנשים יצטרפו, נוכל למצוא התאמות מדויקות יותר. ${g("שמחים שאתה כאן", "שמחים שאת כאן")} — צוות One`;
}

function buildPoolMessage(isFemale: boolean): string {
  const g = (m: string, f: string) => isFemale ? f : m;
  return `הניתוח האישי ${g("שלך", "שלך")} הושלם והוא זמין בתוך המערכת. ${g("נכנסת", "נכנסת")} למאגר ההתאמות שלנו — ככל שהמאגר יגדל, נוכל לאתר התאמות מדויקות יותר.\n\nכדי שנוכל להציג ${g("לך", "לך")} הסבר אישי על ההתאמה כשנמצא אותה, יש לאשר את בניית כרטיס ההתאמה ${g("שלך", "שלך")} במערכת.\n\nמקווים למצוא ${g("לך", "לך")} את ה-One ${g("שלך", "שלך")} בקרוב! — צוות One`;
}

function buildCoupleMessage(isFemale: boolean): string {
  return `תודה רבה על הסיוע באימון המערכת של One. התובנות האישיות זמינות בתוך המערכת — ${isFemale ? "מוזמנת" : "מוזמן"} להיכנס ולקרוא אותן. — צוות One`;
}

// ── Main Component ───────────────────────────────────────────────

export default function AdminPipeline({ onSelectUser }: { onSelectUser?: (userId: number) => void }) {
  const [users, setUsers] = useState<PipelineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<Stage, boolean>>({
    new: true, couples: true, couples_done: true, in_process: true, completed_all: true, completed_partial: true, ready_pool: true, auto_pool: false, pool: true,
  });

  const [answeredQuestions, setAnsweredQuestions] = useState<any[]>([]);
  const [matchRatings, setMatchRatings] = useState<any[]>([]);
  const [sendingRating, setSendingRating] = useState<number | null>(null);

  useEffect(() => { loadData(); loadAnsweredQuestions(); loadMatchRatings(); }, []);

  function loadData() {
    setLoading(true);
    apiFetch("/admin/user-management")
      .then(r => r.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }

  function loadAnsweredQuestions() {
    apiFetch("/admin/system-questions/pending")
      .then(r => r.json())
      .then(data => setAnsweredQuestions(Array.isArray(data) ? data : []));
  }

  async function markQuestionSeen(qId: number) {
    await apiFetch(`/admin/system-questions/${qId}/mark-seen`, { method: "POST" });
    loadAnsweredQuestions();
  }

  function loadMatchRatings() {
    apiFetch("/admin/match-ratings/pending")
      .then(r => r.json())
      .then(data => setMatchRatings(Array.isArray(data) ? data : []));
  }

  async function sendMatchForRating(matchId: number, targetUserId: number) {
    setSendingRating(matchId);
    try {
      const r = await apiFetch(`/admin/matches/${matchId}/send-for-rating`, {
        method: "POST",
        body: JSON.stringify({ user_id: targetUserId }),
      });
      if (!r.ok) { const j = await r.json(); alert(j.error || "Failed"); }
      loadMatchRatings();
    } catch { alert("Network error"); }
    setSendingRating(null);
  }

  async function pipelineAction(userId: number, action: string) {
    await apiFetch(`/admin/users/${userId}/pipeline-action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    loadData();
  }

  async function updateChecklist(userId: number, key: string, value: boolean) {
    await apiFetch(`/admin/users/${userId}/update-checklist`, {
      method: "POST",
      body: JSON.stringify({ key, value }),
    });
    loadData();
  }

  // Group users by stage
  const grouped: Record<Stage, PipelineUser[]> = { new: [], couples: [], couples_done: [], in_process: [], completed_all: [], completed_partial: [], ready_pool: [], auto_pool: [], pool: [] };
  for (const u of users) {
    const stage = getStage(u);
    grouped[stage].push(u);
  }

  if (loading) return <p style={{ padding: 20, color: "#888" }}>טוען...</p>;

  return (
    <div style={{ padding: "0 0 20px" }}>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {STAGE_CONFIG.map(s => (
          <div key={s.key} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 10, padding: "8px 16px", minWidth: 100, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{grouped[s.key].length}</div>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 500 }}>{s.title}</div>
          </div>
        ))}
      </div>

      {/* Match ratings */}
      {matchRatings.length > 0 && (
        <div style={{ background: "#f5f0fb", border: "1px solid #c4b5fd", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#5b21b6", marginBottom: 12 }}>💜 דירוגי התאמה ({matchRatings.length})</div>
          {matchRatings.map((m: any) => {
            const ratingLabel = (r: string | null) => {
              if (!r) return "—";
              if (r === "bullseye") return "✅ בול";
              if (r === "possible") return "🟡 אפשרי";
              if (r === "miss") return "❌ לא";
              if (r === "known_person") return "👤 מכיר/ה";
              return r;
            };
            const statusLabel = m.status === "waiting_second_rating" ? "ממתין לצד השני"
              : m.status === "approved_by_both" ? "שניהם אישרו"
              : m.status === "rejected_by_users" ? "נדחה"
              : m.status === "rejected_acquaintance" ? "מכיר/ה"
              : m.status;
            const statusColor = m.status === "approved_by_both" ? "#16a34a"
              : m.status === "rejected_by_users" || m.status === "rejected_acquaintance" ? "#dc2626"
              : "#d97706";

            // For waiting_second_rating: find who hasn't rated yet
            const needsSecondRating = m.status === "waiting_second_rating";
            const secondRaterId = !m.user1_rating ? m.user1_id : !m.user2_rating ? m.user2_id : null;
            const secondRaterName = secondRaterId === m.user1_id ? m.user1_name : m.user2_name;

            return (
              <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e9e0f5", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, color: "#1e1b4b", cursor: "pointer", textDecoration: "underline" }} onClick={() => onSelectUser?.(m.user1_id)}>{m.user1_name}</span>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>↔</span>
                <span style={{ fontWeight: 600, color: "#1e1b4b", cursor: "pointer", textDecoration: "underline" }} onClick={() => onSelectUser?.(m.user2_id)}>{m.user2_name}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {m.user1_name}: {ratingLabel(m.user1_rating)} | {m.user2_name}: {ratingLabel(m.user2_rating)}
                </span>
                <span style={{ fontWeight: 600, color: statusColor, fontSize: 13 }}>{statusLabel}</span>
                {needsSecondRating && secondRaterId && !m.sent_for_rating_to && (
                  <button
                    disabled={sendingRating === m.id}
                    onClick={() => sendMatchForRating(m.id, secondRaterId)}
                    style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid #7c3aed", background: "#fff", color: "#5b21b6", fontSize: 12, cursor: sendingRating === m.id ? "wait" : "pointer", fontWeight: 600 }}
                  >
                    {sendingRating === m.id ? "..." : `שלח לדירוג ל${secondRaterName}`}
                  </button>
                )}
                {needsSecondRating && m.sent_for_rating_to && (
                  <span style={{ fontSize: 11, color: "#7c3aed" }}>📩 נשלח ל{m.sent_for_rating_to === m.user1_id ? m.user1_name : m.user2_name}</span>
                )}
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(m.updated_at).toLocaleString("he-IL")}</span>
                <button
                  onClick={async (e) => {
                    (e.target as HTMLButtonElement).disabled = true;
                    await apiFetch(`/admin/matches/${m.id}/mark-rating-seen`, { method: "POST" });
                    loadMatchRatings();
                  }}
                  style={{ padding: "2px 10px", borderRadius: 4, border: "1px solid #c4b5fd", background: "#fff", color: "#5b21b6", fontSize: 11, cursor: "pointer", fontWeight: 500 }}
                >ראיתי</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Answered system questions */}
      {answeredQuestions.length > 0 && (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#92400e", marginBottom: 12 }}>📩 תשובות לשאלות מערכת ({answeredQuestions.length})</div>
          {answeredQuestions.map((q: any) => (
            <div key={q.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #fde68a", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "#1e1b4b", cursor: "pointer", textDecoration: "underline" }} onClick={() => onSelectUser?.(q.user_id)}>{q.first_name}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>"{q.question_text}"</span>
              <span style={{ fontWeight: 700, color: q.answer === "לא" ? "#dc2626" : q.answer === "אפשרי" ? "#d97706" : "#16a34a", fontSize: 14 }}>{q.answer}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(q.answered_at).toLocaleString("he-IL")}</span>
              <button onClick={() => markQuestionSeen(q.id)} style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid #d97706", background: "#fff", color: "#92400e", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>ראיתי</button>
            </div>
          ))}
        </div>
      )}

      {/* Stages */}
      {STAGE_CONFIG.map(stageConf => (
        <PipelineStageSection
          key={stageConf.key}
          config={stageConf}
          users={grouped[stageConf.key]}
          collapsed={collapsed[stageConf.key]}
          onToggle={() => setCollapsed(c => ({ ...c, [stageConf.key]: !c[stageConf.key] }))}
          onPipelineAction={pipelineAction}
          onChecklistUpdate={updateChecklist}
          onReload={loadData}
          onSelectUser={onSelectUser}
        />
      ))}
    </div>
  );
}

// ── Stage Section ────────────────────────────────────────────────

function PipelineStageSection({
  config, users, collapsed, onToggle, onPipelineAction, onChecklistUpdate, onReload, onSelectUser,
}: {
  config: { key: Stage; title: string; color: string; bg: string };
  users: PipelineUser[];
  collapsed: boolean;
  onToggle: () => void;
  onPipelineAction: (userId: number, action: string) => void;
  onChecklistUpdate: (userId: number, key: string, value: boolean) => void;
  onReload: () => void;
  onSelectUser?: (userId: number) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          padding: "10px 16px", background: config.bg, borderRadius: 10,
          border: `1px solid ${config.color}30`,
        }}
      >
        <span style={{ fontSize: 16, transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: config.color }}>{config.title}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: "#fff", background: config.color,
          borderRadius: 20, padding: "2px 10px", minWidth: 20, textAlign: "center",
        }}>{users.length}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "8px 0" }}>
          {users.length === 0 && <p style={{ padding: "8px 16px", color: "#94a3b8", fontSize: 13 }}>אין משתמשים בשלב זה</p>}
          {config.key === "pool" ? (() => {
            const complete = users.filter(u => u.chat_closed && u.cog_closed && u.taste_closed && u.photo_count >= 1);
            const incomplete = users.filter(u => !(u.chat_closed && u.cog_closed && u.taste_closed && u.photo_count >= 1));
            const renderCards = (list: PipelineUser[]) => list.map(u => (
              <PipelineUserCard key={u.id} user={u} stage={config.key} stageColor={config.color}
                onPipelineAction={onPipelineAction} onChecklistUpdate={onChecklistUpdate} onReload={onReload} onSelectUser={onSelectUser} />
            ));
            return (
              <>
                {complete.length > 0 && (
                  <>
                    <div style={{ padding: "6px 16px", fontSize: 13, fontWeight: 700, color: "#16a34a", borderBottom: "1px solid #dcfce7", marginBottom: 4 }}>
                      ✓ תהליך מלא ({complete.length})
                    </div>
                    {renderCards(complete)}
                  </>
                )}
                {incomplete.length > 0 && (
                  <>
                    <div style={{ padding: "6px 16px", fontSize: 13, fontWeight: 700, color: "#d97706", borderBottom: "1px solid #fef3c7", marginTop: complete.length > 0 ? 12 : 0, marginBottom: 4 }}>
                      ⚠ חלקי — חסרים ערוצים / תמונה ({incomplete.length})
                    </div>
                    {renderCards(incomplete)}
                  </>
                )}
              </>
            );
          })() : users.map(u => (
            <PipelineUserCard
              key={u.id}
              user={u}
              stage={config.key}
              stageColor={config.color}
              onPipelineAction={onPipelineAction}
              onChecklistUpdate={onChecklistUpdate}
              onReload={onReload}
              onSelectUser={onSelectUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── User Card ────────────────────────────────────────────────────

function PipelineUserCard({
  user: u, stage, stageColor, onPipelineAction, onChecklistUpdate, onReload, onSelectUser,
}: {
  user: PipelineUser;
  stage: Stage;
  stageColor: string;
  onPipelineAction: (userId: number, action: string) => void;
  onChecklistUpdate: (userId: number, key: string, value: boolean) => void;
  onReload: () => void;
  onSelectUser?: (userId: number) => void;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [emailPreview, setEmailPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(u.admin_notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  const isFemale = u.gender === "woman";

  // Red highlight: activity after admin marked this user as done
  const isRedHighlight =
    ((stage === "ready_pool" || stage === "pool" || stage === "auto_pool") &&
      u.admin_processing_done_at && u.last_activity &&
      u.last_activity > u.admin_processing_done_at) ||
    (stage === "couples_done" &&
      u.couple_handled_at && u.last_activity &&
      u.last_activity > u.couple_handled_at);

  function loadTemplate() {
    const name = u.first_name || "";
    if (stage === "new") {
      const t = buildWelcomeEmail(name, isFemale);
      setEmailSubject(t.subject); setEmailHtml(t.html);
    } else if (stage === "ready_pool" || stage === "pool" || stage === "auto_pool") {
      const t = buildPoolEmail(name, isFemale);
      setEmailSubject(t.subject); setEmailHtml(t.html);
    } else if (stage === "couples") {
      const t = buildCoupleEmail(name, isFemale);
      setEmailSubject(t.subject); setEmailHtml(t.html);
    } else if (stage === "completed_all") {
      const t = buildPoolEmail(name, isFemale);
      setEmailSubject(t.subject); setEmailHtml(t.html);
    } else if (stage === "completed_partial") {
      const t = buildReminderEmail(name, isFemale);
      setEmailSubject(t.subject); setEmailHtml(t.html);
    } else {
      const t = buildWelcomeEmail(name, isFemale);
      setEmailSubject(t.subject); setEmailHtml(t.html);
    }
  }

  async function handleSendEmail() {
    setSending(true);
    setEmailError("");
    try {
      const res = await apiFetch(`/admin/users/${u.id}/send-email`, {
        method: "POST",
        body: JSON.stringify({ subject: emailSubject, html: emailHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        setSent(true);
        setTimeout(() => { setSent(false); setShowEmail(false); }, 2000);
        onReload();
      } else {
        setEmailError(data.error || "שגיאה בשליחה");
      }
    } catch (err: any) {
      setEmailError(err.message || "שגיאת רשת");
    } finally { setSending(false); }
  }

  async function handleSendMessage() {
    setMsgSending(true);
    try {
      await apiFetch(`/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ admin_message: msgText }),
      });
      setShowMessage(false);
      onReload();
    } finally { setMsgSending(false); }
  }

  async function handleReanalyze() {
    if (!confirm(`להריץ ניתוח מחדש עבור ${u.first_name}?`)) return;
    setReanalyzing(true);
    try {
      const res = await apiFetch(`/admin/users/${u.id}/reanalyze`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`ניתוח הושלם: ${data.internal_count || 0} internal + ${data.external_count || 0} external traits`);
        onChecklistUpdate(u.id, "analysis_run", true);
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } finally { setReanalyzing(false); onReload(); }
  }

  async function handleGenerateInsights() {
    if (!confirm(`להפיק תובנות AI עבור ${u.first_name}?`)) return;
    setGenerating(true);
    try {
      const res = await apiFetch(`/admin/users/${u.id}/generate-insights`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`תובנות הופקו בהצלחה!\n\nסיכום קצר:\n${data.summary_short}\n\nניתוח מלא:\n${(data.summary_full || "").slice(0, 300)}...`);
        onChecklistUpdate(u.id, "insights_entered", true);
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } finally { setGenerating(false); onReload(); }
  }

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 10,
    padding: "14px 18px",
    marginBottom: 8,
    border: isRedHighlight ? "2px solid #dc2626" : "1px solid #e5e7eb",
    fontSize: 13,
    ...(isRedHighlight ? { background: "#fef2f2" } : {}),
  };

  const labelStyle: React.CSSProperties = { fontSize: 11, color: "#64748b", fontWeight: 600 };
  const valStyle: React.CSSProperties = { fontSize: 13, color: "#334155" };
  const btnStyle = (color: string, disabled = false): React.CSSProperties => ({
    padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: disabled ? "default" : "pointer",
    background: disabled ? "#e5e7eb" : color, color: "#fff", border: "none", borderRadius: 6,
    opacity: disabled ? 0.6 : 1,
  });
  const outlineBtnStyle = (color: string): React.CSSProperties => ({
    padding: "4px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
    background: "#fff", color, border: `1px solid ${color}`, borderRadius: 6,
  });

  return (
    <div style={cardStyle}>
      {/* Header row */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: stageColor, cursor: "pointer", textDecoration: "underline" }} onClick={() => onSelectUser?.(u.id)}>{u.first_name || "ללא שם"}</span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{u.email}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>#{u.id}</span>
        {u.gender && <span style={{ fontSize: 11, color: "#64748b" }}>{u.gender === "woman" ? "👩" : "👨"}</span>}
        {u.age && <span style={{ fontSize: 11, color: "#64748b" }}>גיל {u.age}</span>}
        {u.city && <span style={{ fontSize: 11, color: "#64748b" }}>{u.city}</span>}
        {isRedHighlight && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>⚠️ פעילות חדשה</span>}
      </div>

      {/* Info row */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
        {(stage === "in_process" || stage === "completed_all" || stage === "completed_partial" || stage === "ready_pool" || stage === "auto_pool" || stage === "pool" || stage === "couples_done") && (
          <>
            <div><span style={labelStyle}>כניסה אחרונה</span><br/><span style={valStyle}>{fmtTimeAgo(u.last_visit)}</span></div>
            <div><span style={labelStyle}>עדכון אחרון</span><br/><span style={valStyle}>{fmtTimeAgo(u.last_activity)}</span></div>
          </>
        )}
        {stage === "new" && (
          <div><span style={labelStyle}>הצטרפות</span><br/><span style={valStyle}>{fmtDate(u.created_at)}</span></div>
        )}
        {(stage === "completed_all" || stage === "completed_partial") && (
          <>
            <div><span style={labelStyle}>סטטוס</span><br/><span style={{ fontSize: 12, color: "#0ea5e9", fontWeight: 600 }}>{getCompletionSub(u)}</span></div>
            <div>
              <span style={labelStyle}>ערוצים</span><br/>
              <span style={{ fontSize: 11 }}>
                <span style={{ color: u.chat_closed ? "#16a34a" : "#dc2626" }}>{u.chat_closed ? "✓" : "✗"} כללי</span>{" "}
                <span style={{ color: u.cog_closed ? "#16a34a" : "#dc2626" }}>{u.cog_closed ? "✓" : "✗"} קוגניטיבי</span>{" "}
                <span style={{ color: u.taste_closed ? "#16a34a" : "#dc2626" }}>{u.taste_closed ? "✓" : "✗"} טעם</span>
              </span>
            </div>
          </>
        )}
        {(stage === "pool" || stage === "auto_pool") && (() => {
          const sub = getPoolSub(u);
          return (
            <>
              <div><span style={labelStyle}>סטטוס</span><br/><span style={{ fontSize: 12, color: sub.color, fontWeight: 600 }}>{sub.label}</span></div>
              {!(u.chat_closed && u.cog_closed && u.taste_closed) && (
                <div>
                  <span style={labelStyle}>ערוצים</span><br/>
                  <span style={{ fontSize: 11 }}>
                    <span style={{ color: u.chat_closed ? "#16a34a" : "#dc2626" }}>{u.chat_closed ? "✓" : "✗"} כללי</span>{" "}
                    <span style={{ color: u.cog_closed ? "#16a34a" : "#dc2626" }}>{u.cog_closed ? "✓" : "✗"} קוגניטיבי</span>{" "}
                    <span style={{ color: u.taste_closed ? "#16a34a" : "#dc2626" }}>{u.taste_closed ? "✓" : "✗"} טעם</span>
                  </span>
                </div>
              )}
            </>
          );
        })()}
        {(stage === "couples" || stage === "couples_done") && u.partner_name && (
          <div><span style={labelStyle}>בן/בת זוג</span><br/><span style={valStyle}>{u.partner_name}</span></div>
        )}
        {/* Chat status for relevant stages */}
        {(stage === "new" || stage === "in_process" || stage === "couples" || stage === "couples_done") && (
          <>
            <div>
              <span style={labelStyle}>צ׳אט</span><br/>
              <span style={{ fontSize: 12, color: u.chat_closed ? "#16a34a" : u.chat_count > 0 ? "#d97706" : "#dc2626", fontWeight: 600 }}>
                {u.chat_closed ? "הושלם" : u.chat_count > 0 ? `${u.chat_count} הודעות` : "לא התחיל"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Matching filter details — ready_pool & pool */}
      {(stage === "ready_pool" || stage === "pool" || stage === "auto_pool" || stage === "completed_all") && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontSize: 11, color: "#64748b" }}>
          <span>מחפש/ת: <b style={{ color: u.looking_for_gender ? "#0f172a" : "#dc2626" }}>{u.looking_for_gender === "woman" ? "נשים" : u.looking_for_gender === "man" ? "גברים" : u.looking_for_gender === "both" ? "גם וגם" : u.looking_for_gender === "doesnt_matter" ? "לא משנה" : "חסר"}</b></span>
          <span>גובה: <b style={{ color: u.height ? "#0f172a" : "#dc2626" }}>{u.height ? `${u.height} ס״מ` : "חסר"}</b></span>
          <span>טווח גילאים: <b style={{ color: (u.desired_age_min != null) ? "#0f172a" : "#dc2626" }}>{u.desired_age_min != null ? `${u.desired_age_min}–${u.desired_age_max}` : "חסר"}</b>{u.age_flexibility ? ` (${u.age_flexibility === "not_flexible" ? "לא גמיש" : u.age_flexibility === "slightly_flexible" ? "קצת גמיש" : "גמיש"})` : ""}</span>
          <span>טווח גובה: <b style={{ color: (u.desired_height_min != null) ? "#0f172a" : "#dc2626" }}>{u.desired_height_min != null ? `${u.desired_height_min}–${u.desired_height_max}` : "חסר"}</b>{u.height_flexibility ? ` (${u.height_flexibility === "not_flexible" ? "לא גמיש" : u.height_flexibility === "slightly_flexible" ? "קצת גמיש" : "גמיש"})` : ""}</span>
          <span>מיקום: <b style={{ color: u.desired_location_range ? "#0f172a" : "#dc2626" }}>{u.desired_location_range === "my_city" ? "לא יוצא מהעיר" : u.desired_location_range === "my_area" ? "באזור שלי" : u.desired_location_range === "bit_further" ? "מוכן לנסוע קצת" : u.desired_location_range === "whole_country" ? "כל הארץ" : u.desired_location_range || "חסר"}</b>
            {u.desired_location_range && u.desired_location_range !== "whole_country" && (
              <select
                value={u.admin_location_override || ""}
                onChange={async (e) => {
                  const val = e.target.value || null;
                  await apiFetch(`/admin/users/${u.id}`, { method: "PATCH", headers: { "x-admin-key": "admin-secret-key-2026" }, body: JSON.stringify({ admin_location_override: val }) });
                  onReload();
                }}
                style={{ marginRight: 4, fontSize: 10, padding: "1px 4px", border: "1px solid #cbd5e1", borderRadius: 4, background: u.admin_location_override ? "#fef3c7" : "#fff" }}
              >
                <option value="">ללא הרחבה</option>
                {u.desired_location_range === "my_city" && <option value="my_area">→ באזור</option>}
                {(u.desired_location_range === "my_city" || u.desired_location_range === "my_area") && <option value="bit_further">→ קצת נסיעה</option>}
                <option value="whole_country">→ כל הארץ</option>
              </select>
            )}
          </span>
          <span>קוגניטיבי: <b style={{ color: u.cognitive_score != null ? "#0f172a" : "#94a3b8" }}>{u.cognitive_score != null ? u.cognitive_score : "—"}</b></span>
        </div>
      )}

      {/* Email/message status */}
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
        {!u.email_updates ? (
          <span style={{ color: "#7c3aed" }}>📵 לא מקבל/ת מיילים — הודעות מערכת</span>
        ) : u.emails && u.emails.length > 0 ? (
          u.emails.map((e, i) => (
            <span key={i} style={{ marginLeft: i > 0 ? 12 : 0 }}>
              📧 {e.subject} <span style={{ color: "#94a3b8" }}>({fmtDateTime(e.sent_at)})</span>
              {i < u.emails.length - 1 && " | "}
            </span>
          ))
        ) : (
          <span style={{ color: "#94a3b8" }}>לא נשלחו מיילים</span>
        )}
      </div>

      {/* Admin notes */}
      <div style={{ marginBottom: 8 }}>
        {editingNotes ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
              style={{ flex: 1, fontSize: 12, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, resize: "vertical", minHeight: 40, direction: "rtl", boxSizing: "border-box" }}
              placeholder="הערות..." />
            <button disabled={savingNotes} onClick={async () => {
              setSavingNotes(true);
              await apiFetch(`/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ admin_notes: notesText }) });
              setSavingNotes(false); setEditingNotes(false); onReload();
            }} style={{ fontSize: 11, padding: "4px 12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
              {savingNotes ? "..." : "שמור"}
            </button>
            <button onClick={() => { setEditingNotes(false); setNotesText(u.admin_notes || ""); }}
              style={{ fontSize: 11, padding: "4px 8px", background: "none", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", color: "#64748b" }}>ביטול</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {u.admin_notes ? (
              <span style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>📝 {u.admin_notes}</span>
            ) : null}
            <button onClick={() => setEditingNotes(true)}
              style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              {u.admin_notes ? "ערוך הערה" : "📝 הוסף הערה"}
            </button>
          </div>
        )}
      </div>

      {/* Checklist for stage 3 */}
      {(stage === "completed_all" || stage === "completed_partial") && (
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={!!u.admin_checklist?.analysis_run} onChange={e => onChecklistUpdate(u.id, "analysis_run", e.target.checked)} />
            הורץ ניתוח
          </label>
          <label style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={!!u.admin_checklist?.insights_entered} onChange={e => onChecklistUpdate(u.id, "insights_entered", e.target.checked)} />
            הוזנו תובנות
          </label>
          <label style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={!!u.admin_checklist?.email_sent} onChange={e => onChecklistUpdate(u.id, "email_sent", e.target.checked)} />
            נשלח מייל
          </label>
        </div>
      )}

      {/* Checklist for stage 4 */}
      {stage === "ready_pool" && (
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: u.photo_count >= 1 ? "#16a34a" : "#dc2626" }}>
            {u.photo_count >= 1 ? `📷 ${u.photo_count} תמונות` : "📷 ללא תמונה"}
          </span>
          {u.photo_count >= 1 && (
            <label style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={!!u.admin_checklist?.external_analysis} onChange={e => onChecklistUpdate(u.id, "external_analysis", e.target.checked)} />
              ניתוח חיצוני
            </label>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>

        {/* Stage 1: New — email/message + mark contacted */}
        {stage === "new" && (
          <>
            {u.email_updates ? (
              <button style={outlineBtnStyle("#0ea5e9")} onClick={() => { setShowEmail(true); loadTemplate(); }}>📧 שלח מייל</button>
            ) : (
              <button style={outlineBtnStyle("#7c3aed")} onClick={() => { setMsgText(buildWelcomeMessage(isFemale)); setShowMessage(true); }}>💬 כתוב הודעה</button>
            )}
            <button style={btnStyle("#7c3aed")} onClick={() => onPipelineAction(u.id, "mark_contacted")}>✓ סומן כנשלח</button>
          </>
        )}

        {/* In process — manual move to completed */}
        {stage === "in_process" && (
          <button style={btnStyle("#0ea5e9")} onClick={() => onPipelineAction(u.id, "mark_completed")}>↑ העבר ל"השלימו"</button>
        )}

        {/* Completed all — full treatment: email, reanalyze, insights, mark done */}
        {stage === "completed_all" && (
          <>
            {u.email_updates ? (
              <button style={outlineBtnStyle("#0ea5e9")} onClick={() => { setShowEmail(true); loadTemplate(); }}>📧 שלח מייל כניסה למאגר</button>
            ) : (
              <button style={outlineBtnStyle("#7c3aed")} onClick={() => { setMsgText(buildPoolMessage(isFemale)); setShowMessage(true); }}>💬 הודעת כניסה למאגר</button>
            )}
            <button style={outlineBtnStyle("#f59e0b")} onClick={handleReanalyze} disabled={reanalyzing}>
              {reanalyzing ? "מנתח..." : "🔄 הרץ ניתוח"}
            </button>
            <button style={outlineBtnStyle("#8b5cf6")} onClick={handleGenerateInsights} disabled={generating}>
              {generating ? "מפיק..." : "✨ הפק תובנות"}
            </button>
            <button style={btnStyle("#16a34a")} onClick={() => onPipelineAction(u.id, "mark_done")}>✓ סיימתי טיפול</button>
          </>
        )}

        {/* Completed partial — reanalyze + insights + pool entry */}
        {stage === "completed_partial" && (
          <>
            <button style={outlineBtnStyle("#f59e0b")} onClick={handleReanalyze} disabled={reanalyzing}>
              {reanalyzing ? "מנתח..." : "🔄 הרץ ניתוח"}
            </button>
            <button style={outlineBtnStyle("#8b5cf6")} onClick={handleGenerateInsights} disabled={generating}>
              {generating ? "מפיק..." : "✨ הפק תובנות"}
            </button>
            {u.email_updates ? (
              <button style={outlineBtnStyle("#0ea5e9")} onClick={() => { setShowEmail(true); loadTemplate(); }}>📧 שלח מייל תזכורת</button>
            ) : (
              <button style={outlineBtnStyle("#7c3aed")} onClick={() => { setMsgText(buildWelcomeMessage(isFemale)); setShowMessage(true); }}>💬 כתוב הודעה</button>
            )}
            <button style={btnStyle("#16a34a")} onClick={() => onPipelineAction(u.id, "mark_done")}>✓ סיימתי טיפול</button>
            <button style={btnStyle("#059669")} onClick={() => onPipelineAction(u.id, "enter_pool")}>🏊 כניסה למאגר</button>
          </>
        )}

        {/* Stage 4: Ready for pool — enter pool */}
        {stage === "ready_pool" && (
          <>
            <button style={btnStyle("#059669")} onClick={() => onPipelineAction(u.id, "enter_pool")}>🏊 כניסה למאגר</button>
            {u.email_updates ? (
              <button style={outlineBtnStyle("#0ea5e9")} onClick={() => { setShowEmail(true); loadTemplate(); }}>📧 שלח מייל</button>
            ) : (
              <button style={outlineBtnStyle("#7c3aed")} onClick={() => { setMsgText(buildPoolMessage(isFemale)); setShowMessage(true); }}>💬 כתוב הודעה</button>
            )}
          </>
        )}

        {/* Auto pool — pending email: send pool email + mark done */}
        {stage === "auto_pool" && (
          <>
            {u.email_updates ? (
              <button style={outlineBtnStyle("#0ea5e9")} onClick={() => { setShowEmail(true); loadTemplate(); }}>📧 שלח מייל כניסה למאגר</button>
            ) : (
              <button style={outlineBtnStyle("#7c3aed")} onClick={() => { setMsgText(buildPoolMessage(isFemale)); setShowMessage(true); }}>💬 הודעת כניסה למאגר</button>
            )}
            <button style={btnStyle("#16a34a")} onClick={() => onPipelineAction(u.id, "clear_pool_pending")}>✓ סיימתי טיפול</button>
          </>
        )}

        {/* Stage 6: Couples — email + partner toggle + mark contacted */}
        {stage === "couples" && (
          <>
            {u.email_updates ? (
              <button style={outlineBtnStyle("#ec4899")} onClick={() => { setShowEmail(true); loadTemplate(); }}>📧 שלח מייל</button>
            ) : (
              <button style={outlineBtnStyle("#7c3aed")} onClick={() => { setMsgText(buildCoupleMessage(isFemale)); setShowMessage(true); }}>💬 כתוב הודעה</button>
            )}
            <button
              style={u.partner_in_system ? btnStyle("#16a34a") : outlineBtnStyle("#64748b")}
              onClick={() => onPipelineAction(u.id, "toggle_partner")}
            >
              {u.partner_in_system ? "✓ בן/בת זוג במערכת" : "בן/בת זוג לא במערכת"}
            </button>
            <button style={btnStyle("#ec4899")} onClick={() => onPipelineAction(u.id, "mark_contacted")}>✓ סומן כטופל</button>
          </>
        )}
      </div>

      {/* Send question button — pool and ready_pool */}
      {(stage === "pool" || stage === "auto_pool" || stage === "ready_pool") && (
        <div style={{ marginTop: 6 }}>
          {!showQuestion ? (
            <button style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }} onClick={() => setShowQuestion(true)}>❓ שלח שאלה למשתמש</button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text" placeholder="טקסט השאלה..." value={questionText} onChange={e => setQuestionText(e.target.value)}
                style={{ flex: 1, minWidth: 200, padding: "6px 10px", fontSize: 12, border: "1px solid #c4b5fd", borderRadius: 6, direction: "rtl" }}
              />
              <button style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }} onClick={async () => {
                if (!questionText.trim()) return;
                await apiFetch(`/admin/users/${u.id}/system-question`, { method: "POST", body: JSON.stringify({ question_text: questionText }) });
                setQuestionText(""); setShowQuestion(false);
              }}>שלח</button>
              <button style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }} onClick={() => setShowQuestion(false)}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* Email Composer (inline) */}
      {showEmail && (
        <div style={{ marginTop: 12, padding: 14, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>To: {u.email}</span>
            <button style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }} onClick={() => setShowEmail(false)}>✕ סגור</button>
          </div>
          <input
            type="text" placeholder="נושא" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, marginBottom: 8, boxSizing: "border-box", direction: "rtl" }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button style={{ fontSize: 11, color: "#0ea5e9", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              onClick={() => setEmailPreview(!emailPreview)}>{emailPreview ? "ערוך" : "תצוגה מקדימה"}</button>
            <button style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              onClick={loadTemplate}>טען תבנית מחדש</button>
          </div>
          {emailPreview ? (
            <div style={{ width: "100%", minHeight: 160, padding: 12, fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", boxSizing: "border-box", overflow: "auto" }}
              dangerouslySetInnerHTML={{ __html: emailHtml }} />
          ) : (
            <textarea value={emailHtml} onChange={e => setEmailHtml(e.target.value)}
              style={{ width: "100%", minHeight: 160, padding: "8px 12px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }} />
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button onClick={handleSendEmail} disabled={sending || !emailSubject.trim() || !emailHtml.trim()}
              style={btnStyle("#0ea5e9", sending || !emailSubject.trim() || !emailHtml.trim())}>
              {sending ? "שולח..." : "שלח"}
            </button>
            {sent && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>✓ נשלח!</span>}
            {emailError && <span style={{ fontSize: 12, color: "#dc2626" }}>❌ {emailError}</span>}
          </div>
        </div>
      )}

      {/* Message Composer (for no-email users) */}
      {showMessage && (
        <div style={{ marginTop: 12, padding: 14, border: "1px solid #e2e8f0", borderRadius: 8, background: "#faf5ff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600 }}>הודעת מערכת ל{u.first_name}</span>
            <button style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }} onClick={() => setShowMessage(false)}>✕ סגור</button>
          </div>
          <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="כתוב הודעה שתוצג למשתמש במסך הבית..."
            style={{ width: "100%", minHeight: 80, padding: "8px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, resize: "vertical", boxSizing: "border-box", direction: "rtl" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button onClick={handleSendMessage} disabled={msgSending || !msgText.trim()} style={btnStyle("#7c3aed", msgSending || !msgText.trim())}>
              {msgSending ? "שומר..." : "שמור הודעה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) + " " +
    dt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function fmtTimeAgo(d: string | null): string {
  if (!d) return "אף פעם";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return fmtDate(d);
}
