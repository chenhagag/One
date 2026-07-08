import { useState } from "react";

interface MatchCardProps {
  user: { id: number; first_name: string; gender?: string };
  onBack: () => void;
}

// Demo match data — will be replaced with real data from API
const DEMO_MATCH = {
  partnerName: "גל",
  partnerAge: 29,
  partnerCity: "תל אביב",
  matchScore: 87,
  partnerIntro: "גל הוא יזם בתחום האדטק, מפתח פלטפורמה חינוכית מבוססת AI. הוא בעל תואר בפסיכולוגיה ופילוסופיה, סקרן לא נגמר, אוהב לגלות דברים חדשים מתוך עניין טהור. הוא חם, ישיר ונאמן — מהאנשים שהחוג הקרוב שלהם קטן אבל עמוק.",
  connectionPoints: [
    {
      title: "עולם משותף",
      text: "לשניכם רקע בפסיכולוגיה ועולם האדטק, עם יכולת טבעית להבין אנשים ומוטיבציות. יש לכם שפה משותפת שתאפשר שיחות עמוקות מהרגע הראשון.",
    },
    {
      title: "ערכים מתכתבים",
      text: "שניכם חילונים עם קומפס מוסרי ברור, מאמינים בטוב שבאנשים, ומעדיפים חיים עירוניים עם תרבות, אוכל טוב וחוויות. שניכם גם מסכימים שהתא המשפחתי הקרוב הוא מה שחשוב.",
    },
    {
      title: "דינמיקה מאזנת",
      text: "גל ישיר, יוזם ובטוח בעמדותיו — תכונות שמשלימות את הצד היותר שקול והמקשיב שלך. הוא מביא אנרגיה של הובלה רגועה, בלי להיות שתלטני.",
    },
    {
      title: "סגנון תקשורת דומה",
      text: "שניכם מעדיפים לפתור דברים בשיחה ישירה ורגועה, בלי דרמות. כששניהם מגיעים ממקום של כבוד ופתיחות — זו קרקע יציבה מאוד לזוגיות.",
    },
  ],
  dateIdea: "נסו מסעדה חדשה שאף אחד מכם לא הכיר — אולי מטבח שלא ניסיתם. גל אוהב אוכל ותרבות, ולך חשוב שהדייט ירגיש אותנטי ולא מאולץ. מקום עם אווירה טובה וארוחה משותפת זה הבסיס המושלם לשיחה ראשונה.",
  caveat: "שימו לב לנקודה אחת: גל צריך מרחב ועצמאות בזוגיות, ולך חשוב חיבור רגשי ונוכחות. זה לא סתירה — אבל כדאי לדבר על זה בגלוי מוקדם. כשהציפיות ברורות, זה הופך מנקודת חיכוך לנקודת חוזק.",
};

export default function MatchCard({ user, onBack }: MatchCardProps) {
  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  const isFemale = user.gender === "woman";
  const match = DEMO_MATCH;

  return (
    <div style={{ flex: 1, overflowY: "auto", direction: "rtl", background: "#f9fafb" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", boxShadow: "0 4px 20px rgba(99,102,241,0.3)",
          }}>
            <span style={{ fontSize: 28 }}>💜</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 6px" }}>
            {user.first_name} ו{match.partnerName}
          </h2>
          <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
            ציון התאמה: <span style={{ fontWeight: 700, color: "#6366f1", fontSize: 18 }}>{match.matchScore}%</span>
          </p>
        </div>

        {/* Partner intro */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e5e7eb", marginBottom: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>
            קצת על {match.partnerName}
          </h3>
          <p style={{ fontSize: 14, color: "#444", lineHeight: 1.8, margin: 0 }}>
            {match.partnerIntro}
          </p>
        </div>

        {/* Connection points */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e5e7eb", marginBottom: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 14px" }}>
            למה אנחנו חושבים שזה יכול לעבוד
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {match.connectionPoints.map((point, i) => (
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
                      width: 24, height: 24, borderRadius: "50%",
                      background: "#6366f1", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#2a2a3e" }}>{point.title}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#999", transition: "transform 0.2s", transform: expandedSection === i ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                </div>
                {expandedSection === i && (
                  <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7, margin: "10px 0 0 34px" }}>
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
          border: "1px solid #e5e7eb", marginBottom: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 10px" }}>
            🍽️ רעיון לדייט ראשון
          </h3>
          <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7, margin: 0 }}>
            {match.dateIdea}
          </p>
        </div>

        {/* Caveat */}
        <div style={{
          background: "#fffbeb", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #fde68a", marginBottom: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#92400e", margin: "0 0 10px" }}>
            💡 שימו לב
          </h3>
          <p style={{ fontSize: 13, color: "#78350f", lineHeight: 1.7, margin: 0 }}>
            {match.caveat}
          </p>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "12px 0 24px" }}>
          <p style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6, margin: 0 }}>
            הכרטיס הזה הופק על ידי המערכת על בסיס ניתוח אישיות מעמיק.
            <br />המידע המוצג הוא כללי ולא כולל פרטים אישיים רגישים.
          </p>
        </div>

      </div>
    </div>
  );
}
