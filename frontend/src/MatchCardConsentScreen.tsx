import { useState } from "react";
import { apiFetch } from "./lib/api";
import type { User } from "./App";

interface MatchCardConsentScreenProps {
  user: User;
  onComplete: (user: User) => void;
  onShowExample: () => void;
  alreadyApproved?: boolean;
}

export default function MatchCardConsentScreen({ user, onComplete, onShowExample, alreadyApproved }: MatchCardConsentScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [showRestrictions, setShowRestrictions] = useState(false);
  const [showDeclineInfo, setShowDeclineInfo] = useState(false);
  const [savedConsent, setSavedConsent] = useState<"approved" | "declined" | null>(null);
  const [savedUser, setSavedUser] = useState<any>(null);

  const f = user.gender === "woman";
  const gn = (m: string, fem: string) => f ? fem : m;

  async function handleConsent(consent: "approved" | "declined") {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/users/${user.id}/match-card-consent`, {
        method: "POST",
        body: JSON.stringify({ consent, restrictions: restrictions.trim() || undefined }),
      });
      if (!res.ok) { setError("שגיאה בשמירה, נסו שוב"); return; }
      const data = await res.json();
      setSavedConsent(consent);
      setSavedUser(data.user);
    } catch {
      setError("שגיאת רשת, נסו שוב");
    } finally {
      setLoading(false);
    }
  }

  if (savedConsent) {
    return (
      <div style={{ flex: 1, overflowY: "auto", direction: "rtl", background: "#f9fafb" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <img src="/iconOnly.png" alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", marginBottom: 10 }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>כרטיס התאמה</h2>
          </div>
          <div style={cardStyle}>
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>{savedConsent === "approved" ? "\u2713" : "\u2717"}</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>
                {savedConsent === "approved"
                  ? `${gn("בקשתך", "בקשתך")} נקלטה — ${gn("אישרת", "אישרת")} בניית כרטיס התאמה`
                  : `${gn("בקשתך", "בקשתך")} נקלטה — ${gn("בחרת", "בחרת")} שלא לאשר`
                }
              </p>
              <p style={{ fontSize: 13.5, color: "#666", lineHeight: 1.7, margin: "0 0 6px" }}>
                {savedConsent === "approved"
                  ? `כשנמצא ${gn("לך", "לך")} התאמה, נבנה כרטיס אישי שיעזור לשני הצדדים להבין למה אנחנו חושבים שזו התאמה טובה.`
                  : `לצד השני יוצגו רק שם, גיל, מיקום ותמונה — ללא הסבר על ההתאמה.`
                }
              </p>
              <p style={{ fontSize: 12, color: "#999", lineHeight: 1.6, margin: 0 }}>
                אם {gn("תרצה", "תרצי")} לשנות את ההחלטה בעתיד, תמיד אפשר לעדכן במסך ההגדרות.
              </p>
            </div>
          </div>
          <button
            onClick={() => onComplete(savedUser)}
            style={{
              width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 600,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              color: "#fff", border: "none", borderRadius: 14,
              cursor: "pointer", fontFamily: "inherit", marginTop: 16,
              boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
            }}
          >
            חזרה למסך הראשי
          </button>
        </div>
      </div>
    );
  }

  if (alreadyApproved) {
    return (
      <div style={{ flex: 1, overflowY: "auto", direction: "rtl", background: "#f9fafb" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <img src="/iconOnly.png" alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", marginBottom: 10 }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>כרטיס התאמה</h2>
          </div>
          <div style={cardStyle}>
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>&#10003;</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e", margin: "0 0 8px" }}>
                {gn("אישרת", "אישרת")} בניית כרטיס התאמה
              </p>
              <p style={{ fontSize: 13.5, color: "#666", lineHeight: 1.7, margin: 0 }}>
                כשנמצא {gn("לך", "לך")} התאמה, נבנה כרטיס אישי שיעזור לשני הצדדים להבין למה אנחנו חושבים שזו התאמה טובה.
              </p>
            </div>
          </div>
          <button onClick={onShowExample} style={exampleBtnStyle}>
            צפייה בדוגמה לכרטיס התאמה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", direction: "rtl", background: "#f9fafb" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/iconOnly.png" alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", marginBottom: 10 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>כרטיס התאמה</h2>
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>הצעד האחרון לפני שנוכל להתאים {gn("אותך", "אותך")}</p>
        </div>

        {/* Explanation card 1: What is a match card? */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>מה זה כרטיס התאמה?</h3>
          <p style={cardTextStyle}>
            כרטיס התאמה הוא הסבר אישי שנבנה כשנמצא התאמה רלוונטית {gn("עבורך", "עבורך")}. הוא נועד להראות לשני הצדדים למה חשבנו שכדאי שתכירו — מה יכול לחבר ביניכם, איפה יש פוטנציאל, ומה כדאי לשים לב אליו בתחילת ההיכרות.
          </p>
        </div>

        {/* Explanation card 2: What's included? */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>מה כלול בכרטיס?</h3>
          <p style={cardTextStyle}>
            הכרטיס כולל מידע כללי ורלוונטי להתאמה בלבד: ערכים משותפים, סגנון תקשורת, דינמיקה אפשרית ביניכם, נקודות חיבור, וגם הצעה לאיך כדאי להתחיל את ההיכרות.
            <br /><br />
            <strong>אנחנו לא חושפים ציטוטים מהשיחות, מידע רגיש, או פרטים אישיים</strong> שאינם נחוצים להבנת ההתאמה.
          </p>
        </div>

        {/* Explanation card 3: Why consent? */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>למה צריך אישור?</h3>
          <p style={cardTextStyle}>
            השיחות {gn("שלך", "שלך")} עם One הן חסויות ונגישות לעיני ה-AI בלבד. כרטיס ההתאמה מבוסס על תובנות שעלו מהשיחות האלה, ולכן אנחנו צריכים את {gn("אישורך", "אישורך")} לפני שנשתף חלק מהתובנות עם הצד השני — בצורה מצומצמת, מכבדת ורלוונטית להתאמה בלבד.
          </p>
        </div>

        {/* View example button */}
        <button onClick={onShowExample} style={exampleBtnStyle}>
          ראה דוגמה לכרטיס התאמה
        </button>

        {/* Restrictions section */}
        <div style={{ ...cardStyle, background: "#fefce8", border: "1px solid #fde68a" }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setShowRestrictions(!showRestrictions)}
          >
            <h3 style={{ ...cardTitleStyle, color: "#854d0e", margin: 0 }}>
              יש משהו {gn("שתרצה", "שתרצי")} שנימנע מלהזכיר?
            </h3>
            <span style={{ fontSize: 11, color: "#a16207", transition: "transform 0.2s", transform: showRestrictions ? "rotate(180deg)" : "rotate(0)" }}>&#9660;</span>
          </div>
          {showRestrictions && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: "#713f12", lineHeight: 1.6, margin: "0 0 10px" }}>
                {gn("ספר", "ספרי")} לנו אם יש נושאים {gn("שתעדיף", "שתעדיפי")} שלא נזכיר בכרטיס ההתאמה {gn("שלך", "שלך")}:
              </p>
              <textarea
                value={restrictions}
                onChange={(e) => setRestrictions(e.target.value)}
                placeholder={`לדוגמה: "אל תזכירו את ההיסטוריה הזוגית שלי" או "אל תציינו את המקצוע שלי"`}
                style={{
                  width: "100%", minHeight: 80, padding: "10px 14px", fontSize: 13.5,
                  borderRadius: 10, border: "1px solid #fde68a", background: "#fffef5",
                  resize: "vertical", fontFamily: "inherit", direction: "rtl",
                  lineHeight: 1.6, boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>

        {/* Approve button */}
        <button
          onClick={() => handleConsent("approved")}
          disabled={loading}
          style={{
            width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 600,
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#fff", border: "none", borderRadius: 14,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
            marginTop: 16, opacity: loading ? 0.6 : 1,
            boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
          }}
        >
          {loading ? "שומר..." : restrictions.trim()
            ? `${gn("אני מאשר", "אני מאשרת")} בניית כרטיס בהתחשב בבקשות שציינתי`
            : `${gn("אני מאשר", "אני מאשרת")} בניית כרטיס התאמה`
          }
        </button>

        {/* Decline section */}
        <div style={{ marginTop: 24, textAlign: "center" }}>
          {!showDeclineInfo ? (
            <button
              onClick={() => setShowDeclineInfo(true)}
              style={{ background: "none", border: "none", color: "#999", fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
            >
              {gn("אני לא מעוניין", "אני לא מעוניינת")} לאשר
            </button>
          ) : (
            <div style={{ ...cardStyle, background: "#fef2f2", border: "1px solid #fecaca", textAlign: "right" }}>
              <p style={{ fontSize: 13, color: "#7f1d1d", lineHeight: 1.7, margin: "0 0 14px" }}>
                אם {gn("תבחר", "תבחרי")} שלא לאשר, יוצגו לצד השני רק פרטים בסיסיים — שם, גיל, מיקום ותמונה.
                <br />
                לא נוכל להסביר {gn("לך", "לך")} ולצד השני את ההתאמה, מה שעלול להקשות על בניית חיבור ראשוני.
              </p>
              <button
                onClick={() => handleConsent("declined")}
                disabled={loading}
                style={{
                  width: "100%", padding: "12px 20px", fontSize: 14, fontWeight: 600,
                  background: "#ef4444", color: "#fff", border: "none", borderRadius: 10,
                  cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "שומר..." : `${gn("אני לא מאשר", "אני לא מאשרת")} — הציגו פרטים יבשים בלבד`}
              </button>
            </div>
          )}
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "#ef4444", textAlign: "center", marginTop: 12 }}>{error}</p>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: "18px 22px",
  border: "1px solid #e5e7eb", marginBottom: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 8px",
};

const cardTextStyle: React.CSSProperties = {
  fontSize: 13.5, color: "#555", lineHeight: 1.75, margin: 0,
};

const exampleBtnStyle: React.CSSProperties = {
  width: "100%", padding: "12px 20px", fontSize: 14, fontWeight: 600,
  background: "#f0eef8", color: "#6366f1", border: "1px solid #e0ddf5",
  borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
  marginBottom: 14,
};
