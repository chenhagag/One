import { useState, useRef, useEffect } from "react";
import ProfileEdit from "./ProfileEdit";
import Insights from "./Insights";
import MatchCard from "./MatchCard";
import { trackPage } from "./lib/trackPage";
import { getApiBaseUrl } from "./lib/platform";
import type { User } from "./App";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface NewChatProps {
  user: User;
  onBack: () => void;
  onNavigate?: (view: string) => void;
  onUserUpdate?: (u: User) => void;
  onLogout?: () => void;
  adminViewing?: boolean;
}

const IconImg = ({ src, size = 18 }: { src: string; size?: number }) => (
  <img src={src} alt="" style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />
);

const STEP_OPTIONS: { icon: string; text: string; channel: string }[] = [
  { icon: "/icons/thinkingType.png", text: "בוא נבין את סגנון החשיבה שלי", channel: "new_chat_cognitive" },
  { icon: "/icons/myTaste.png", text: "נתח את הטעם שלי לעומק", channel: "new_chat_taste" },
];
const QA_OPTIONS: { icon: string; text: string; channel: string; requiresAnalysis?: boolean }[] = [
  { icon: "/icons/accurateMatch.png", text: "איך אתה מוצא לי התאמה מדויקת?", channel: "qa_system" },
  { icon: "/icons/Question.png", text: "יש לי שאלה לגבי התהליך", channel: "qa_general" },
  { icon: "/icons/aboutMe.png", text: "מה למדת עליי עד עכשיו?", channel: "qa_about_me", requiresAnalysis: true },
];

const SIDEBAR_ITEMS: { icon: string; label: string; action?: string }[] = [
  { icon: "/icons/HowItWorks.png", label: "איך המערכת עובדת?", action: "how_it_works" },
  { icon: "/icons/Profile.png", label: "הפרטים שלי", action: "profile_edit" },
  { icon: "/icons/Insightes.png", label: "תובנות על עצמי", action: "insights" },
  { icon: "/icons/externalTaste.png", label: "בדיקת טעם חיצוני", action: "taste_test" },
  { icon: "/icons/Improve.png", label: "עזרו לנו להשתפר", action: "bug_report" },
  { icon: "/icons/settings.png", label: "הגדרות", action: "settings" },
];

function HowItWorks() {
  return (
    <div style={{ direction: "rtl", background: "#f9fafb", minHeight: "100vh", fontFamily: "'Segoe UI', 'Arial', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginTop: 0, marginBottom: 24 }}>איך המערכת עובדת?</h2>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#6366f1", margin: "0 0 12px 0" }}>התהליך</h3>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>1. היכרות לעומק</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              אנחנו מנהלים שיחה דינמית כדי להכיר אותך ברמה עמוקה. לא שאלון, אלא שיחה אמיתית שמטרתה להבין מה חשוב לך, איך אתה מעבד מידע, מה מניע אותך ומה הציפיות שלך מקשר.
            </p>
            <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5, margin: "6px 0 0" }}>
              השיחה מחולקת לשלושה חלקים ממוקדים: צ'אט להיכרות כללית ובחינת דפוסים אישיותיים, ניתוח קוגניטיבי להבנת סגנון החשיבה באמצעות סימולציות, וכיול מדויק של הטעם האישי והציפיות שלך מהצד השני.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>2. מיפוי אישיותי ומחקרי</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              על בסיס השיחה, המערכת בונה מפה אישיותית ותפיסתית מעמיקה מאחורי הקלעים. הניתוח כולל את ערכי הליבה, תכונות האופי, דפוסי התקשורת ומנגנוני הוויסות שלך. ככל שהשיתוף כנה ופתוח יותר, כך הניתוח מדויק יותר.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>3. כניסה למאגר ההתאמות</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              ברגע שתמונת המצב שלך מספיק ברורה ומלאה, המאפיינים נכנסים למאגר ההתאמות הפעיל. האלגוריתם סורק ומחשב הצלבות והלימה בינך לבין שאר המשתמשים במערכת כדי למצוא את החיבור הנכון ביותר.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>4. הלימה ויזואלית</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              לפני שמציעים התאמה, המערכת מוודאת שיש הלימה גם ברמת המראה החיצוני, כדי לוודא שיש בסיס למשיכה הדדית ולמנוע אכזבה.
            </p>
            <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5, margin: "6px 0 0" }}>
              איך זה עובד? ברגע שהאלגוריתם יזהה התאמה פסיכולוגית גבוהה, התמונות (לצד השם והגיל) יישלחו לאישור דיסקרטי של שני הצדדים. המשוב שלכם ידייק את ציון ההתאמה הסופי. בכל שלב אחר — התמונות והפרטים שלכם נותרים חסויים ונעולים לחלוטין.
            </p>
          </div>

          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>5. קבלת ההתאמה (One)</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              המערכת מציגה לך התאמה אחת בלבד — האדם בעל אחוז ההלימה הגבוה ביותר עבורך ברמה העמוקה ביותר. אנחנו לא מתפשרים על התאמות בינוניות ולכן תקבלו התאמה רק כאשר אדם כזה יימצא, זה עשוי לקחת זמן, במיוחד בשלבי ההתחלה כשאנחנו עוד בונים את מאגר המשתמשים שלנו.
            </p>
            <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5, margin: "6px 0 0" }}>
              ברגע שתמצא ההתאמה הטובה ביותר — תקבלו הודעה חגיגית המלווה בהסבר על סיבות החיבור, ותוכלו להתחיל לדבר ולהכיר בצ'אט המשותף. בהצלחה!
            </p>
          </div>

          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>6. ומה קורה אם החיבור לא הצליח?</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              אנחנו עושים את המיטב כדי שהחיבור הראשון יהיה ה-One שלכם, אבל אם ניסיתם וגיליתם שזה לא הלך — החיפוש לא נעצר. נחזיר אתכם מיד למאגר, אבל לא לפני שנערוך שיחת דיוק קצרה כדי להבין יחד מה עבד ומה פחות.
            </p>
            <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5, margin: "6px 0 0" }}>
              כל פידבק שלכם וכל התאמה שלא צלחה הם דאטה קריטי שמלמד את ה-AI מה נכון לכם לפעם הבאה. אנחנו מערכת לומדת — גם מכירה יותר אתכם ומה עובד עבורכם וגם מייצרת לקחים רוחביים מהתאמות אחרות. ככל שהמאגר של One גדל — אנחנו משתפרים ומדייקים את עצמנו.
            </p>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#6366f1", margin: "0 0 12px 0" }}>המדע שמאחורי הקלעים</h3>

          <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: "0 0 14px 0" }}>
            המערכת משתמשת בשילוב של AI מתקדם (המנתח את השיחה ומחלץ מאפיינים) ואלגוריתם התאמה שמצליב בין נתונים על בסיס מודלים פסיכולוגיים והתנהגותיים מוכחים.
          </p>

          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>מודל חמשת הממדים (The Big Five)</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              המודל המוביל והמוכח ביותר בפסיכולוגיה לתיאור אישיות. חמישה ממדים — מוחצנות, מצפוניות, נעימות, פתיחות לחוויות ויציבות רגשית — שמנבאים כיצד אדם מתנהג, מתקשר ומתמודד עם אתגרים ביומיום.
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>תיאוריית הערכים של שוורץ (Schwartz)</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              מודל מחקרי שממפה ערכי ליבה בסיסיים המנחים התנהגות (כמו עצמאות, ביטחון, הישגיות, נדיבות). הלימה בערכים מרכזיים מנבאת יציבות זוגית ארוכת טווח.
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>סגנונות תקשורת (MBTI)</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              כלי עזר שמפרק את האישיות לממדים שימושיים של עיבוד מידע וקבלת החלטות, ועוזר למצוא נקודות דמיון והשלמה. משמש בעיקר כתוספת למודלים המחקריים.
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px 0" }}>ממדים דינמיים נוספים</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6, margin: 0 }}>
              המערכת מנתחת פרופיל קוגניטיבי וסגנון עיבוד מידע, פרופיל רגשי ומנגנוני ויסות, דפוסי תקשורת וניהול אינטראקציה (כולל פתרון קונפליקטים), סגנון היקשרות (Attachment Style), והקשר סוציו-תרבותי.
            </p>
          </div>
        </div>

        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "20px 24px" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#166534", margin: "0 0 10px 0" }}>איך ההתאמה עובדת</h3>
          <p style={{ fontSize: 13, color: "#3f6212", lineHeight: 1.7, margin: 0 }}>
            ההתאמה מבוססת על שילוב חכם בין דמיון (למשל, ערכי ליבה קרובים) לבין השלמה (למשל, תכונות אופי ספציפיות שמאזנות זו את זו), לצד התחשבות מלאה בטעם האישי וברצונות שהגדרת. בנוסף, האלגוריתם אומן על דאטה של זוגות אמיתיים כדי ללמוד מה באמת מחבר בין אנשים ולכייל את המשקלים בהתאם.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Potential Match Rating Screen ────────────────────────────────────
function PotentialMatchScreen({ userId, userGender, onBack }: { userId: number; userGender: string | null; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState<{
    match_id: number;
    partner: { first_name: string; age: number; city: string; gender: string };
    photos: { id: number; url: string }[];
  } | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/matches/pending-rating?user_id=${userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.pending) {
          setMatchData({ match_id: d.match_id, partner: d.partner, photos: d.photos });
          if (d.user_gender) {
            // userGender may not be loaded yet in recommendations
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  async function submitRating(rating: string) {
    if (!matchData || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/matches/${matchData.match_id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, rating }),
      });
      if (r.ok) {
        setSubmitted(rating);
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  const isFemale = userGender === "woman";
  const partnerIsFemale = matchData?.partner?.gender === "woman";

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}><p style={{ color: "#888" }}>טוען...</p></div>;

  if (!matchData) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <p style={{ color: "#888", fontSize: 14 }}>אין התאמות ממתינות לדירוג כרגע</p>
      <button onClick={onBack} style={{ marginTop: 16, padding: "10px 28px", borderRadius: 24, border: "none", background: "#8b7ba8", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
        חזרה למסך הראשי
      </button>
    </div>
  );

  if (submitted) {
    const isPositive = submitted === "bullseye" || submitted === "possible";
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400, padding: "40px 20px" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24 }}>
            {isPositive ? "✓" : "·"}
          </div>
          <p style={{ fontSize: 17, fontWeight: 600, color: "#1a1a2e", margin: "0 0 12px", lineHeight: 1.5 }}>תודה, קיבלנו.</p>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, margin: "0 0 28px" }}>
            {isPositive
              ? "ניקח את זה בחשבון כחלק מתהליך ההתאמה ונמשיך לבדוק את הכיוון הזה יחד עם שאר הנתונים."
              : "לא נמשיך עם ההתאמה הזו. המשוב שלך עוזר לנו לדייק את ההתאמות הבאות."
            }
          </p>
          <button
            onClick={onBack}
            style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 13, fontWeight: 500, cursor: "pointer", padding: 0 }}
          >
            חזרה למסך הראשי
          </button>
        </div>
      </div>
    );
  }

  const photos = matchData.photos;
  const partner = matchData.partner;

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "28px 20px" }}>
      {/* Intro text */}
      <div style={{ marginBottom: 24, textAlign: "right" }}>
        <p style={{ fontSize: 15, color: "#1a1a2e", lineHeight: 1.7, margin: "0 0 8px", fontWeight: 600 }}>
          יש לנו סיבה טובה לחשוב שיש כאן פוטנציאל, אבל התאמה לא יכולה להישאר רק "על הנייר".
        </p>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, margin: 0 }}>
          גם תחושת משיכה ראשונית חשובה, ולכן לפני שנמשיך לעומק — נשמח לדעת אם מבחינתך יש בסיס להמשיך לבדוק את זה.
        </p>
      </div>

      {/* Photo gallery — softened frame */}
      <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "#f5f3ff", marginBottom: 28, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
        {photos.length > 0 ? (
          <>
            <img
              src={photos[photoIndex]?.url}
              alt=""
              style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", display: "block" }}
            />
            {photos.length > 1 && (
              <>
                {/* Photo indicator bar */}
                <div style={{ position: "absolute", top: 12, left: 16, right: 16, display: "flex", gap: 4 }}>
                  {photos.map((_, i) => (
                    <div key={i} onClick={() => setPhotoIndex(i)} style={{ flex: 1, height: 3, borderRadius: 2, background: i === photoIndex ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)", cursor: "pointer", transition: "background 0.2s" }} />
                  ))}
                </div>
                {/* Tap zones for navigation */}
                {photoIndex > 0 && (
                  <div onClick={() => setPhotoIndex(i => i - 1)} style={{ position: "absolute", top: 0, right: 0, width: "40%", height: "100%", cursor: "pointer" }} />
                )}
                {photoIndex < photos.length - 1 && (
                  <div onClick={() => setPhotoIndex(i => i + 1)} style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "100%", cursor: "pointer" }} />
                )}
              </>
            )}
          </>
        ) : (
          <div style={{ width: "100%", aspectRatio: "4/5", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 14 }}>
            אין תמונות זמינות
          </div>
        )}
      </div>

      {/* Rating buttons — elegant vertical stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <button
          disabled={submitting}
          onClick={() => submitRating("bullseye")}
          style={{ padding: "15px 16px", borderRadius: 12, border: "none", background: "#8b7ba8", color: "#fff", fontWeight: 600, fontSize: 14, cursor: submitting ? "wait" : "pointer", transition: "all 0.15s", textAlign: "center", letterSpacing: "0.01em" }}
        >
          כן, מסקרן אותי להמשיך
        </button>
        <button
          disabled={submitting}
          onClick={() => submitRating("possible")}
          style={{ padding: "15px 16px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", color: "#1a1a2e", fontWeight: 500, fontSize: 14, cursor: submitting ? "wait" : "pointer", transition: "all 0.15s", textAlign: "center" }}
        >
          לא בול, אבל אפשרי אם יש חיבור טוב
        </button>
        <button
          disabled={submitting}
          onClick={() => submitRating("miss")}
          style={{ padding: "15px 16px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", fontWeight: 500, fontSize: 14, cursor: submitting ? "wait" : "pointer", transition: "all 0.15s", textAlign: "center" }}
        >
          לא מרגיש לי מתאים
        </button>
      </div>

      {/* Known person option — subtle link */}
      <div style={{ textAlign: "center", padding: "12px 16px" }}>
        <button
          disabled={submitting}
          onClick={() => submitRating("known_person")}
          style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12.5, cursor: submitting ? "wait" : "pointer", padding: 0, lineHeight: 1.7 }}
        >
          {partnerIsFemale
            ? (isFemale ? "מכירה אותה או שיש סיבה אחרת שלא רלוונטי להמשיך? " : "מכיר אותה או שיש סיבה אחרת שלא רלוונטי להמשיך? ")
            : (isFemale ? "מכירה אותו או שיש סיבה אחרת שלא רלוונטי להמשיך? " : "מכיר אותו או שיש סיבה אחרת שלא רלוונטי להמשיך? ")
          }
          <span style={{ color: "#8b7ba8", fontWeight: 600, textDecoration: "underline" }}>
            {isFemale ? "לחצי כאן" : "לחץ כאן"}
          </span>
        </button>
      </div>
    </div>
  );
}

export default function NewChat({ user, onBack, onNavigate, onUserUpdate, onLogout, adminViewing }: NewChatProps) {
  const [channelMessages, setChannelMessages] = useState<Record<string, Message[]>>({
    new_chat: [],
    new_chat_cognitive: [],
    new_chat_taste: [],
    qa_about_me: [],
    qa_system: [],
    qa_general: [],
    qa_insights: [],
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [channel, setChannel] = useState<string>("new_chat");
  const [screen, setScreen] = useState<"home" | "chat" | "profile_edit" | "insights" | "couple_insights" | "bug_report" | "settings" | "how_it_works" | "potential_matches">("home");
  const [coupleInsights, setCoupleInsights] = useState<string | null>(null);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [bugText, setBugText] = useState("");
  const [bugSent, setBugSent] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<string>("");
  const [recommendations, setRecommendations] = useState<{ has_cognitive: boolean; has_taste_info: boolean; chat_count: number; summary_fields: number; cognitive_count: number; photo_count: number; has_profile_details: boolean; analysis_run_count: number; gender: string | null; admin_message: string | null; pending_rating: boolean }>({ has_cognitive: false, has_taste_info: false, chat_count: -1, summary_fields: 0, cognitive_count: 0, photo_count: 0, has_profile_details: false, analysis_run_count: 0, gender: null, admin_message: null, pending_rating: false });
  const [systemQuestion, setSystemQuestion] = useState<{ id: number; question_text: string } | null>(null);
  const [answeredQuestion, setAnsweredQuestion] = useState<{ question_text: string; answer: string } | null>(null);
  const [closedChannels, setClosedChannels] = useState<Record<string, boolean>>({});
  const [matchingProgress, setMatchingProgress] = useState<{ total_pool_profiles: number; scanned_profiles: number; status_text: string } | null>(null);
  const [insightCard, setInsightCard] = useState<{ mbti: { type: string | null; description: string | null }; allValues: { name: string; he: string; score: number; description: string }[]; allBigFive: { name: string; he: string; score: number; description: string }[] } | null>(null);
  const [fineTuneAnswered, setFineTuneAnswered] = useState<boolean>(() => localStorage.getItem(`fine_tune_${user.id}`) === "true");
  const [insightRotation, setInsightRotation] = useState<number>(() => {
    const v = localStorage.getItem(`insight_rotation_${user.id}`);
    return v ? parseInt(v, 10) : 0;
  });
  const [insightInitialView, setInsightInitialView] = useState<"main" | "mbti" | "values" | "bigfive" | "enneagram" | "attachment">("main");
  const [insightResetKey, setInsightResetKey] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Current channel's messages
  const messages = channelMessages[channel] || [];

  // Helper to update a specific channel's messages
  function setMessagesForChannel(ch: string, updater: (prev: Message[]) => Message[]) {
    setChannelMessages(prev => ({ ...prev, [ch]: updater(prev[ch] || []) }));
  }

  // Any channel has messages (for sidebar visibility)
  const hasAnyMessages = Object.values(channelMessages).some(arr => arr.length > 0);

  // Load recommendations status — on mount and whenever returning to home screen
  function loadRecommendations() {
    fetch(`/api/new-chat/status/${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.has_cognitive !== undefined) {
          setRecommendations({
            has_cognitive: data.has_cognitive,
            has_taste_info: data.has_taste_info,
            chat_count: data.chat_count || 0,
            summary_fields: data.summary_fields || 0,
            cognitive_count: data.cognitive_count || 0,
            photo_count: data.photo_count || 0,
            has_profile_details: data.has_profile_details || false,
            analysis_run_count: data.analysis_run_count || 0,
            gender: data.gender || null,
            admin_message: data.admin_message || null,
            pending_rating: !!data.pending_rating,
          });
          setSystemQuestion(data.system_question || null);
          if (data.chat_closed) setClosedChannels(prev => ({ ...prev, "new_chat": true }));
          if (data.cognitive_closed) setClosedChannels(prev => ({ ...prev, "new_chat_cognitive": true }));
          if (data.taste_closed) setClosedChannels(prev => ({ ...prev, "new_chat_taste": true }));

          // Load dashboard data when all channels are done
          const allDone = data.chat_closed && data.has_cognitive && data.has_taste_info;
          if (allDone) {
            fetch(`/api/users/${user.id}/matching-progress`).then(r => r.json()).then(mp => {
              if (mp.scanned_profiles !== undefined) setMatchingProgress(mp);
            }).catch(() => {});
            fetch(`/api/users/${user.id}/detailed-traits`).then(r => r.json()).then(dt => {
              if (dt.mbti || dt.allValues || dt.allBigFive) setInsightCard(dt);
            }).catch(() => {});
            // Advance insight rotation
            const nextRotation = insightRotation + 1;
            setInsightRotation(nextRotation);
            localStorage.setItem(`insight_rotation_${user.id}`, String(nextRotation));
          }
        }
      })
      .catch(() => {});
  }

  useEffect(() => { loadRecommendations(); }, [user.id]);
  useEffect(() => { if (screen === "home") loadRecommendations(); }, [screen]);
  useEffect(() => { if (!adminViewing) trackPage(screen === "chat" ? "chat" : screen === "home" ? "home" : screen, user?.id); }, [screen]);

  // Load couple insights + personal insights status
  useEffect(() => {
    fetch(`/api/users/${user.id}/couple-insights`).then(r => r.json()).then(d => {
      if (d.couple_insights) setCoupleInsights(d.couple_insights);
    }).catch(() => {});
    fetch(`/api/users/${user.id}/personal-insights`).then(r => r.json()).then(d => {
      if (d.analysis_completed !== undefined) setAnalysisCompleted(d.analysis_completed);
    }).catch(() => {});
  }, [user.id]);

  // Load existing conversation history on mount — split by channel
  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/full-transcript`)
      .then(r => r.json())
      .then(data => {
        if (!data.messages) return;
        const perChannel: Record<string, Message[]> = {
          new_chat: [],
          new_chat_cognitive: [],
          new_chat_taste: [],
          qa_about_me: [],
          qa_system: [],
          qa_general: [],
          qa_insights: [],
        };
        for (const m of data.messages) {
          const ct = m.chat_type as string;
          if (!ct || ct === "fine_tune") continue;
          let key: string | null = null;
          if (ct.startsWith("qa_")) {
            // Q&A channels — only map to known qa_ channels, never fall through
            key = ct in perChannel ? ct : null;
          } else if (ct.startsWith("new_chat")) {
            key = ct in perChannel ? ct : "new_chat";
          } else if (ct === "psychologist") {
            key = "new_chat";
          } else if (ct === "interviewer") {
            key = "new_chat_cognitive";
          }
          // Safety: never put non-matching messages into a channel
          if (key) perChannel[key].push({ role: m.role, content: m.content });
        }
        setChannelMessages(prev => {
          // Don't overwrite channels that already have messages (e.g. greeting just added)
          const merged = { ...prev };
          for (const [ch, msgs] of Object.entries(perChannel)) {
            if (msgs.length > 0) merged[ch] = msgs;
          }
          return merged;
        });
      })
      .catch(() => {});
  }, [user.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages, channel]);

  // Also scroll to bottom when switching to chat screen (delay for DOM to settle on iOS)
  useEffect(() => {
    if (screen === "chat") {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    }
  }, [screen]);

  // iOS keyboard: scroll input into view when virtual keyboard opens
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // When keyboard opens, visualViewport height shrinks — scroll input into view
      if (inputRef.current && document.activeElement === inputRef.current) {
        requestAnimationFrame(() => {
          inputRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
        });
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  async function sendMessage(text?: string, channelOverride?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    const effectiveChannel = channelOverride ?? channel;
    if (channelOverride) setChannel(channelOverride);

    setScreen("chat");
    setInput("");
    const userMsg: Message = { role: "user", content: msg };
    const channelMsgs = channelMessages[effectiveChannel] || [];
    const updatedMessages = [...channelMsgs, userMsg];
    setMessagesForChannel(effectiveChannel, () => updatedMessages);
    setSending(true);

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const r = await fetch(`${getApiBaseUrl()}/api/new-chat/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            message: msg,
            channel: effectiveChannel,
            history: updatedMessages.slice(-20),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const data = await r.json();
        if (data.reply) {
          setMessagesForChannel(effectiveChannel, prev => [...prev, { role: "assistant", content: data.reply }]);
          if (data.closing_stage >= 3) {
            setClosedChannels(prev => ({ ...prev, [effectiveChannel]: true }));
            fetch(`/api/new-chat/status/${user.id}`).then(r => r.json()).then(d => {
              if (d.has_cognitive !== undefined) { setRecommendations({ has_cognitive: d.has_cognitive, has_taste_info: d.has_taste_info, chat_count: d.chat_count || 0, summary_fields: d.summary_fields || 0, cognitive_count: d.cognitive_count || 0, photo_count: d.photo_count || 0, has_profile_details: d.has_profile_details || false, analysis_run_count: d.analysis_run_count || 0, gender: d.gender || null, admin_message: d.admin_message || null, pending_rating: !!d.pending_rating }); setSystemQuestion(d.system_question || null); }
            }).catch(() => {});
          }
        } else if (data.error) {
          setMessagesForChannel(effectiveChannel, prev => [...prev, { role: "assistant", content: "מצטער, משהו השתבש. נסה שוב." }]);
        }
        break; // Success — exit retry loop
      } catch (err: any) {
        if (attempt < MAX_RETRIES) {
          console.log(`[NewChat] Attempt ${attempt + 1} failed, retrying in 3s...`);
          await new Promise(res => setTimeout(res, 3000));
          continue;
        }
        console.error("[NewChat] send error after retries:", err);
        const errorMsg = err?.name === "AbortError" ? "הבקשה לקחה יותר מדי זמן. נסה שוב." : "שגיאה בתקשורת, נסה שוב.";
        setMessagesForChannel(effectiveChannel, prev => [...prev, { role: "assistant", content: errorMsg }]);
      }
    }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div id="nc-root" style={styles.container}>
      {/* Responsive CSS */}
      <style>{`
        .nc-sidebar { display: flex !important; }
        .nc-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .nc-sidebar {
            display: none !important;
            position: fixed;
            top: env(safe-area-inset-top, 0px); right: 0;
            height: calc(100dvh - env(safe-area-inset-top, 0px));
            height: calc(100vh - env(safe-area-inset-top, 0px));
            z-index: 1000;
            box-shadow: -2px 0 12px rgba(0,0,0,0.15);
          }
          .nc-sidebar.open { display: flex !important; }
          .nc-menu-btn { display: flex !important; }
          .nc-chat-area { padding: 16px 16px !important; }
          .nc-input-area { padding: 10px 16px 12px !important; }
          .nc-suggestions { padding: 0 16px 8px !important; }
        }
        /* Desktop: widen sub-screens */
        @media (min-width: 769px) {
          .nc-sub-screen { max-width: 720px !important; }
          .nc-sub-screen-narrow { max-width: 560px !important; }
        }
        /* iOS standalone: keep input pinned above keyboard */
        @supports (-webkit-touch-callout: none) {
          @media (display-mode: standalone) {
            .nc-input-area {
              position: sticky !important;
              bottom: 0 !important;
            }
          }
        }
        /* Typing indicator animation */
        @keyframes nc-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        .nc-typing-dot {
          animation: nc-bounce 1.4s infinite ease-in-out;
        }
        /* Screen transition */
        .nc-screen-fade {
          animation: nc-fadeIn 0.2s ease-out;
        }
        @keyframes nc-fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Mobile overlay */}
      {menuOpen && <div style={styles.overlay} onClick={() => setMenuOpen(false)} />}
      {showUserMenu && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} onClick={() => setShowUserMenu(false)} />}

      {/* Sidebar */}
      <div className={`nc-sidebar${menuOpen ? " open" : ""}`} style={styles.sidebar}>
        <div style={styles.logo}>
          <img src="/roundLogo.png" alt="" style={styles.logoIcon} />
          <span style={styles.logoText}>One</span>
        </div>

        <div style={styles.sidebarItems}>
          {/* Home screen */}
          <button
            style={screen === "home" ? styles.sidebarItemActive : styles.sidebarItem}
            onClick={() => { setScreen("home"); setMenuOpen(false); }}
          >
            <IconImg src="/icons/home.png" />
            <span>מסך ראשי</span>
          </button>

          {/* Back to chat — only shown if general chat has started */}
          {(channelMessages["new_chat"]?.length > 0) && (
            <button
              style={screen === "chat" && channel === "new_chat" ? styles.sidebarItemActive : styles.sidebarItem}
              onClick={() => { setChannel("new_chat"); setScreen("chat"); setMenuOpen(false); }}
            >
              <IconImg src="/icons/backToConversation.png" />
              <span style={{ flex: 1 }}>חזרה לשיחה</span>
              {/* Sidebar badge: completed channel indicator */}
              {closedChannels["new_chat"] && <span style={styles.completedBadge}>✓</span>}
            </button>
          )}

          {/* Other sidebar items */}
          {SIDEBAR_ITEMS.map((item, i) => (
            <button
              key={i}
              style={item.action ? (screen === item.action ? styles.sidebarItemActive : styles.sidebarItem) : { ...styles.sidebarItem, cursor: "default" }}
              disabled={!item.action}
              onClick={() => {
                if (!item.action) return;
                if (item.action === "taste_test") {
                  setScreen("taste_test" as any);
                  setMenuOpen(false);
                  return;
                }
                if (item.action === "insights") { setInsightInitialView("main"); setInsightResetKey(k => k + 1); }
                setScreen(item.action as any);
                setMenuOpen(false);
              }}
            >
              <IconImg src={item.icon} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.action === "profile_edit" && recommendations.has_profile_details && <span style={styles.completedBadge}>✓</span>}
            </button>
          ))}
          {/* Admin shortcut — staging only, chen only */}
          {user.email === "chen.hagag@gmail.com" && !window.location.hostname.includes("joinone.io") && window.location.hostname !== "localhost" && (
            <button
              style={styles.sidebarItem}
              onClick={() => { onNavigate?.("admin"); setMenuOpen(false); }}
            >
              <span style={{ fontSize: 18, width: 22, textAlign: "center" }}>⚙️</span>
              <span>תצוגת אדמין</span>
            </button>
          )}
          {/* Match card — only for matched users (#130 Gal, #133 Eden) */}
          {(user.id === 130 || user.id === 133) && (
            <button
              style={screen === "match_card" ? styles.sidebarItemActive : styles.sidebarItem}
              onClick={() => { setScreen("match_card"); setMenuOpen(false); }}
            >
              <IconImg src="/icons/accurateMatch.png" />
              <span>כרטיס התאמה</span>
            </button>
          )}
          {/* Couple insights — only for couple testers with insights */}
          {coupleInsights && (
            <button
              style={screen === "couple_insights" ? styles.sidebarItemActive : styles.sidebarItem}
              onClick={() => { setScreen("couple_insights"); setMenuOpen(false); }}
            >
              <IconImg src="/icons/Improve.png" />
              <span>ניתוח זוגיות</span>
            </button>
          )}
        </div>

        <div style={styles.sidebarBottom}>
          <div style={{ position: "relative" }}>
            <div style={{ ...styles.userArea, cursor: "pointer" }} onClick={() => setShowUserMenu(!showUserMenu)}>
              <div style={styles.avatar}>{(user.first_name || "?").charAt(0)}</div>
              <span style={styles.userName}>{user.first_name}</span>
            </div>
            {showUserMenu && (
              <div style={styles.userMenu}>
                <button style={styles.userMenuItem} onClick={() => { setShowUserMenu(false); onLogout?.(); }}>
                  התנתק
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div style={styles.main}>
        {/* Header — mobile menu toggle + context title */}
        <div style={styles.header}>
          <button className="nc-menu-btn" style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>
            ☰
            {!menuOpen && <span style={{ position: "absolute", top: 2, left: 2, width: 7, height: 7, borderRadius: "50%", background: "#6366f1" }} />}
          </button>
          <span style={{ ...styles.headerTitle, flex: 1 }}>
            {screen === "home" ? <img src="/nameLogoTrans.png" alt="One" style={{ height: 16, objectFit: "contain", display: "block" }} /> :
             screen === "chat" ? (channel === "new_chat" ? "שיחת היכרות" : channel === "new_chat_cognitive" ? "סגנון חשיבה" : channel === "new_chat_taste" ? "בדיקת טעם" : channel === "qa_about_me" ? "מה למדת עליי" : channel === "qa_system" ? "איך המערכת עובדת" : channel === "qa_general" ? "שאלות ותשובות" : channel === "qa_insights" ? "דיון על התובנות" : "שיחה") :
             screen === "profile_edit" ? "הפרטים שלי" :
             screen === "insights" ? "תובנות על עצמי" :
             screen === "match_card" ? "כרטיס התאמה" :
             screen === "couple_insights" ? "ניתוח זוגיות" :
             screen === "how_it_works" ? "איך המערכת עובדת?" :
             screen === "bug_report" ? "עזרו לנו להשתפר" :
             screen === "settings" ? "הגדרות" :
             screen === "potential_matches" ? "בדיקת התאמה" : <img src="/nameLogoTrans.png" alt="One" style={{ height: 16, objectFit: "contain", display: "block" }} />}
          </span>
          {/* Mobile user avatar + logout dropdown */}
          <div className="nc-menu-btn" style={{ position: "relative" }}>
            <div style={{ ...styles.avatar, width: 28, height: 28, fontSize: 12, cursor: "pointer" }} onClick={() => setShowUserMenu(!showUserMenu)}>
              {(user.first_name || "?").charAt(0)}
            </div>
            {showUserMenu && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: 4, zIndex: 100, minWidth: 120 }}>
                <button style={{ display: "block", width: "100%", padding: "8px 14px", fontSize: 14, color: "#ef4444", fontWeight: 500, background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "right", whiteSpace: "nowrap" }} onClick={() => { setShowUserMenu(false); onLogout?.(); }}>
                  התנתק
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sub-screens: profile edit / insights */}
        {screen === "profile_edit" && (
          <div className="nc-screen-fade" key="profile_edit" style={{ flex: 1, overflowY: "auto" }}>
            <ProfileEdit user={user} onBack={() => setScreen("home")} onUserUpdate={onUserUpdate} />
          </div>
        )}

        {screen === "insights" && (
          <div className="nc-screen-fade" key="insights" style={{ flex: 1, overflowY: "auto" }}>
            <Insights user={user} onBack={() => { setScreen("home"); setInsightInitialView("main"); }} onOpenChat={(msg, ch) => sendMessage(msg, ch)} initialView={insightInitialView} resetKey={insightResetKey} adminViewing={adminViewing} />
          </div>
        )}

        {screen === "how_it_works" && (
          <div className="nc-screen-fade" key="how_it_works" style={{ flex: 1, overflowY: "auto" }}>
            <HowItWorks />
          </div>
        )}

        {screen === "bug_report" && (
          <div className="nc-screen-fade" key="bug_report" style={{ flex: 1, overflowY: "auto", direction: "rtl" }}>
            <div className="nc-sub-screen-narrow" style={{ maxWidth: 500, margin: "0 auto", padding: "24px 20px" }}>

              {/* Card wrapper */}
              <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "24px 20px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginTop: 0, marginBottom: 6 }}>עזרו לנו להשתפר</h2>
                <p style={{ fontSize: 13, color: "#888", marginBottom: 20, marginTop: 0 }}>נשמח לשמוע מכם</p>

                {/* Category chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {[
                    { value: "bug", icon: "🐛", label: "משהו לא עובד" },
                    { value: "idea", icon: "💡", label: "רעיון / הצעה" },
                    { value: "general", icon: "💬", label: "שיתוף כללי" },
                    { value: "request", icon: "⚙️", label: "בקשה מהמערכת" },
                  ].map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      style={{
                        padding: "9px 16px", borderRadius: 12, fontSize: 13, cursor: "pointer",
                        border: "none",
                        background: feedbackCategory === cat.value ? "#6366f1" : "#f5f5fa",
                        color: feedbackCategory === cat.value ? "#fff" : "#555",
                        fontWeight: feedbackCategory === cat.value ? 600 : 400,
                        fontFamily: "inherit",
                      }}
                      onClick={() => setFeedbackCategory(cat.value)}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>

                {/* Dynamic textarea */}
                <textarea
                  style={{
                    width: "100%", minHeight: 120, padding: 14, fontSize: 14,
                    border: "1px solid #e8e8f0", borderRadius: 12, background: "#fafaff",
                    color: "#1a1a2e", resize: "vertical", outline: "none",
                    fontFamily: "inherit", direction: "rtl", boxSizing: "border-box",
                  }}
                  placeholder={
                    feedbackCategory === "bug" ? "מה קרה? באיזה מסך? ננסה לשחזר ולתקן..." :
                    feedbackCategory === "idea" ? "איזה רעיון יש לך? נשמח לשמוע..." :
                    feedbackCategory === "general" ? "מה רצית לשתף?" :
                    feedbackCategory === "request" ? "מה היית רוצה שהמערכת תעשה?" :
                    "בחר/י קטגוריה למעלה וכתוב/י כאן..."
                  }
                  value={bugText}
                  onChange={e => setBugText(e.target.value)}
                  disabled={bugSent}
                />

                {/* Submit */}
                <button
                  style={{
                    marginTop: 14, width: "100%", padding: "13px 24px", fontSize: 15, fontWeight: 600,
                    background: bugSent ? "#22c55e" : "#6366f1", color: "#fff",
                    border: "none", borderRadius: 12, cursor: bugText.trim() && feedbackCategory && !bugSent ? "pointer" : "default",
                    opacity: bugText.trim() && feedbackCategory && !bugSent ? 1 : 0.4,
                    fontFamily: "inherit",
                  }}
                  disabled={!bugText.trim() || !feedbackCategory || bugSent}
                  onClick={async () => {
                    if (!bugText.trim() || !feedbackCategory) return;
                    try {
                      await fetch(`${getApiBaseUrl()}/api/report-bug`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ user_id: user.id, report_text: `[${feedbackCategory}] ${bugText.trim()}` }),
                      });
                      setBugSent(true);
                      setBugText("");
                      setFeedbackCategory("");
                      setTimeout(() => { setBugSent(false); setScreen("home"); }, 2000);
                    } catch {}
                  }}
                >
                  {bugSent ? "נשלח בהצלחה" : "שליחה"}
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "match_card" && (
          <MatchCard user={user} onBack={() => setScreen("home")} />
        )}

        {screen === "couple_insights" && coupleInsights && (
          <div className="nc-screen-fade" key="couple_insights" style={{ flex: 1, overflowY: "auto", direction: "rtl" }}>
            <div className="nc-sub-screen" style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><IconImg src="/icons/accurateMatch.png" size={24} /> ניתוח זוגיות</h2>
              <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>סיכום ותובנות על הזוגיות שלכם</p>
              <div style={{ fontSize: 15, lineHeight: 1.8, color: "#333", whiteSpace: "pre-wrap" }}>
                {coupleInsights}
              </div>
            </div>
          </div>
        )}

        {screen === "settings" && <SettingsView user={user} onLogout={onLogout} />}

        {screen === "potential_matches" && (
          <div className="nc-screen-fade" key="potential_matches" style={{ flex: 1, overflowY: "auto", direction: "rtl" }}>
            <PotentialMatchScreen userId={user.id} userGender={recommendations.gender} onBack={() => { setScreen("home"); loadRecommendations(); }} />
          </div>
        )}

        {screen === ("taste_test" as any) && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", direction: "rtl" }}>
            <div style={{ textAlign: "center", padding: 24 }}>
              <div style={{ marginBottom: 16 }}><IconImg src="/icons/externalTaste.png" size={40} /></div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>בדיקת טעם חיצוני</h2>
              <p style={{ fontSize: 14, color: "#888" }}>המסך עוד בבנייה, בקרוב יהיה זמין!</p>
            </div>
          </div>
        )}

        {/* Chat Area — home + chat screens */}
        {(screen === "home" || screen === "chat") && (
          <>
            <div className="nc-chat-area nc-screen-fade" key={`chat-${screen}-${channel}`} style={styles.chatArea}>
              {screen === "home" && (() => {
                const allChatsCompleted = closedChannels["new_chat"] && recommendations.has_cognitive && recommendations.has_taste_info;
                return (
                  <div style={styles.welcomeBlock}>
                    <img src="/roundLogo.png" alt="" style={styles.welcomeIcon} />
                    <h2 style={styles.welcomeTitle}>ברוכים הבאים ל-One</h2>
                    <p style={styles.welcomeText}>
                      העוזר האישי שלך למציאת התאמה מדויקת ומשמעותית.
                    </p>
                    {!allChatsCompleted && (
                      <>
                        <p style={styles.welcomeText}>
                          איך זה עובד? נעבור יחד תהליך היכרות באמצעות שיחה, ובסיומו המערכת תמצא עבורך התאמה אחת מדויקת, המבוססת על התאמה פסיכולוגית ואישיותית עמוקה.
                        </p>
                        <p style={{ fontSize: 11, color: "#b0b0b0", marginTop: 6, cursor: "pointer", textDecoration: "underline" }} onClick={() => setScreen("how_it_works")}>
                          להסבר המלא על המערכת והתהליך ←
                        </p>
                      </>
                    )}
                  </div>
                );
              })()}

              {screen === "chat" && (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} style={msg.role === "user" ? styles.userMsgRow : styles.assistantMsgRow}>
                      {msg.role === "assistant" && <img src="/roundLogo.png" alt="" style={styles.assistantIcon} />}
                      <div style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <div style={styles.assistantMsgRow}>
                      <img src="/roundLogo.png" alt="" style={styles.assistantIcon} />
                      <div style={{ ...styles.assistantBubble, display: "flex", alignItems: "center", gap: 4, padding: "14px 20px" }}>
                        <span className="nc-typing-dot" style={{ ...styles.typingDot, animationDelay: "0s" }} />
                        <span className="nc-typing-dot" style={{ ...styles.typingDot, animationDelay: "0.2s" }} />
                        <span className="nc-typing-dot" style={{ ...styles.typingDot, animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  )}

                  {/* Post-close channel bubbles */}
                  {closedChannels[channel] && !sending && (() => {
                    const { has_cognitive, has_taste_info } = recommendations;
                    const isCouple = (user as any).test_user_type === "Couple Tester";
                    const cogDone = isCouple ? recommendations.cognitive_count >= 3 : has_cognitive;
                    const tasteDone = isCouple ? has_taste_info : has_taste_info;
                    const bubbles: { icon: string; text: string; ch: string }[] = [];
                    if (!cogDone && channel !== "new_chat_cognitive") bubbles.push({ icon: "/icons/thinkingType.png", text: "בוא נבין את סגנון החשיבה שלי", ch: "new_chat_cognitive" });
                    if (!tasteDone && channel !== "new_chat_taste") bubbles.push({ icon: "/icons/myTaste.png", text: "נתח את הטעם שלי לעומק", ch: "new_chat_taste" });
                    if (channel !== "new_chat" && !closedChannels["new_chat"] && (recommendations.summary_fields < 8)) bubbles.push({ icon: "/icons/Conversation.png", text: "בוא נמשיך להכיר", ch: "new_chat" });
                    if (bubbles.length === 0) return null;
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
                        {bubbles.map((b, i) => (
                          <button key={i} style={{ padding: "8px 16px", border: "1px solid #e0e0e8", borderRadius: 20, background: "#fff", fontSize: 13, color: "#6366f1", cursor: "pointer", fontWeight: 600 }} onClick={() => {
                            if (channelMessages[b.ch]?.length > 0) {
                              setChannel(b.ch);
                            } else {
                              sendMessage(b.text, b.ch);
                            }
                          }}>
                            <span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle", marginLeft: 4 }}><IconImg src={b.icon} size={16} /></span> {b.text}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Pending match rating card */}
              {screen === "home" && recommendations.pending_rating && (
                <div style={{ padding: "0 24px 12px", maxWidth: 500, margin: "0 auto" }}>
                  <div style={{ background: "#fff", borderRadius: 14, padding: "24px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb", textAlign: "right" }}>
                    <p style={{ fontSize: 15, color: "#1a1a2e", lineHeight: 1.7, margin: "0 0 8px", fontWeight: 600 }}>
                      מצאנו כיוון להתאמה שיכול להיות מעניין עבורך.
                    </p>
                    <p style={{ fontSize: 13, color: "#888", margin: "0 0 18px", lineHeight: 1.6 }}>
                      לפני שנעמיק ונפתח את כרטיס ההתאמה, חשוב לנו לבדוק שגם מבחינת משיכה ראשונית יש בסיס להמשיך.
                    </p>
                    <div style={{ textAlign: "center" }}>
                      <button
                        onClick={() => setScreen("potential_matches")}
                        style={{ padding: "12px 32px", borderRadius: 24, border: "none", background: "#8b7ba8", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                      >
                        לבדיקת ההתאמה
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* System question — interactive question from admin */}
              {screen === "home" && (systemQuestion || answeredQuestion) && (
                <div style={{ padding: "0 24px 12px", maxWidth: 500, margin: "0 auto" }}>
                  <div style={{ background: "#fff", borderRadius: 14, padding: "20px 20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
                    <p style={{ fontSize: 14, color: "#1a1a2e", lineHeight: 1.7, margin: "0 0 16px", fontWeight: 500, textAlign: "right" }}>
                      {systemQuestion ? systemQuestion.question_text : answeredQuestion!.question_text}
                    </p>
                    {systemQuestion ? (
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        {["כן אין בעיה", "אפשרי", "לא"].map(opt => (
                          <button key={opt} onClick={async () => {
                            const q = systemQuestion;
                            await fetch(`${getApiBaseUrl()}/api/system-question/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_id: q.id, answer: opt }) });
                            setSystemQuestion(null);
                            setAnsweredQuestion({ question_text: q.question_text, answer: opt });
                          }} style={{ padding: "8px 20px", borderRadius: 20, border: "none", background: "#8b7ba8", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
                          {["כן אין בעיה", "אפשרי", "לא"].map(opt => (
                            <span key={opt} style={{ padding: "8px 20px", borderRadius: 20, border: "1px solid #e5e7eb", background: opt === answeredQuestion!.answer ? "#8b7ba8" : "#f5f5f7", color: opt === answeredQuestion!.answer ? "#fff" : "#94a3b8", fontWeight: 600, fontSize: 13 }}>
                              {opt}
                            </span>
                          ))}
                        </div>
                        <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 500, margin: 0 }}>תודה, תשובתך התקבלה ונקח אותה בחשבון</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Admin message — shown above all recommendations */}
              {screen === "home" && recommendations.admin_message && (
                <div style={{ padding: "0 24px 12px", maxWidth: 500, margin: "0 auto" }}>
                  <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
                    <p style={{ fontSize: 14, color: "#1a1a2e", lineHeight: 1.7, margin: 0, fontWeight: 500, whiteSpace: "pre-wrap" }}>
                      {recommendations.admin_message}
                    </p>
                  </div>
                </div>
              )}

              {/* Status recommendation — one at a time, prioritized */}
              {screen === "home" && (() => {
              const { has_cognitive, has_taste_info, summary_fields, chat_count } = recommendations;
              const isCouple = (user as any).test_user_type === "Couple Tester";
              const isFemale = (recommendations.gender || user.gender) === "woman";
              const gn = (m: string, f: string) => isFemale ? f : m;
              const chatClosed = closedChannels["new_chat"] || false;
              // Couples get recommendations earlier; chat closed = definitely advanced
              const conversationAdvanced = chatClosed || (isCouple ? chat_count >= 5 : summary_fields >= 4);
              const cogDoneForCouple = isCouple ? recommendations.cognitive_count >= 3 : has_cognitive;
              const tasteDoneForCouple = isCouple ? recommendations.cognitive_count >= 3 && has_taste_info : has_taste_info;
              const chatNotEnough = summary_fields < 8 && chat_count > 0 && !chatClosed;

              // Don't show recommendations before data is loaded
              if (chat_count < 0) return null;
              // Priority 0: General chat never started — suggest starting it
              if (chat_count === 0 && !chatClosed) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>📊 איפה אנחנו עומדים?</span> עדיין לא התחלנו את שיחת ההיכרות. {gn("לחץ", "לחצי")} על <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => { setChannel("new_chat"); setScreen("chat"); }}>"בוא נתחיל"</span> כדי שנוכל {gn("להכיר אותך", "להכיר אותך")} ולהריץ חיפוש מדויק במאגר.
                    </p>
                  </div>
                );
              }
              // Priority 1: General chat not complete — return to chat
              if (chatNotEnough) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>📊 איפה אנחנו עומדים?</span> עדיין אין לנו מספיק נתונים כדי להריץ חיפוש מדויק במאגר. {gn("לחץ", "לחצי")} על <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => { setChannel("new_chat"); setScreen("chat"); }}>"בוא נמשיך"</span> כדי להתקדם.
                    </p>
                  </div>
                );
              }
              // Priority 2: Suggest cognitive after enough general conversation
              if (!cogDoneForCouple && conversationAdvanced) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>📊 איפה אנחנו עומדים?</span> שיחת ההיכרות הושלמה. {gn("היכנס", "היכנסי")} ל<span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => { if (channelMessages["new_chat_cognitive"]?.length > 0) { setChannel("new_chat_cognitive"); setScreen("chat"); } else { sendMessage("בוא נבין את סגנון החשיבה שלי", "new_chat_cognitive"); } }}>"בוא נבין את סגנון החשיבה שלי"</span> כדי שנוכל {gn("להכיר אותך", "להכיר אותך")} יותר לעומק ולדייק את ההתאמה.
                    </p>
                  </div>
                );
              }
              // Priority 3: Suggest taste after cognitive is done
              if (cogDoneForCouple && !tasteDoneForCouple) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>📊 איפה אנחנו עומדים?</span> {gn("לחץ", "לחצי")} על <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => { if (channelMessages["new_chat_taste"]?.length > 0) { setChannel("new_chat_taste"); setScreen("chat"); } else { sendMessage("נתח את הטעם שלי לעומק", "new_chat_taste"); } }}>"נתח את הטעם שלי לעומק"</span> כדי שנוכל להבין את העדפות הטעם {gn("שלך", "שלך")}.
                    </p>
                  </div>
                );
              }
              // All done — thank the user + prompt for photos/profile
              if (chatClosed && cogDoneForCouple && tasteDoneForCouple) {
                const hasPhotos = recommendations.photo_count > 0;
                const hasDetails = recommendations.has_profile_details;
                return (
                  <div style={styles.recommendationBlock}>
                    {isCouple ? (
                      <p style={styles.recommendationText}>
                        סיימת את כל השלבים, תודה רבה, עזרת לי מאוד לשפר את עצמי! נחזור אליך בקרוב עם תובנות על הזוגיות שלך :)
                      </p>
                    ) : hasDetails ? (
                      <p style={{ ...styles.recommendationText, lineHeight: 1.7 }}>
                        🎉 כל השלבים הושלמו בהצלחה!
                        <br />
                        כעת המערכת מבצעת ניתוח מעמיק של המאפיינים שלך ומתחילה בחיפוש. נשלח לך עדכון ברגע שתעלה התאמה רלוונטית ומדויקת.
                        <br /><br />
                        <span style={{ fontSize: 12, color: "#999" }}>
                          אנחנו נמצאים כרגע בגרסת הרצה ראשונית (MVP) ובונים את קהילת המשתמשים שלנו, כך שהתהליך עשוי לקחת קצת זמן. ב-One אנחנו מעדיפים איכות על פני מהירות, ולכן לא מתפשרים על התאמות בינוניות.
                        </span>
                      </p>
                    ) : !hasPhotos ? (
                      <p style={{ ...styles.recommendationText, marginTop: 8, lineHeight: 1.7 }}>
                        רק עוד צעד אחד אחרון!
                        <br />
                        כדי שהמערכת תוכל לצרף אותך למאגר ולהתחיל בחיפוש ההתאמה, נשאר רק להעלות תמונה במסך <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setScreen("profile_edit")}>"הפרטים שלי"</span>.
                      </p>
                    ) : (
                      <p style={{ ...styles.recommendationText, marginTop: 8, lineHeight: 1.7 }}>
                        רק עוד צעד אחד אחרון!
                        <br />
                        כדי שהמערכת תוכל לצרף אותך למאגר ולהתחיל בחיפוש ההתאמה, נשארו רק העלאת התמונות והשלמת הנתונים במסך <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setScreen("profile_edit")}>"הפרטים שלי"</span>.
                      </p>
                    )}

                    {/* ── Dashboard: Insight Drip Feed — shown for all users including couples ── */}
                    {insightCard && (() => {
                      const rot = insightRotation % 5;
                      let emoji = "";
                      let title = "";
                      let text = "";
                      let hasContent = false;
                      let targetView: "mbti" | "values" | "bigfive" | "enneagram" | "attachment" = "mbti";

                      if (rot === 0 && insightCard.mbti?.type) {
                        emoji = "/icons/thinkingType.png";
                        title = `טיפוס MBTI: ${insightCard.mbti.type}`;
                        text = insightCard.mbti.description || "";
                        hasContent = true;
                        targetView = "mbti";
                      } else if ((rot === 1 || (rot === 0 && !insightCard.mbti?.type)) && insightCard.allValues?.length > 0) {
                        const top = insightCard.allValues.filter((v: any) => v.score > 60).slice(0, 2);
                        if (top.length > 0) {
                          emoji = "/icons/Insightes.png";
                          title = "הערכים המובילים שלך";
                          text = top.map((v: any) => `${v.he} — ${v.description}`).join(". ");
                          hasContent = true;
                          targetView = "values";
                        }
                      }
                      if (!hasContent && rot === 2 && insightCard.allBigFive?.length > 0) {
                        const top = insightCard.allBigFive.filter((v: any) => v.score > 60).slice(0, 2);
                        if (top.length > 0) {
                          emoji = "/icons/aboutMe.png";
                          title = "תכונות אישיות בולטות";
                          text = top.map((v: any) => `${v.he} — ${v.description}`).join(". ");
                          hasContent = true;
                          targetView = "bigfive";
                        }
                      }
                      if (!hasContent && rot === 3 && insightCard.enneagram?.primaryType) {
                        emoji = "/icons/HowItWorks.png";
                        title = `אניאגרם: טיפוס ${insightCard.enneagram.typeLabel}`;
                        text = insightCard.enneagram.description || "";
                        hasContent = true;
                        targetView = "enneagram";
                      }
                      if (!hasContent && rot === 4 && insightCard.attachment?.dominant) {
                        emoji = "/icons/accurateMatch.png";
                        title = `סגנון התקשרות: ${insightCard.attachment.dominantHe}`;
                        text = insightCard.attachment.description || "";
                        hasContent = true;
                        targetView = "attachment";
                      }
                      // Fallback: try Big Five if nothing matched yet
                      if (!hasContent && insightCard.allBigFive?.length > 0) {
                        const top = insightCard.allBigFive.filter((v: any) => v.score > 60).slice(0, 2);
                        if (top.length > 0) {
                          emoji = "/icons/aboutMe.png";
                          title = "תכונות אישיות בולטות";
                          text = top.map((v: any) => `${v.he} — ${v.description}`).join(". ");
                          hasContent = true;
                          targetView = "bigfive";
                        }
                      }

                      if (!hasContent) return null;

                      return (
                        <div style={styles.dashboardCard}>
                          <p style={styles.dashboardTitle}>מה למדנו עליך</p>
                          <div style={styles.insightCardContent}>
                            <IconImg src={emoji} size={28} />
                            <div style={{ flex: 1 }}>
                              <p style={styles.insightCardTitle}>{title}</p>
                              <p style={styles.insightCardText}>{text}</p>
                            </div>
                          </div>
                          <button
                            style={styles.insightCardBtn}
                            onClick={() => { setScreen("insights"); }}
                          >
                            לקריאת הניתוח המלא →
                          </button>
                          {!analysisCompleted && (
                            <p style={{ fontSize: 11, color: "#aaa", margin: "6px 0 0", textAlign: "center" }}>
                              הניתוח עוד לא הושלם וכרגע התובנות מתבססות על ניתוח חלקי, נעדכן כשיושלם הניתוח המלא
                            </p>
                          )}
                        </div>
                      );
                    })()}

                  </div>
                );
              }
              return null;
            })()}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions — only on home screen */}
            {screen === "home" && (() => {
              const chatDone = closedChannels["new_chat"] || false;
              const hasMessages = (channelMessages["new_chat"]?.length ?? 0) > 0;
              const allChatsComplete = chatDone && recommendations.has_cognitive && recommendations.has_taste_info;
              const hasAnalysis = recommendations.analysis_run_count > 0;

              return (
              <>
              <div className="nc-suggestions" style={{ ...styles.suggestions, ...(allChatsComplete ? { gap: 6 } : {}) }}>
                {/* Main chat button */}
                <button style={{
                  ...(allChatsComplete ? styles.qaBubble : styles.suggestionBtn),
                  ...(chatDone
                    ? { borderColor: "#22c55e", color: "#22c55e" }
                    : { background: "#8b7ba8", color: "#fff", border: "1px solid #8b7ba8" }),
                }} onClick={() => {
                  setChannel("new_chat");
                  if (!hasMessages) {
                    const g = user.gender === "woman";
                    const isCouple = (user as any).test_user_type === "Couple Tester";
                    const greeting = isCouple
                      ? `היי ${user.first_name}, תודה רבה על ההשתתפות בתהליך האימון שלי.\nככל שאני נבדק על זוגות רבים יותר - אני לומד לדייק את ההתאמות למשתמשים שמחפשים זוגיות אמיתית, והשתתפות ${g ? "שלך" : "שלך"} מסייעת לי מאוד.\nאשאל ${g ? "אותך" : "אותך"} שאלות כמו שהייתי שואל רווקים-רווקות אמיתיים שנכנסים למערכת, ${g ? "אשמח אם תעני" : "אשמח אם תענה"} בכנות ובטבעיות כפי ש${g ? "היית עונה אם היית" : "היית עונה אם היית"} באמת ${g ? "מחפשת" : "מחפש"} שידוך.\nבסוף התהליך ${g ? "תוכלי" : "תוכל"} גם לקבל ממני קצת תובנות על ${g ? "עצמך" : "עצמך"} ועל הזוגיות ${g ? "שלך" : "שלך"} :)\nחשוב לי ש${g ? "תדעי" : "תדע"} שכל מה ש${g ? "את כותבת" : "אתה כותב"} לי כאן הוא לעיניי בלבד — שום דבר לא מופיע בפרופיל ${g ? "שלך" : "שלך"} ולא חשוף לאף משתמש אחר.\n${g ? "מוכנה להתחיל?" : "מוכן להתחיל?"}`
                      : `היי ${user.first_name}, אני מומחה ההתאמה שלך. אני כאן כדי למצוא ${g ? "לך" : "לך"} התאמה מדויקת על ידי היכרות מעמיקה.\nחשוב לי ש${g ? "תדעי" : "תדע"} שכל מה ש${g ? "את כותבת" : "אתה כותב"} לי כאן הוא לעיניי בלבד — שום דבר לא מופיע בפרופיל ${g ? "שלך" : "שלך"} ולא חשוף לאף משתמש אחר.\nככל ש${g ? "תשתפי" : "תשתף"} אותי יותר, נוכל לדייק את ההתאמה ${g ? "שלך" : "שלך"} יותר. ${g ? "מוכנה להתחיל?" : "מוכן להתחיל?"}`;
                    setMessagesForChannel("new_chat", () => [{ role: "assistant", content: greeting }]);
                  }
                  setScreen("chat");
                }}>
                  <span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>{chatDone ? <IconImg src="/icons/backToConversation.png" size={16} /> : <IconImg src="/icons/StartConversationPurple.png" size={16} />}</span> {chatDone ? "חזרה לשיחה" : hasMessages ? "בוא נמשיך" : "בוא נתחיל"}
                </button>

                {/* Step bubbles — cognitive & taste */}
                {STEP_OPTIONS.map((s, i) => {
                  const isChannelDone = closedChannels[s.channel] || (s.channel === "new_chat_cognitive" && recommendations.has_cognitive) || (s.channel === "new_chat_taste" && recommendations.has_taste_info);
                  return (
                  <button key={`step-${i}`} style={{ ...(allChatsComplete ? styles.qaBubble : styles.suggestionBtn), ...(isChannelDone ? { borderColor: "#22c55e", color: "#22c55e" } : {}) }} onClick={() => {
                    if (channelMessages[s.channel]?.length > 0) {
                      setChannel(s.channel);
                      setScreen("chat");
                    } else {
                      sendMessage(s.text, s.channel);
                    }
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle", opacity: 0.8 }}>{isChannelDone ? "✓" : <IconImg src={s.icon} size={16} />}</span> {s.text}
                  </button>
                  );
                })}

                {/* Q&A bubbles — smaller, separated below */}
                {QA_OPTIONS.filter(q => !q.requiresAnalysis || hasAnalysis).length > 0 && (
                  <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4, paddingTop: 8, borderTop: "1px solid #f0f0f4" }}>
                    {QA_OPTIONS
                      .filter(q => !q.requiresAnalysis || hasAnalysis)
                      .map((q, i) => (
                      <button key={`qa-${i}`} style={styles.qaBubble} onClick={() => {
                        if (channelMessages[q.channel]?.length > 0) {
                          setChannel(q.channel);
                          setScreen("chat");
                        } else {
                          sendMessage(q.text, q.channel);
                        }
                      }}>
                        <span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}><IconImg src={q.icon} size={14} /></span> {q.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              </>
              );
            })()}
          </>
        )}

        {/* Input Area — chat screen only (not home) */}
        {screen === "chat" && (
        <div className="nc-input-area" style={styles.inputArea}>
          <div style={styles.inputRow}>
            <textarea
              ref={inputRef}
              style={{ ...styles.textarea, maxHeight: 120, overflowY: input.split("\n").length > 4 ? "auto" : "hidden" }}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                // Auto-grow textarea
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="כתוב הודעה..."
              rows={1}
              disabled={sending}
            />
            <button
              type="button"
              style={{ ...styles.sendBtn, opacity: input.trim() && !sending ? 1 : 0.4 }}
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
            >
              ←
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <div style={styles.disclaimer}>השיחה מנוהלת על ידי בינה מלאכותית לצורך הכרות והתאמה</div>
            <button style={{ background: "none", border: "none", fontSize: 11, color: "#aaa", cursor: "pointer", padding: "2px 0", whiteSpace: "nowrap" }} onClick={() => setScreen("home")}>
              ← חזרה למסך הראשי
            </button>
          </div>
        </div>
        )}
        {/* Feedback footer — home screen only, replaces input area */}
        {screen === "home" && (() => {
          return (
            <div style={{ padding: "8px 20px 16px", textAlign: "center", direction: "rtl" }}>
              <p style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6, margin: 0 }}>
                המערכת נמצאת בגרסת הרצה ראשונית (MVP). הצ׳אט עדיין נמצא בשיפור, ולכן ייתכנו ניסוחים פחות מדויקים או טעויות נקודתיות. אם נתקלת בבעיה או אם יש לך כל משוב אחר בשבילנו, נשמח לשמוע <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setScreen("bug_report")}>במסך המשוב</span>.
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Settings View component ────────────────────────────────────

function SettingsView({ user, onLogout }: { user: User; onLogout?: () => void }) {
  const [photoAI, setPhotoAI] = useState(false);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${user.id}`).then(r => r.json()).then(data => {
      setPhotoAI(!!data.photo_ai_consent);
      setEmailUpdates(data.email_updates !== false);
      setWhatsappUpdates(!!data.whatsapp_updates);
      setPhone(data.whatsapp_phone || "");
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user.id]);

  async function saveSetting(fields: Record<string, any>) {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleResetData() {
    setResetting(true);
    try {
      const res = await fetch(`/api/users/${user.id}/reset-data`, { method: "POST" });
      if (res.ok) {
        alert("הנתונים נמחקו בהצלחה. החשבון שלך נשמר.");
        setResetConfirm(false);
      } else {
        alert("משהו השתבש, נסו שוב");
      }
    } catch {
      alert("שגיאת רשת, נסו שוב");
    } finally {
      setResetting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}?self=true`, { method: "DELETE" });
      if (res.ok) {
        onLogout?.();
      } else {
        alert("מחיקה נכשלה, נסו שוב");
      }
    } catch {
      alert("שגיאת רשת, נסו שוב");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  const sectionStyle: React.CSSProperties = { background: "#f9fafb", borderRadius: 12, padding: "16px 20px", marginBottom: 16 };
  const titleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: "#111827", margin: "0 0 12px" };
  const labelStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 14, color: "#374151", lineHeight: 1.6 };
  const checkboxStyle: React.CSSProperties = { marginTop: 4, width: 18, height: 18, cursor: "pointer", accentColor: "#111827", flexShrink: 0 };
  const hintStyle: React.CSSProperties = { fontSize: 12, color: "#9ca3af", lineHeight: 1.5, margin: "8px 0 0", paddingRight: 28 };

  return (
    <div style={{ flex: 1, overflowY: "auto", direction: "rtl" }}>
      <div className="nc-sub-screen-narrow" style={{ maxWidth: 400, margin: "0 auto", padding: "32px 24px" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 24 }}>הגדרות</h2>

        {/* Photo AI consent */}
        <div style={sectionStyle}>
          <h3 style={titleStyle}>פרטיות תמונות</h3>
          <label style={labelStyle}>
            <input type="checkbox" checked={photoAI} disabled={saving || loading}
              onChange={(e) => { setPhotoAI(e.target.checked); saveSetting({ photo_ai_consent: e.target.checked }); }}
              style={checkboxStyle} />
            <span>אני מאשר/ת ל־One להשתמש ב־AI כדי לנתח את תמונות הפרופיל שלי, לצורך שיפור התאמות ותובנות.</span>
          </label>
          <p style={hintStyle}>ניתוח תמונות ב־AI הוא אופציונלי. ללא אישור, התמונות ישמשו להצגה בפרופיל בלבד.</p>
        </div>

        {/* Notifications */}
        <div style={sectionStyle}>
          <h3 style={titleStyle}>התראות ועדכונים</h3>
          <label style={{ ...labelStyle, marginBottom: 14 }}>
            <input type="checkbox" checked={emailUpdates} disabled={saving || loading}
              onChange={(e) => { setEmailUpdates(e.target.checked); saveSetting({ email_updates: e.target.checked }); }}
              style={checkboxStyle} />
            <span>אני מאשר/ת קבלת עדכונים במייל על התאמות וחדשות</span>
          </label>
          <label style={labelStyle}>
            <input type="checkbox" checked={whatsappUpdates} disabled={saving || loading}
              onChange={(e) => {
                setWhatsappUpdates(e.target.checked);
                if (!e.target.checked) saveSetting({ whatsapp_updates: false });
              }}
              style={checkboxStyle} />
            <span>אני מאשר/ת קבלת עדכונים בוואטסאפ</span>
          </label>
          {whatsappUpdates && (
            <div style={{ marginTop: 10, paddingRight: 28 }}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="מספר טלפון (למשל 0501234567)"
                dir="ltr"
                style={{
                  width: "100%", height: 40, borderRadius: 8, border: "1px solid #e5e7eb",
                  padding: "0 12px", fontSize: 14, color: "#374151", outline: "none", boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => {
                  if (!phone.trim()) return;
                  saveSetting({ whatsapp_updates: true, whatsapp_phone: phone.trim() });
                }}
                disabled={saving || !phone.trim()}
                style={{
                  marginTop: 8, padding: "6px 16px", borderRadius: 8,
                  background: phone.trim() ? "#111827" : "#d1d5db", color: "#fff",
                  fontSize: 13, fontWeight: 500, border: "none",
                  cursor: phone.trim() ? "pointer" : "not-allowed",
                }}
              >
                שמירה
              </button>
            </div>
          )}
        </div>

        {saved && <p style={{ fontSize: 12, color: "#22c55e", textAlign: "center", margin: "0 0 16px" }}>נשמר בהצלחה</p>}

        {/* Reset data */}
        <div style={{ ...sectionStyle, background: "#fffbeb", marginTop: 32 }}>
          <h3 style={{ ...titleStyle, color: "#92400e" }}>מחיקת נתונים</h3>
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "0 0 12px" }}>
            מחיקת כל השיחות, התובנות וההתאמות שלך. שימו לב — כל השיחה תימחק לצמיתות, כולל כל הנתונים שנאספו ממנה, ותצטרכו לעבור את השיחה המלאה מחדש כדי להיכנס שוב למאגר ההתאמות.
          </p>
          {!resetConfirm ? (
            <button
              onClick={() => setResetConfirm(true)}
              style={{
                padding: "8px 20px", borderRadius: 8, background: "#fff",
                color: "#d97706", fontSize: 13, fontWeight: 600,
                border: "1px solid #fde68a", cursor: "pointer",
              }}
            >
              מחיקת הנתונים שלי
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#d97706", margin: "0 0 10px" }}>
                בטוח/ה? כל השיחות, התובנות וההתאמות יימחקו לצמיתות. תצטרכו לעבור את כל התהליך מחדש.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleResetData}
                  disabled={resetting}
                  style={{
                    padding: "8px 20px", borderRadius: 8, background: "#d97706",
                    color: "#fff", fontSize: 13, fontWeight: 600, border: "none",
                    cursor: "pointer", opacity: resetting ? 0.5 : 1,
                  }}
                >
                  {resetting ? "מוחק..." : "כן, מחקו את הנתונים"}
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  style={{
                    padding: "8px 20px", borderRadius: 8, background: "#fff",
                    color: "#374151", fontSize: 13, border: "1px solid #d1d5db", cursor: "pointer",
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Delete account */}
        <div style={{ ...sectionStyle, background: "#fef2f2", marginTop: 32 }}>
          <h3 style={{ ...titleStyle, color: "#991b1b" }}>מחיקת חשבון</h3>
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "0 0 12px" }}>
            מחיקת החשבון תסיר את כל המידע שלך לצמיתות — כולל שיחות, תמונות, תובנות והתאמות. לא ניתן לשחזר את המידע לאחר המחיקה.
          </p>
          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              style={{
                padding: "8px 20px", borderRadius: 8, background: "#fff",
                color: "#dc2626", fontSize: 13, fontWeight: 600,
                border: "1px solid #fecaca", cursor: "pointer",
              }}
            >
              מחיקת החשבון שלי
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#dc2626", margin: "0 0 10px" }}>
                בטוח/ה? הפעולה הזו בלתי הפיכה.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{
                    padding: "8px 20px", borderRadius: 8, background: "#dc2626",
                    color: "#fff", fontSize: 13, fontWeight: 600, border: "none",
                    cursor: "pointer", opacity: deleting ? 0.5 : 1,
                  }}
                >
                  {deleting ? "מוחק..." : "כן, מחקו את החשבון"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  style={{
                    padding: "8px 20px", borderRadius: 8, background: "#fff",
                    color: "#6b7280", fontSize: 13, border: "1px solid #e5e7eb", cursor: "pointer",
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Legal links */}
        <div style={{ textAlign: "center", marginTop: 24, paddingBottom: 8 }}>
          <a href="/terms" target="_blank" style={{ fontSize: 12, color: "#aaa", textDecoration: "underline", marginLeft: 16 }}>תנאי שימוש</a>
          <a href="/privacy" target="_blank" style={{ fontSize: 12, color: "#aaa", textDecoration: "underline" }}>מדיניות פרטיות</a>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    height: "100dvh",
    direction: "rtl",
    fontFamily: "'Segoe UI', 'Arial', sans-serif",
    background: "#f9fafb",
    overflow: "hidden",
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: "env(safe-area-inset-top, 0px)",
  },

  overlay: {
    position: "fixed" as const,
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.3)",
    zIndex: 999,
  },

  // Sidebar
  sidebar: {
    width: 220,
    background: "#f4f2f8",
    borderLeft: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    padding: "16px 0",
    flexShrink: 0,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 20px 20px",
    borderBottom: "1px solid #f0f0f0",
    marginBottom: 8,
  },
  logoIcon: { width: 28, height: 28, borderRadius: "50%", objectFit: "cover" as const },
  logoText: { fontSize: 18, fontWeight: 700, color: "#1a1a2e" },
  sidebarItems: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 10px",
    flex: 1,
  },
  sidebarItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    color: "#555",
    textAlign: "right",
    opacity: 0.7,
  },
  sidebarItemActive: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "none",
    background: "#f5f5f7",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    color: "#6366f1",
    textAlign: "right",
    fontWeight: 600,
    opacity: 1,
  },
  sidebarBottom: {
    padding: "12px 16px",
    borderTop: "1px solid #f0f0f0",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  userArea: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#6366f1",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 600,
  },
  userName: { fontSize: 13, fontWeight: 500, color: "#333" },
  userMenu: {
    position: "absolute" as const,
    bottom: "100%",
    right: 0,
    marginBottom: 6,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    padding: 4,
    zIndex: 100,
    minWidth: 120,
  },
  userMenuItem: {
    display: "block",
    width: "100%",
    padding: "8px 14px",
    fontSize: 14,
    color: "#ef4444",
    fontWeight: 500,
    background: "none",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "right" as const,
  },

  // Main
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  header: {
    padding: "14px 24px",
    borderBottom: "1px solid #e5e7eb",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  menuBtn: {
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    fontSize: 18,
    cursor: "pointer",
    color: "#555",
    padding: "4px 8px",
    display: "flex",
    position: "relative" as const,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#333",
  },

  // Chat
  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  welcomeBlock: {
    textAlign: "center",
    padding: "40px 20px 20px",
    maxWidth: 500,
    margin: "0 auto",
  },
  welcomeIcon: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    objectFit: "cover" as const,
    marginBottom: 16,
    display: "block",
    marginLeft: "auto",
    marginRight: "auto",
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: "#1a1a2e",
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 15,
    color: "#666",
    lineHeight: 1.6,
    margin: "4px 0",
  },

  // Recommendations
  recommendationBlock: {
    padding: "0 24px 12px",
    maxWidth: 500,
    margin: "0 auto",
  },
  recommendationText: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 1.5,
    margin: "8px 0",
    padding: "10px 14px",
    background: "#f5f5f7",
    borderRadius: 10,
    borderRight: "3px solid #8b7ba8",
  },
  recommendationBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6366f1",
    marginLeft: 6,
  },

  // Messages
  userMsgRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  assistantMsgRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userBubble: {
    background: "#8b7ba8",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "65%",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  assistantIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: 8,
    flexShrink: 0,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  assistantBubble: {
    background: "#f0f0f5",
    color: "#1a1a2e",
    padding: "10px 16px",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "65%",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },

  // Suggestions
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "0 40px 12px",
    justifyContent: "center",
  },
  suggestionBtn: {
    padding: "8px 16px",
    border: "1px solid #e0e0e8",
    borderRadius: 20,
    background: "#fff",
    fontSize: 13,
    color: "#555",
    cursor: "pointer",
  },
  qaBubble: {
    padding: "4px 8px",
    border: "1px solid #e0e0e8",
    borderRadius: 12,
    background: "#fff",
    fontSize: 10,
    color: "#777",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  // Input
  inputArea: {
    padding: "12px 40px calc(16px + env(safe-area-inset-bottom, 0px))",
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#f5f5fa",
    borderRadius: 12,
    padding: "8px 14px",
    border: "1px solid #e0e0e8",
  },
  textarea: {
    flex: 1,
    border: "none",
    background: "transparent",
    fontSize: 14,
    resize: "none",
    outline: "none",
    direction: "rtl",
    fontFamily: "inherit",
    lineHeight: 1.5,
  },
  sendBtn: {
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: 32,
    height: 32,
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  disclaimer: {
    fontSize: 11,
    color: "#aaa",
    textAlign: "center",
    marginTop: 8,
  },
  // Typing indicator dots
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#999",
    display: "inline-block",
  },
  // Sidebar completed channel badge
  completedBadge: {
    fontSize: 12,
    color: "#22c55e",
    fontWeight: 700,
    marginRight: 4,
  },
  // Dashboard styles
  dashboardCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "16px 20px",
    marginTop: 12,
    direction: "rtl" as const,
  },
  dashboardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 10px 0",
  },
  dashboardMetric: {
    fontSize: 13,
    color: "#555",
    margin: "0 0 6px 0",
    lineHeight: 1.6,
  },
  dashboardStatus: {
    fontSize: 12,
    color: "#94a3b8",
    margin: "8px 0 0 0",
    fontStyle: "italic" as const,
  },
  insightCardContent: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  insightCardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1a1a2e",
    margin: "0 0 4px 0",
  },
  insightCardText: {
    fontSize: 13,
    color: "#777",
    lineHeight: 1.5,
    margin: 0,
  },
  insightCardBtn: {
    display: "block",
    marginTop: 10,
    background: "none",
    border: "none",
    color: "#6366f1",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
    fontFamily: "inherit",
  },
  fineTuneBubble: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  fineTuneText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 1.6,
    margin: 0,
    flex: 1,
  },
  fineTuneChips: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap" as const,
  },
  chipBtn: {
    padding: "8px 16px",
    borderRadius: 20,
    border: "1px solid #d4c5e0",
    background: "#f5f5f7",
    color: "#6b5b7a",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
  },
  feedbackFooter: {
    display: "block",
    width: "100%",
    marginTop: 12,
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    fontSize: 12,
    cursor: "pointer",
    textAlign: "center" as const,
    fontFamily: "inherit",
    lineHeight: 1.5,
  },
};
