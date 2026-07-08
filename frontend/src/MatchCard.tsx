import { useState } from "react";

interface MatchCardProps {
  user: { id: number; first_name: string; gender?: string };
  onBack: () => void;
}

// Demo match card — Gaya (#130) & Ofir (#133)
const MATCH = {
  person1: { name: "גאיה", photo: "/demo/gaya.png" },
  person2: { name: "אופיר", photo: "/demo/ofir.png" },
  introSummary: `גאיה מלמדת עברית באולפן ומייעצת בתחום ה-EdTech. תואר בפסיכולוגיה, אוהבת שפות, שיחות עומק ומסעדות טובות.

אופיר מפתח פלטפורמה חינוכית שמשלבת AI בהוראה. תואר בפסיכולוגיה ופילוסופיה, סקרן כרוני שלומד דברים חדשים מתוך עניין טהור.

שניכם חולקים עולם מקצועי דומה, ערכים ברורים, וסוג של שיחה שיש סיכוי טוב שתרגיש טבעית כבר מההתחלה.`,
  connectionPoints: [
    {
      title: "שפה משותפת",
      text: "לשניכם תואר בפסיכולוגיה ועולם מקצועי שנוגע ב-EdTech — מה שאומר שיש סיכוי טוב שהשיחה ביניכם תתחיל מנקודת פתיחה טבעית. הרבה מהמילים, העולמות והסקרנות כבר מוכרים לשניכם.",
    },
    {
      title: "ערכים שמסתנכרנים",
      text: "שניכם חילונים עם עמדה ברורה, מאמינים בחופש בחירה ובפתיחות מחשבתית, ומתנגדים לדוגמות. שניכם מעדיפים חיים של איכות — מסעדות, תרבות, שיחות עמוקות — על פני הרדיפה אחרי \"עוד\". הערכים האלה הם הבסיס שעליו נבנית זוגיות יציבה לאורך זמן.",
    },
    {
      title: "דינמיקה שמשלימה",
      text: "אופיר נוטה להיות ישיר ולהוביל כשצריך — מתוך בהירות, לא מתוך שליטה. גאיה מביאה הקשבה, רגישות ויכולת לקרוא מה קורה מתחת לפני השטח. השילוב הזה יכול ליצור מרחב שבו שניכם מרגישים חופשיים להיות מי שאתם.",
    },
    {
      title: "סגנון תקשורת שעובד",
      text: "שניכם מעדיפים לפתור דברים בשיחה ישירה, בלי דרמות ובלי לתת לדברים להצטבר. הגישה הזו — ענייניות עם כבוד — נחשבת לאחד הסימנים המשמעותיים לפוטנציאל של זוגיות בריאה לטווח ארוך.",
    },
  ],
  dateIdea: "במקרה שלכם, המפגש הראשון לא צריך להיות \"אטרקציה\". דווקא מפגש פשוט, במקום שקט ונעים, יכול לאפשר למה שמעניין בהתאמה הזו לצאת החוצה: שיחה חכמה, סקרנות הדדית ויכולת להרגיש את האדם שמולכם מעבר לפרטים היבשים.\n\nכדאי לבחור מקום שמאפשר נוכחות — קפה רגוע, בר אינטימי או הליכה קצרה — ולתת לשיחה להתפתח בלי למהר לסמן אם \"כן\" או \"לא\". לפעמים התאמות מהסוג הזה נפתחות לא דרך ניצוץ מיידי, אלא דרך תחושה שהאדם שמולך מבין את השפה שלך.",
  caveat: "אצל אופיר יש צורך ברור במרחב, עצמאות וחופש מחשבתי. אצל גאיה יש רגישות גבוהה לנוכחות רגשית, עקביות ותחושת קרבה. זה לא בהכרח פער בעייתי — אבל זו נקודה שכדאי לשים אליה לב כבר בהתחלה.\n\nאם תצליחו לדבר על זה בלי להפוך את זה למבחן, יכול להיווצר כאן איזון יפה: קשר שיש בו גם חופש וגם עומק, גם עצמאות וגם תחושת בית.",
  closing: "אנחנו מאמינים בהתאמה הזו כי מצאנו חיבור שהוא לא רק \"על הנייר\" — אלא דפוס עמוק של ערכים משותפים, סגנון תקשורת תואם, ודינמיקה שמאפשרת לשניכם לגדול יחד בלי לוותר על מי שאתם. זה לא קורה בכל יום.\n\nמאחר ואנחנו שומרים על הפרטיות של שניכם, לא ניתן לחשוף כאן את כל מה שעומד מאחורי ההתאמה הזו — אבל יש עוד הרבה רבדים שגילינו, ואנחנו מקווים שתגלו אותם יחד.",
};

export default function MatchCard({ user, onBack }: MatchCardProps) {
  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  return (
    <div style={{ flex: 1, overflowY: "auto", direction: "rtl", background: "#f9fafb" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>

        {/* Header — photos with connection */}
        <div style={{ textAlign: "center", marginBottom: 24, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 88, height: 88, borderRadius: "50%", overflow: "hidden",
                border: "3px solid #e0ddf5", boxShadow: "0 4px 16px rgba(99,102,241,0.15)",
              }}>
                <img src={MATCH.person1.photo} alt={MATCH.person1.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{MATCH.person1.name}</span>
            </div>

            <div style={{
              width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 -6px", marginBottom: 20, position: "relative", zIndex: 1,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #e0ddf5, #c7c2e8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(99,102,241,0.2)",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 88, height: 88, borderRadius: "50%", overflow: "hidden",
                border: "3px solid #e0ddf5", boxShadow: "0 4px 16px rgba(99,102,241,0.15)",
              }}>
                <img src={MATCH.person2.photo} alt={MATCH.person2.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{MATCH.person2.name}</span>
            </div>
          </div>
        </div>

        {/* Intro — combined */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e5e7eb", marginBottom: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e", margin: "0 0 6px" }}>
            {MATCH.person1.name} ו{MATCH.person2.name}, הכירו אחד את השנייה
          </h3>
          <p style={{ fontSize: 13, color: "#888", margin: "0 0 14px" }}>כרטיס התאמה אישי מ-One</p>
          <p style={{ fontSize: 13.5, color: "#444", lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>
            {MATCH.introSummary}
          </p>
        </div>

        {/* Connection points — all open */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e5e7eb", marginBottom: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 14px" }}>
            מה מחבר ביניכם
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {MATCH.connectionPoints.map((point, i) => (
              <div
                key={i}
                style={{
                  background: "#f8f7ff", borderRadius: 10, padding: "14px 16px",
                  cursor: "pointer", transition: "all 0.2s",
                }}
                onClick={() => setExpandedSection(expandedSection === i ? null : i)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "#6366f1", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#2a2a3e" }}>{point.title}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#bbb", transition: "transform 0.2s", transform: expandedSection === i ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                </div>
                {expandedSection === i && (
                  <p style={{ fontSize: 13, color: "#555", lineHeight: 1.75, margin: "10px 0 0 32px" }}>
                    {point.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Date idea */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e5e7eb", marginBottom: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>
            הצעה למפגש ראשון
          </h3>
          <p style={{ fontSize: 13, color: "#555", lineHeight: 1.75, margin: 0 }}>
            {MATCH.dateIdea}
          </p>
        </div>

        {/* Caveat */}
        <div style={{
          background: "#fefce8", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #fde68a", marginBottom: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#854d0e", margin: "0 0 10px" }}>
            מה יכול להיות מעניין לבדוק ביניכם
          </h3>
          <p style={{ fontSize: 13, color: "#713f12", lineHeight: 1.75, margin: 0 }}>
            {MATCH.caveat}
          </p>
        </div>

        {/* Closing + good luck */}
        <div style={{
          background: "#f0eef8", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e0ddf5", marginBottom: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <p style={{ fontSize: 13.5, color: "#3a3660", lineHeight: 1.8, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>
            {MATCH.closing}
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#6366f1", margin: 0, textAlign: "center" }}>
            בהצלחה!
          </p>
        </div>

        {/* Start conversation button */}
        <button
          style={{
            width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 600,
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#fff", border: "none", borderRadius: 14,
            cursor: "pointer", fontFamily: "inherit", marginBottom: 16,
            boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
          }}
        >
          התחילו שיחה
        </button>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "4px 0 24px" }}>
          <p style={{ fontSize: 11, color: "#bbb", lineHeight: 1.6, margin: 0 }}>
            הכרטיס הופק על ידי One על בסיס ניתוח אישיות מעמיק.
            <br />המידע המוצג הוא כללי ואינו כולל פרטים רגישים.
          </p>
        </div>

      </div>
    </div>
  );
}
