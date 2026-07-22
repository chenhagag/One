import { useState, useEffect } from "react";
import { apiFetch } from "./lib/api";
import { trackPage } from "./lib/trackPage";

interface InsightsProps {
  user: { id: number; first_name: string; email: string };
  onBack: () => void;
  onOpenChat?: (initialMessage: string, channel: string) => void;
  initialView?: "main" | "mbti" | "values" | "bigfive" | "enneagram" | "attachment";
  resetKey?: number;
  adminViewing?: boolean;
}

interface DetailedProfile {
  mbti: {
    type: string | null;
    description: string | null;
    alternateType: string | null;
    alternateDescription: string | null;
    dimensions: Record<string, number | null>;
  };
  enneagram: {
    primaryType: number | null;
    primaryName: string | null;
    wing: number | null;
    typeLabel: string | null;
    description: string | null;
    allTypes: { type: number; name: string; score: number; description: string; relationship: string }[];
  };
  attachment: {
    dominant: string | null;
    dominantHe: string | null;
    description: string | null;
    relationship: string | null;
    styles: { name: string; he: string; score: number; description: string; relationship: string }[];
  };
  allValues: { name: string; he: string; score: number; description: string; relationship: string }[];
  allBigFive: { name: string; he: string; score: number; description: string; relationship: string }[];
}

// ── MBTI Compatibility Data ──
const MBTI_COMPATIBILITY: Record<string, { ideal: string[]; good: string[]; challenging: string[] }> = {
  INFP: { ideal: ["ENFJ", "ENTJ"], good: ["INFJ", "ENFP", "INTJ", "INTP"], challenging: ["ESTJ", "ESFJ", "ISTJ"] },
  ENFP: { ideal: ["INFJ", "INTJ"], good: ["ENFJ", "INFP", "ENTP", "INTP"], challenging: ["ISTJ", "ISFJ", "ESTJ"] },
  INFJ: { ideal: ["ENFP", "ENTP"], good: ["INFP", "INTJ", "ENFJ", "ISFJ"], challenging: ["ESTP", "ESFP", "ISTP"] },
  ENFJ: { ideal: ["INFP", "ISFP"], good: ["INFJ", "ENFP", "ENTJ", "ESFJ"], challenging: ["ISTP", "INTP", "ESTP"] },
  INTJ: { ideal: ["ENFP", "ENTP"], good: ["INFJ", "INFP", "ENTJ", "INTJ"], challenging: ["ESFP", "ESFJ", "ISFP"] },
  ENTJ: { ideal: ["INFP", "INTP"], good: ["INTJ", "ENFP", "ENFJ", "ENTP"], challenging: ["ISFP", "ISFJ", "ESFP"] },
  INTP: { ideal: ["ENTJ", "ESTJ"], good: ["INFP", "ENTP", "INTJ", "ENFP"], challenging: ["ESFJ", "ISFJ", "ESFP"] },
  ENTP: { ideal: ["INFJ", "INTJ"], good: ["ENFP", "INTP", "ENFJ", "ENTJ"], challenging: ["ISFJ", "ESFJ", "ISTJ"] },
  ISFJ: { ideal: ["ESFP", "ESTP"], good: ["ISTJ", "ISFP", "INFJ", "ESFJ"], challenging: ["ENTP", "ENFP", "INTP"] },
  ESFJ: { ideal: ["ISFP", "ISTP"], good: ["ISFJ", "ESFP", "ENFJ", "ESTJ"], challenging: ["INTP", "INTJ", "ENTP"] },
  ISTJ: { ideal: ["ESFP", "ESTP"], good: ["ISFJ", "ESTJ", "INTJ", "ISTP"], challenging: ["ENFP", "INFP", "ENTP"] },
  ESTJ: { ideal: ["ISFP", "ISTP"], good: ["ISTJ", "ESFJ", "ENTJ", "ESTJ"], challenging: ["INFP", "ENFP", "INFJ"] },
  ISFP: { ideal: ["ENFJ", "ESFJ", "ESTJ"], good: ["ISFJ", "INFP", "ESFP", "ISTP"], challenging: ["ENTJ", "INTJ", "ENTP"] },
  ESFP: { ideal: ["ISFJ", "ISTJ"], good: ["ESFJ", "ESTP", "ENFP", "ISFP"], challenging: ["INTJ", "INFJ", "INTP"] },
  ISTP: { ideal: ["ESFJ", "ESTJ"], good: ["ISFP", "ESTP", "ISTJ", "INTP"], challenging: ["ENFJ", "INFJ", "ENFP"] },
  ESTP: { ideal: ["ISFJ", "ISTJ"], good: ["ESFP", "ISTP", "ESTJ", "ENTP"], challenging: ["INFJ", "INFP", "ENFJ"] },
};

const MBTI_RELATIONSHIP_DETAIL: Record<string, string> = {
  INFP: "בזוגיות, INFP מחפש חיבור רגשי עמוק ואותנטיות מוחלטת. הוא זקוק לבן/בת זוג שמבין את עולמו הפנימי העשיר ומכבד את הצורך שלו במרחב. הוא נוטה להרמוניה אבל גם לאידיאליזם — מה שיכול ליצור מתח כשהמציאות לא עומדת בציפיות.",
  ENFP: "בזוגיות, ENFP מביא אנרגיה, יצירתיות והתלהבות. הוא מחפש עומק רגשי אבל גם ריגוש והרפתקה. הוא זקוק לבן/בת זוג שיתן לו מרחב להיות ספונטני, אבל גם יעגן אותו כשהוא מתפזר.",
  INFJ: "בזוגיות, INFJ מחפש חיבור עמוק ומשמעותי. הוא אינטואיטיבי ומבין את בן/בת הזוג לפני שהם מסבירים. הוא זקוק למישהו שמעריך את העומק שלו ולא נבהל מהרגישות.",
  ENFJ: "בזוגיות, ENFJ הוא שותף מסור שמשקיע עמוקות. הוא קורא אנשים מצוין ודואג שבן/בת הזוג ירגישו אהובים. האתגר שלו — לפעמים שם את הצרכים של השני לפני שלו.",
  INTJ: "בזוגיות, INTJ מחפש שותפות אינטלקטואלית. הוא נאמן ומחויב אבל לא מביע רגשות בקלות. הוא זקוק לבן/בת זוג שמעריך עצמאות ולא דורש הפגנות רגשיות תמידיות.",
  ENTJ: "בזוגיות, ENTJ מוביל ובונה. הוא מחויב ומשקיע אבל גם דורש. הוא זקוק לבן/בת זוג שמכבד את האמביציות שלו אבל גם יודע להאט אותו ולהזכיר שיש חיים מעבר להישגים.",
  INTP: "בזוגיות, INTP מביא נאמנות שקטה ועומק אינטלקטואלי. הוא לא הכי טבעי בביטוי רגשות אבל כשהוא אוהב — זה עמוק ואמיתי. הוא זקוק לבן/בת זוג סבלני שמבין שחוסר ביטוי לא אומר חוסר רגש.",
  ENTP: "בזוגיות, ENTP מביא ריגוש ודיונים אינסופיים. הוא מחפש שותף/ה שיאתגר אותו אינטלקטואלית. האתגר שלו — לפעמים מעדיף ויכוח על פני פשרה, וצריך ללמוד לשמוע גם כשלא מסכים.",
  ISFJ: "בזוגיות, ISFJ הוא שותף מסור ונאמן. הוא דואג לפרטים הקטנים ובונה בית חם. הוא זקוק לבן/בת זוג שמעריך את ההשקעה שלו ולא לוקח אותה כמובנת מאליה.",
  ESFJ: "בזוגיות, ESFJ מביא חמימות ותחושת שייכות. הוא מתמסר ומשקיע במערכת היחסים. האתגר שלו — לפעמים רגיש מדי לביקורת וזקוק לאישור שהוא עושה טוב.",
  ISTJ: "בזוגיות, ISTJ הוא סלע. אמין, עקבי ומחויב. הוא לא הכי ספונטני אבל אפשר לסמוך עליו בעיניים עצומות. הוא זקוק לבן/בת זוג שמעריך יציבות ולא צריך הפתעות כל יום.",
  ESTJ: "בזוגיות, ESTJ מוביל ומארגן. הוא שותף אמין שדואג שהכל עובד. האתגר שלו — לפעמים שולט מדי ושוכח לשאול מה בן/בת הזוג רוצה.",
  ISFP: "בזוגיות, ISFP מביא רגישות ותשומת לב. הוא חי לפי הערכים שלו ומחפש אותנטיות. הוא זקוק לבן/בת זוג שנותן מרחב ולא לוחץ מדי.",
  ESFP: "בזוגיות, ESFP מביא שמחת חיים ואנרגיה. הוא חי ברגע ומחפש חוויות משותפות. האתגר שלו — תכנון לטווח ארוך ושיחות קשות.",
  ISTP: "בזוגיות, ISTP מביא רוגע ופרקטיות. הוא לא מדבר הרבה אבל כשהוא שם — הוא באמת שם. זקוק למרחב ולבן/בת זוג שלא דורש דיבורים כל הזמן.",
  ESTP: "בזוגיות, ESTP מביא הרפתקה ואנרגיה. הוא חי ברגע ומחפש חוויות. האתגר — לא תמיד מוכן לשיחות רגשיות עמוקות, וצריך ללמוד את זה.",
};

const MBTI_EXPLANATION = "MBTI (Myers-Briggs Type Indicator) הוא מודל אישיות שמחלק אנשים ל-16 טיפוסים על פי 4 ממדים: האם אתה מופנה פנימה או החוצה (I/E), איך אתה קולט מידע (S/N), איך אתה מקבל החלטות (T/F), ואיך אתה מעדיף לתכנן את חייך (J/P). ב-One אנחנו משתמשים בו בעיקר ככלי עזר שמפרק את האישיות לממדים שימושיים של עיבוד מידע וקבלת החלטות.";

const SCHWARTZ_EXPLANATION = "תיאוריית הערכים של שוורץ (Schwartz) היא מודל מחקרי שממפה ערכי ליבה בסיסיים המנחים התנהגות. הערכים מסודרים במעגל — ערכים סמוכים משתלבים, ערכים מנוגדים עלולים ליצור מתח. הלימה בערכים מרכזיים מנבאת יציבות זוגית ארוכת טווח.";

const BIG_FIVE_EXPLANATION = "מודל חמשת הממדים (Big Five) הוא המודל המוביל והמוכח ביותר בפסיכולוגיה לתיאור אישיות. כל אדם נמצא על ספקטרום בכל אחד מחמישה ממדים, והשילוב הייחודי שלהם מגדיר את סגנון ההתנהגות, התקשורת והחשיבה.";

const BIG_FIVE_RELATIONSHIP: Record<string, { high: string; low: string }> = {
  extraversion: {
    high: "מוחצנות גבוהה — מחפש אינטראקציה ושיתוף. מתאים לבן/בת זוג שאוהב חברה, או שמאזן עם שקט ומרחב אישי.",
    low: "מוחצנות נמוכה — מעדיף עומק על פני רוחב. מתאים לבן/בת זוג שמכבד את הצורך בזמן לעצמו ולא לוחץ לחיי חברה אינטנסיביים.",
  },
  conscientiousness: {
    high: "מצפוניות גבוהה — מאורגן ומחויב. בזוגיות זה מביא יציבות, אבל צריך גמישות כשבן/בת הזוג פחות מתוכנן.",
    low: "מצפוניות נמוכה — ספונטני וגמיש. בזוגיות זה מביא כיף והפתעות, אבל צריך שהצד השני לא יתסכל מחוסר תוכניות.",
  },
  agreeableness: {
    high: "נעימות גבוהה — אמפתי ומפשר. בזוגיות זה יוצר הרמוניה, אבל חשוב לא לוותר תמיד על הצרכים שלך.",
    low: "נעימות נמוכה — ישיר ועצמאי בדעותיו. בזוגיות זה מביא כנות, אבל צריך ללמוד לפשר.",
  },
  openness_to_experience: {
    high: "פתיחות גבוהה — סקרן ויצירתי. בזוגיות זה מביא חידוש וריגוש, אבל צריך שותף שמוכן לזרום.",
    low: "פתיחות נמוכה — מעדיף מוכר ויציב. בזוגיות זה מביא ביטחון, אבל צריך מרחב לחידושים קטנים.",
  },
  neuroticism: {
    high: "עוצמת תגובה רגשית גבוהה — חווה רגשות בעוצמה ומודעות רבה. בזוגיות, זה מאפשר חיבור רגשי עמוק ואמפתיה. חשוב לבנות תקשורת פתוחה עם בן/בת הזוג ולמצוא דרכים משותפות לווסת רגעי מתח.",
    low: "עוצמת תגובה רגשית נמוכה — ויסות רגשי חזק, מתמודד עם לחצים ברוגע. בזוגיות זה מביא עוגן ויציבות, אבל חשוב לא לזלזל ברגשות של בן/בת הזוג שעשויים לחוות דברים בעוצמה גדולה יותר.",
  },
};

function getTraitLevel(score: number): { label: string; color: string } {
  if (score >= 65) return { label: "גבוה", color: "#22c55e" };
  if (score >= 40) return { label: "בינוני", color: "#f59e0b" };
  return { label: "נמוך", color: "#94a3b8" };
}

function renderScoreBar(score: number) {
  return (
    <div style={s.scoreBarContainer}>
      <div style={{ ...s.scoreBarFill, width: `${Math.min(100, Math.max(0, score))}%` }} />
    </div>
  );
}

export default function Insights({ user, onBack, onOpenChat, initialView, resetKey, adminViewing }: InsightsProps) {
  const [profile, setProfile] = useState<DetailedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gender, setGender] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<"main" | "mbti" | "values" | "bigfive" | "enneagram" | "attachment" | "personal_full">(initialView || "main");
  const [personalInsights, setPersonalInsights] = useState<{ short: string | null; full: string | null; analysis_completed: boolean }>({ short: null, full: null, analysis_completed: false });

  // Sync detailView when initialView or resetKey changes (e.g., sidebar click resets to "main")
  useEffect(() => {
    if (initialView) setDetailView(initialView);
  }, [initialView, resetKey]);

  // Track insight sub-views
  useEffect(() => {
    if (detailView !== "main" && !adminViewing) trackPage(`insights_${detailView}`, user?.id);
  }, [detailView]);

  useEffect(() => {
    apiFetch(`/users/${user.id}/detailed-traits`)
      .then(r => { if (!r.ok) throw new Error("API error"); return r.json(); })
      .then((data: DetailedProfile) => { if (data && data.allValues) setProfile(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch(`/users/${user.id}`)
      .then(r => r.json())
      .then(u => { if (u.gender) setGender(u.gender); })
      .catch(() => {});
    apiFetch(`/users/${user.id}/personal-insights`)
      .then(r => r.json())
      .then(d => setPersonalInsights(d))
      .catch(() => {});
  }, [user.id]);

  const isFemale = gender === "woman";
  const g = (male: string, female: string) => isFemale ? female : male;

  const hasData = profile && (profile.mbti?.type || profile.allValues?.length > 0 || profile.allBigFive?.length > 0 || profile.enneagram?.primaryType || profile.attachment?.dominant);
  const strongValues = profile?.allValues?.filter(v => v.score > 60) || [];
  const weakValues = profile?.allValues?.filter(v => v.score < 40) || [];
  const highBigFive = profile?.allBigFive?.filter(v => v.score >= 65) || [];
  const lowBigFive = profile?.allBigFive?.filter(v => v.score < 40) || [];

  function renderDisagreeSection(topic: string) {
    return (
      <div style={{ marginTop: 20 }}>
        {onOpenChat && (() => {
          const msg = `אני לא ${g("בטוח", "בטוחה")} שהניתוח של ה-${topic} ${g("שלי", "שלי")} מדויק`;
          return (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#64748b", margin: "0 0 8px 0" }}>לא דייקנו לדעת{g("ך", "ך")}?</p>
              <button style={s.topicBubble} onClick={() => onOpenChat(msg, "qa_about_me")}>
                <span style={{ fontSize: 14, opacity: 0.6 }}>💬</span> {msg}
              </button>
            </>
          );
        })()}
        <button style={{ background: "none", border: "none", color: "#6366f1", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "8px 0 0", display: "block" }} onClick={() => setDetailView("main")}>
          ← לתובנות נוספות
        </button>
      </div>
    );
  }

  // ── Detail: MBTI ──
  if (detailView === "mbti" && profile?.mbti?.type) {
    const type = profile.mbti.type;
    const compat = MBTI_COMPATIBILITY[type];
    const relDetail = MBTI_RELATIONSHIP_DETAIL[type];
    return (
      <div style={s.container}><div style={s.content}>
        <button style={s.backBtn} onClick={() => setDetailView("main")}>← חזרה לתובנות</button>
        <h2 style={s.heading}>🧠 טיפוס MBTI: {type}</h2>

        <div style={s.card}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#6366f1", letterSpacing: 4 }}>{type}</div>
            {profile.mbti.description && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.7, margin: "8px 0 0" }}>{profile.mbti.description}</p>}
          </div>

          {profile.mbti.alternateType && (
            <div style={s.altCard}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#92400e", margin: "0 0 6px" }}>
                ייתכן שהטיפוס {g("שלך", "שלך")} הוא גם <strong>{profile.mbti.alternateType}</strong>
              </p>
              <p style={{ fontSize: 13, color: "#78716c", lineHeight: 1.5, margin: "0 0 6px" }}>
                המערכת זיהתה ש{g("אתה", "את")} על הגבול בין שני טיפוסים. זה לגמרי תקין — רוב האנשים לא נופלים בצורה חדה לקטגוריה אחת.
              </p>
              {profile.mbti.alternateDescription && <p style={{ fontSize: 13, color: "#78716c", lineHeight: 1.5, margin: 0 }}><strong>{profile.mbti.alternateType}</strong>: {profile.mbti.alternateDescription}</p>}
            </div>
          )}
        </div>

        <div style={s.explainCard}>
          <p style={s.explainTitle}>מהו MBTI?</p>
          <p style={s.explainText}>{MBTI_EXPLANATION}</p>
        </div>

        {relDetail && (
          <div style={s.card}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>מה זה אומר עלי{g("ך", "ך")} בזוגיות?</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7, margin: 0 }}>{relDetail}</p>
          </div>
        )}

        {compat && (
          <div style={s.card}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>התאמות לפי טיפוס</p>
            {compat.ideal.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#22c55e", margin: "0 0 4px" }}>הלימה טבעית גבוהה</p>
                <p style={{ fontSize: 13, color: "#555", margin: 0 }}>{compat.ideal.join(", ")}</p>
              </div>
            )}
            {compat.good.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", margin: "0 0 4px" }}>פוטנציאל טוב</p>
                <p style={{ fontSize: 13, color: "#555", margin: 0 }}>{compat.good.join(", ")}</p>
              </div>
            )}
            {compat.challenging.length > 0 && (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", margin: "0 0 4px" }}>דורש יותר עבודה</p>
                <p style={{ fontSize: 13, color: "#555", margin: 0 }}>{compat.challenging.join(", ")}</p>
              </div>
            )}
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>* ההתאמה בפועל תלויה בהרבה גורמים מעבר לטיפוס — ערכים, סגנון תקשורת, טעם אישי ועוד.</p>
          </div>
        )}

        {renderDisagreeSection("MBTI")}
      </div></div>
    );
  }

  // ── Detail: Values ──
  if (detailView === "values" && profile) {
    return (
      <div style={s.container}><div style={s.content}>
        <button style={s.backBtn} onClick={() => setDetailView("main")}>← חזרה לתובנות</button>
        <h2 style={s.heading}>💎 הערכים {g("שלך", "שלך")} (שוורץ)</h2>

        <div style={s.explainCard}>
          <p style={s.explainTitle}>מהו מודל הערכים של שוורץ?</p>
          <p style={s.explainText}>{SCHWARTZ_EXPLANATION}</p>
        </div>

        {strongValues.length > 0 && (
          <div style={s.card}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>הערכים המובילים {g("שלך", "שלך")}</p>
            {strongValues.map(v => (
              <div key={v.name} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{v.he}</span>
                  <span style={s.scoreBadge}>{v.score}</span>
                </div>
                {renderScoreBar(v.score)}
                <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5, margin: "4px 0 0" }}>{v.description}</p>
                <p style={{ fontSize: 12, color: "#3f6212", lineHeight: 1.5, margin: "4px 0 0" }}>{v.relationship}</p>
              </div>
            ))}
          </div>
        )}

        {weakValues.length > 0 && (
          <div style={s.card}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#64748b", margin: "0 0 10px" }}>ערכים פחות בולטים</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {weakValues.map(v => (
                <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", borderRadius: 8, padding: "6px 12px" }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{v.he}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{v.score}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
              ערכים פחות בולטים לא אומרים שמשהו חסר — פשוט שערכים אחרים מנחים {g("אותך", "אותך")} יותר. במציאת הלימה, אנחנו מתמקדים בעיקר בערכי הליבה המובילים.
            </p>
          </div>
        )}

        {strongValues.length > 0 && (
          <div style={{ ...s.card, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#166534", margin: "0 0 8px" }}>מה הערכים {g("שלך", "שלך")} אומרים על זוגיות?</p>
            <p style={{ fontSize: 13, color: "#3f6212", lineHeight: 1.7, margin: 0 }}>
              הערכים המובילים {g("שלך", "שלך")} מעידים על מה באמת חשוב לך בחיים — וזה מה שקובע את הדינמיקה בזוגיות. כשערכי הליבה של שני אנשים קרובים, יש בסיס איתן להסכמה על הדברים הגדולים: איך לגדל ילדים, מה עושים עם כסף, כמה חירות אישית חשובה. פער בערכים מרכזיים הוא אחד המנבאים החזקים ביותר לחיכוך ארוך טווח.
            </p>
          </div>
        )}

        {renderDisagreeSection("ערכים")}
      </div></div>
    );
  }

  // ── Detail: Big Five ──
  if (detailView === "bigfive" && profile) {
    return (
      <div style={s.container}><div style={s.content}>
        <button style={s.backBtn} onClick={() => setDetailView("main")}>← חזרה לתובנות</button>
        <h2 style={s.heading}>🎭 תכונות אישיות (Big Five)</h2>

        <div style={s.explainCard}>
          <p style={s.explainTitle}>מהו מודל Big Five?</p>
          <p style={s.explainText}>{BIG_FIVE_EXPLANATION}</p>
        </div>

        <div style={s.card}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>כל התכונות {g("שלך", "שלך")}</p>
          {profile.allBigFive.map(v => {
            const level = getTraitLevel(v.score);
            const relData = BIG_FIVE_RELATIONSHIP[v.name];
            const relText = v.score >= 55 ? relData?.high : relData?.low;
            return (
              <div key={v.name} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{v.he}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 12, background: level.color + "22", color: level.color }}>{level.label}</span>
                </div>
                {renderScoreBar(v.score)}
                <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5, margin: "4px 0 0" }}>{v.description}</p>
                {relText && <p style={{ fontSize: 12, color: "#3f6212", lineHeight: 1.5, margin: "4px 0 0" }}>{relText}</p>}
              </div>
            );
          })}
        </div>

        {(highBigFive.length > 0 || lowBigFive.length > 0) && (
          <div style={{ ...s.card, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#166534", margin: "0 0 8px" }}>מה זה אומר בזוגיות?</p>
            <p style={{ fontSize: 13, color: "#3f6212", lineHeight: 1.7, margin: 0 }}>
              השילוב הייחודי של התכונות {g("שלך", "שלך")} מגדיר את סגנון הזוגיות שמתאים לך. לפעמים דמיון בתכונות יוצר הרמוניה (שני אנשים מאורגנים), ולפעמים דווקא השלמה יוצרת דינמיקה בריאה (מישהו ספונטני עם מישהו מתוכנן). האלגוריתם שלנו בודק מה עובד הכי טוב עבור הפרופיל הספציפי {g("שלך", "שלך")}.
            </p>
          </div>
        )}

        {renderDisagreeSection("תכונות האישיות")}
      </div></div>
    );
  }

  // ── Detail: Enneagram ──
  if (detailView === "enneagram" && profile?.enneagram?.primaryType) {
    const ennea = profile.enneagram;
    const topTypes = ennea.allTypes.slice(0, 5);
    return (
      <div style={s.container}><div style={s.content}>
        <button style={s.backBtn} onClick={() => setDetailView("main")}>← חזרה לתובנות</button>
        <h2 style={s.heading}>🔷 אניאגרם: טיפוס {ennea.typeLabel}</h2>

        <div style={s.card}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#6366f1" }}>{ennea.typeLabel}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#555", marginTop: 4 }}>{ennea.primaryName}</div>
            {ennea.description && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.7, margin: "8px 0 0" }}>{ennea.description}</p>}
          </div>
        </div>

        <div style={s.explainCard}>
          <p style={s.explainTitle}>מהו אניאגרם?</p>
          <p style={s.explainText}>האניאגרם הוא מודל אישיות עתיק שמתאר 9 טיפוסים בסיסיים של מוטיבציה פנימית. בניגוד ל-MBTI שמתמקד באיך אתה חושב, האניאגרם מתמקד בלמה אתה עושה מה שאתה עושה — המוטיבציה העמוקה שמניעה אותך. כל אדם מזוהה עם טיפוס ראשי ו"כנף" (טיפוס שכן שמשפיע).</p>
        </div>

        {ennea.allTypes.length > 0 && (
          <div style={s.card}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>פיזור הטיפוסים {g("שלך", "שלך")}</p>
            {ennea.allTypes.map(t => {
              const level = getTraitLevel(t.score);
              return (
                <div key={t.type} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>טיפוס {t.type} — {t.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 12, background: level.color + "22", color: level.color }}>{level.label}</span>
                  </div>
                  {renderScoreBar(t.score)}
                  <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5, margin: "4px 0 0" }}>{t.description}</p>
                  <p style={{ fontSize: 12, color: "#3f6212", lineHeight: 1.5, margin: "4px 0 0" }}>{t.relationship}</p>
                </div>
              );
            })}
          </div>
        )}

        {renderDisagreeSection("אניאגרם")}
      </div></div>
    );
  }

  // ── Detail: Attachment ──
  if (detailView === "attachment" && profile?.attachment?.dominant) {
    const att = profile.attachment;
    return (
      <div style={s.container}><div style={s.content}>
        <button style={s.backBtn} onClick={() => setDetailView("main")}>← חזרה לתובנות</button>
        <h2 style={s.heading}>🔗 סגנון ההתקשרות {g("שלך", "שלך")}</h2>

        <div style={s.card}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#6366f1" }}>{att.dominantHe}</div>
            {att.description && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.7, margin: "8px 0 0" }}>{att.description}</p>}
          </div>
          {att.relationship && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginTop: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#166534", margin: "0 0 4px" }}>מה זה אומר בזוגיות?</p>
              <p style={{ fontSize: 13, color: "#3f6212", lineHeight: 1.6, margin: 0 }}>{att.relationship}</p>
            </div>
          )}
        </div>

        <div style={s.explainCard}>
          <p style={s.explainTitle}>מהו סגנון התקשרות?</p>
          <p style={s.explainText}>תיאוריית ההתקשרות מתארת את הדרך שבה אנחנו ניגשים למערכות יחסים קרובות. סגנון ההתקשרות נוצר בילדות ומשפיע על איך אנחנו מתנהלים בזוגיות — כמה אנחנו נוחים עם קרבה, איך אנחנו מגיבים לריחוק, ומה אנחנו צריכים כדי להרגיש בטוחים.</p>
        </div>

        <div style={s.card}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>הפרופיל {g("שלך", "שלך")}</p>
          {att.styles.map(st => {
            const level = getTraitLevel(st.score);
            const isDominant = st.name === att.dominant;
            return (
              <div key={st.name} style={{ marginBottom: 14, ...(isDominant ? { background: "#f0f0ff", borderRadius: 8, padding: "10px 12px", marginRight: -12, marginLeft: -12 } : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
                    {st.he} {isDominant && <span style={{ fontSize: 11, color: "#6366f1" }}>← דומיננטי</span>}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 12, background: level.color + "22", color: level.color }}>{level.label}</span>
                </div>
                {renderScoreBar(st.score)}
                <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5, margin: "4px 0 0" }}>{st.description}</p>
                <p style={{ fontSize: 12, color: "#3f6212", lineHeight: 1.5, margin: "4px 0 0" }}>{st.relationship}</p>
              </div>
            );
          })}
        </div>

        {renderDisagreeSection("סגנון ההתקשרות")}
      </div></div>
    );
  }

  // ── Detail: Full personal insights ──
  if (detailView === "personal_full" && personalInsights.full) {
    return (
      <div style={s.container}><div style={s.content}>
        <button style={s.backBtn} onClick={() => setDetailView("main")}>← חזרה לתובנות</button>
        <h2 style={s.heading}>📋 הניתוח המלא</h2>
        <div style={s.card}>
          <p style={{ fontSize: 14, color: "#333", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>
            {personalInsights.full}
          </p>
        </div>
        {onOpenChat && (
          <div style={{ marginTop: 16 }}>
            <button style={s.topicBubble} onClick={() => onOpenChat("אני רוצה לדייק משהו לגבי הניתוח שלי", "qa_about_me")}>
              <span style={{ fontSize: 14, opacity: 0.6 }}>💬</span> {g("אני רוצה לדייק משהו", "אני רוצה לדייק משהו")} לגבי הניתוח שלי
            </button>
          </div>
        )}
        <button style={{ background: "none", border: "none", color: "#6366f1", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "8px 0 0", display: "block" }} onClick={() => setDetailView("main")}>
          ← לתובנות נוספות
        </button>
      </div></div>
    );
  }

  // ── Main view ──
  return (
    <div style={s.container}><div style={s.content}>
      <h2 style={s.heading}>תובנות על עצמ{g("י", "י")}</h2>

      {/* Analysis not completed notice */}
      {!personalInsights.analysis_completed && hasData && (
        <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.6, margin: 0 }}>
            הניתוח עוד לא הושלם וכרגע התובנות מתבססות על ניתוח חלקי. נעדכן כשיושלם הניתוח המלא.
          </p>
        </div>
      )}

      {/* Admin-written short summary */}
      {personalInsights.short && (
        <div style={{ background: "#f0f0ff", border: "1px solid #e0e0f0", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: "#333", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
            {personalInsights.short}
          </p>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#888", fontSize: 14 }}>טוען...</p>
      ) : !hasData && !personalInsights.short ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6, margin: "4px 0" }}>הנתונים {g("שלך", "שלך")} עדיין לא נותחו לעומק במערכת, ולכן עדיין אין תובנות מובנות להציג.</p>
          <p style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5, marginTop: 16 }}>{g("המשך", "המשיכי")} לשוחח וברגע שיהיה מספיק מידע, הניתוח ירוץ אוטומטית והתובנות יופיעו כאן.</p>
        </div>
      ) : (
        <>
          {profile?.mbti?.type && (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>🧠 טיפוס MBTI</h3>
                <button style={s.expandBtn} onClick={() => setDetailView("mbti")}>הרחבה →</button>
              </div>
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#6366f1", letterSpacing: 4 }}>{profile.mbti.type}</div>
                {profile.mbti.description && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.7, margin: "8px 0 0" }}>{profile.mbti.description}</p>}
              </div>
            </div>
          )}

          {profile?.attachment?.dominant && (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>🔗 סגנון התקשרות</h3>
                <button style={s.expandBtn} onClick={() => setDetailView("attachment")}>הרחבה →</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#6366f1" }}>{profile.attachment.dominantHe}</div>
                {profile.attachment.description && <p style={{ fontSize: 13, color: "#555", lineHeight: 1.5, margin: "6px 0 0" }}>{profile.attachment.description}</p>}
              </div>
            </div>
          )}

          {profile && profile.allBigFive.length > 0 && (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>🎭 תכונות אישיות</h3>
                <button style={s.expandBtn} onClick={() => setDetailView("bigfive")}>הרחבה →</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {profile.allBigFive.map(v => {
                  const level = getTraitLevel(v.score);
                  return (
                    <div key={v.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>{v.he}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 12, background: level.color + "22", color: level.color }}>{level.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {strongValues.length > 0 && (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>💎 ערכים מרכזיים</h3>
                <button style={s.expandBtn} onClick={() => setDetailView("values")}>הרחבה →</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {strongValues.slice(0, 3).map(v => (
                  <div key={v.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a2e" }}>{v.he}</span>
                    <span style={s.scoreBadge}>{v.score}</span>
                  </div>
                ))}
                {strongValues.length > 3 && <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>ועוד {strongValues.length - 3} ערכים...</p>}
              </div>
            </div>
          )}

          {profile?.enneagram?.primaryType && (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>🔷 אניאגרם</h3>
                <button style={s.expandBtn} onClick={() => setDetailView("enneagram")}>הרחבה →</button>
              </div>
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#6366f1" }}>{profile.enneagram.typeLabel}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#555", marginTop: 4 }}>{profile.enneagram.primaryName}</div>
                {profile.enneagram.description && <p style={{ fontSize: 13, color: "#777", lineHeight: 1.5, margin: "6px 0 0" }}>{profile.enneagram.description}</p>}
              </div>
            </div>
          )}

          {/* Admin-written full insights — expandable */}
          {personalInsights.full && (
            <div style={s.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>📋 הניתוח המלא</h3>
                <button style={s.expandBtn} onClick={() => setDetailView("personal_full")}>קריאת הניתוח המלא →</button>
              </div>
              <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: "10px 0 0", whiteSpace: "pre-wrap" }}>
                {personalInsights.full.length > 200 ? personalInsights.full.slice(0, 200) + "..." : personalInsights.full}
              </p>
            </div>
          )}
        </>
      )}
    </div></div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { direction: "rtl", background: "#f9fafb", minHeight: "100vh", fontFamily: "'Segoe UI', 'Arial', sans-serif" },
  content: { maxWidth: 720, margin: "0 auto", padding: "32px 24px" },
  heading: { fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginTop: 0, marginBottom: 24 },
  backBtn: { background: "none", border: "none", color: "#6366f1", fontSize: 14, cursor: "pointer", padding: "4px 0", marginBottom: 16, fontFamily: "inherit" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 12 },
  expandBtn: { background: "none", border: "none", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 },
  scoreBadge: { fontSize: 14, fontWeight: 700, color: "#6366f1", background: "#f0f0ff", padding: "2px 10px", borderRadius: 12 },
  scoreBarContainer: { height: 6, background: "#e5e7eb", borderRadius: 3, marginBottom: 4, overflow: "hidden" },
  scoreBarFill: { height: "100%", background: "linear-gradient(90deg, #818cf8, #6366f1)", borderRadius: 3, transition: "width 0.3s ease" },
  explainCard: { background: "#f0f0ff", borderRadius: 10, padding: "14px 18px", marginBottom: 12 },
  explainTitle: { fontSize: 14, fontWeight: 600, color: "#4f46e5", margin: "0 0 6px" },
  explainText: { fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 },
  altCard: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px", marginTop: 12 },
  topicBubble: {
    display: "block", width: "100%", padding: "10px 16px", background: "#fff",
    border: "1px solid #e5e7eb", borderRadius: 20, color: "#555", fontSize: 13,
    cursor: "pointer", textAlign: "right" as const, fontFamily: "inherit", lineHeight: 1.5,
  },
};
