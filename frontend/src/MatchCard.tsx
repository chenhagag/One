import { useState } from "react";

interface MatchCardProps {
  user: { id: number; first_name: string; gender?: string };
  onBack: () => void;
}

// Demo match card — Gaya (#130) & Ofir (#133)
const MATCH = {
  person1: {
    name: "גאיה",
    photo: "/demo/gaya.png",
    intro: `גאיה היא אישה עם עומק שקט. היא מלמדת עברית באולפן, מפקחת דידקטית, ובזמנה החופשי מייעצת לסטארטאפ בתחום ה-EdTech. יש לה תואר בפסיכולוגיה, סקרנות טבעית לאנשים ולמה שמניע אותם, ויכולת נדירה להקשיב ולקרוא בין השורות.

חבריה מתארים אותה כמכילה, סבלנית ואינטליגנטית רגשית. היא לא מהאנשים שתופסים את הזרקור — אבל מי שמכיר אותה לעומק יודע שמדובר באישה עם ראש חד, ערכים ברורים, ותפיסת עולם בוגרת.

גאיה אוהבת מסעדות טובות, שיחות ארוכות, טיולים עירוניים ומשחקי קופסה. היא מאמינה שהחיים קצרים ושצריך להפיק מהם את המיטב — בלי להתפשר על כנות ועל מה שבאמת חשוב.`,
  },
  person2: {
    name: "אופיר",
    photo: "/demo/ofir.png",
    intro: `אופיר הוא יזם שקט עם ראש פילוסופי. הוא מפתח פלטפורמה חינוכית שמשלבת הוראה אנושית עם AI — חזון שנובע מאמונה אמיתית שטכנולוגיה צריכה לשרת אנשים, לא להחליף אותם. הוא בעל תואר בפסיכולוגיה ופילוסופיה, ומתעניין בכמעט הכל — מתוך סקרנות טהורה, בלי צורך פרקטי.

חבריו מתארים אותו כ"טעם נרכש" — בנאדם שלא תמיד מבינים מיד, אבל ככל שמכירים אותו יותר, מגלים עומק, הומור וישירות מרגיעה. הוא מעדיף מעגל חברתי קטן ועמוק על פני הרבה מכרים.

אופיר אוהב מסעדות עם מנות מעניינות, שיחות שנמשכות עד מאוחר, וללמוד דברים חדשים בלי סיבה. יש לו קומפס מוסרי ברור ויכולת נדירה לדבר על דברים ברגיעה — גם כשהם מורכבים.`,
  },
  connectionPoints: [
    {
      title: "שפה משותפת שלא צריך לתרגם",
      text: "לשניכם תואר בפסיכולוגיה ועולם מקצועי שנוגע ב-EdTech — מה שאומר שיש ביניכם שפה משותפת גם ברמה האינטלקטואלית וגם ברמת ההבנה של אנשים. שיחה ביניכם לא תצטרך \"חימום\" — אתם כבר מדברים באותה שפה.",
    },
    {
      title: "ערכים שמסתנכרנים",
      text: "שניכם חילונים עם עמדה ברורה, מאמינים בחופש בחירה ובפתיחות מחשבתית, ומתנגדים לדוגמות. שניכם גם מעדיפים חיים של איכות — מסעדות, תרבות, שיחות עמוקות — על פני הרדיפה אחרי \"עוד\". הערכים האלה הם הבסיס שעליו נבנית זוגיות יציבה לאורך זמן.",
    },
    {
      title: "דינמיקה שמשלימה",
      text: "אופיר ישיר, בוטח ויודע להוביל כשצריך — לא מתוך שליטה, אלא מתוך בהירות. גאיה מביאה הקשבה עמוקה, אינטליגנציה רגשית ויכולת לראות מה קורה מתחת לפני השטח. השילוב הזה יוצר מרחב שבו שניכם יכולים להיות מי שאתם — בלי להתאמץ ובלי לוותר.",
    },
    {
      title: "סגנון תקשורת שעובד",
      text: "שניכם מעדיפים לפתור דברים בשיחה ישירה, בלי דרמות ובלי לתת לדברים להצטבר. הגישה הזו — ענייניות עם כבוד — היא אחד המנבאים החזקים ביותר לזוגיות בריאה ולטווח ארוך.",
    },
  ],
  dateIdea: "נסו מסעדה שאף אחד מכם לא הכיר — משהו עם מנות יצירתיות ואווירה שמזמינה שיחה. אתם שניכם אנשים שנפתחים בסביבה הנכונה, וארוחה טובה עם אוכל מעניין זה בדיוק הבסיס לשיחה ראשונה שתזרום בטבעיות.",
  caveat: "נקודה אחת שכדאי לשים לב אליה: לאופיר חשוב מרחב אישי ועצמאות, ולגאיה חשובים חיבור רגשי ונוכחות. זה לא סתירה — זה דווקא הזדמנות. כשמדברים על זה בגלוי ומוקדם, זה הופך מנקודת שאלה לנקודת חוזק.",
};

export default function MatchCard({ user, onBack }: MatchCardProps) {
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  return (
    <div style={{ flex: 1, overflowY: "auto", direction: "rtl", background: "#f9fafb" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px" }}>

        {/* Header — photos with connection */}
        <div style={{ textAlign: "center", marginBottom: 28, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 16 }}>
            {/* Person 1 photo */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 88, height: 88, borderRadius: "50%", overflow: "hidden",
                border: "3px solid #e0ddf5", boxShadow: "0 4px 16px rgba(99,102,241,0.15)",
              }}>
                <img src={MATCH.person1.photo} alt={MATCH.person1.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>{MATCH.person1.name}</span>
            </div>

            {/* Connection symbol */}
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

            {/* Person 2 photo */}
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

          <p style={{ fontSize: 13, color: "#888", margin: 0, lineHeight: 1.6 }}>
            כרטיס התאמה אישי — הופק על ידי One
          </p>
        </div>

        {/* Person 1 intro */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e5e7eb", marginBottom: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#6366f1", margin: "0 0 12px" }}>
            {MATCH.person1.name}
          </h3>
          <p style={{ fontSize: 13.5, color: "#444", lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>
            {MATCH.person1.intro}
          </p>
        </div>

        {/* Person 2 intro */}
        <div style={{
          background: "#fff", borderRadius: 14, padding: "20px 22px",
          border: "1px solid #e5e7eb", marginBottom: 14,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#6366f1", margin: "0 0 12px" }}>
            {MATCH.person2.name}
          </h3>
          <p style={{ fontSize: 13.5, color: "#444", lineHeight: 1.85, margin: 0, whiteSpace: "pre-wrap" }}>
            {MATCH.person2.intro}
          </p>
        </div>

        {/* Connection points */}
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
            רעיון לדייט ראשון
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
            שימו לב
          </h3>
          <p style={{ fontSize: 13, color: "#713f12", lineHeight: 1.75, margin: 0 }}>
            {MATCH.caveat}
          </p>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
          <p style={{ fontSize: 11, color: "#bbb", lineHeight: 1.6, margin: 0 }}>
            הכרטיס הופק על ידי One על בסיס ניתוח אישיות מעמיק.
            <br />המידע המוצג הוא כללי ואינו כולל פרטים רגישים.
          </p>
        </div>

      </div>
    </div>
  );
}
