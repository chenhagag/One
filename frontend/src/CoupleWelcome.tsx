import { useState } from "react";
import { apiFetch } from "./lib/api";
import type { User } from "./App";

interface CoupleWelcomeProps {
  user: User;
  onComplete: (updatedUser: User) => void;
}

export default function CoupleWelcome({ user, onComplete }: CoupleWelcomeProps) {
  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  async function handleSubmit() {
    if (!partnerName.trim()) {
      setError("יש להזין את שם בת הזוג");
      return;
    }
    if (!partnerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail.trim())) {
      setError("יש להזין כתובת אימייל תקינה");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          test_user_type: "Couple Tester",
          partner_name: partnerName.trim(),
          partner_email: partnerEmail.trim(),
        }),
      });
      if (!res.ok) {
        setError("שגיאה בשמירה, נסי שוב");
        return;
      }
      const updated = await res.json();
      onComplete(updated);
    } catch {
      setError("שגיאת רשת, נסי שוב");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = (name: string): React.CSSProperties => ({
    width: "100%", padding: "12px 16px", fontSize: 15,
    border: `1.5px solid ${focused === name ? "#8b7ba8" : "#e0dce6"}`,
    borderRadius: 12, boxSizing: "border-box", outline: "none",
    fontFamily: "inherit", transition: "border-color 0.2s",
    background: "#faf9fc",
  });

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      backgroundImage: "linear-gradient(rgba(255,255,255,0.4), rgba(255,255,255,0.4)), url(/background.png)",
      backgroundSize: "cover", backgroundPosition: "center",
      padding: "32px 24px",
    }}>
      <div style={{ maxWidth: 480, width: "100%", direction: "rtl" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/iconOnly.png" alt="One" style={{ height: 48, objectFit: "contain", marginBottom: 14 }} />
          <h1 style={{
            fontSize: 19, fontWeight: 700, color: "#1a1a2e",
            margin: "0 0 6px", lineHeight: 1.6,
          }}>
            הזוגיות שלכן יכולה לעזור ל־One<br />למצוא חיבורים טובים יותר
          </h1>
          <p style={{ fontSize: 13, color: "#8b7ba8", margin: 0, fontWeight: 500 }}>
            {user.first_name}, תודה שהצטרפת
          </p>
        </div>

        {/* Explanation card */}
        <div style={{
          background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
          borderRadius: 18, padding: "22px 24px",
          boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
          marginBottom: 16,
        }}>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#4b5563", lineHeight: 1.75 }}>
            את ובת זוגך עוזרות ל־One ללמוד מזוגיות קיימת — להכיר שתי נשים שבחרו זו בזו, ולהבין מה מחבר ביניהן.
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#4b5563", lineHeight: 1.75 }}>
            כל אחת מכן תעבור את תהליך ההיכרות של One: שיחה, שאלות וניתוח אישי. כדי שנוכל ללמוד מהחיבור שלכן, נבקש ממך לציין מי בת הזוג שלך ולקשר בין הפרופילים שלכן.
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#4b5563", lineHeight: 1.75 }}>
            בסיום, כל אחת מכן תקבל תובנות אישיות על עצמה, ושתיכן תקבלו גם תובנות על הזוגיות שלכן.
          </p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1a1a2e", lineHeight: 1.75 }}>
            תודה שאתן עוזרות לנו לדייק את One — ולנשים אחרות למצוא את החיבור שלהן.
          </p>
        </div>

        {/* Partner details card */}
        <div style={{
          background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
          borderRadius: 18, padding: "22px 24px",
          boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 16px" }}>
            פרטי בת הזוג
          </p>

          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#555" }}>
            שם בת הזוג
          </label>
          <input
            value={partnerName}
            onChange={e => setPartnerName(e.target.value)}
            onFocus={() => setFocused("name")}
            onBlur={() => setFocused(null)}
            placeholder="שם מלא"
            style={{ ...inputStyle("name"), marginBottom: 16 }}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#555" }}>
            אימייל בת הזוג
          </label>
          <input
            type="email"
            value={partnerEmail}
            onChange={e => setPartnerEmail(e.target.value)}
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            placeholder="כתובת האימייל שלה"
            dir="ltr"
            style={{ ...inputStyle("email"), textAlign: "left" }}
          />
          <p style={{ fontSize: 11, color: "#aaa", margin: "6px 0 0" }}>
            לצרכי זיהוי — כדי שנוכל לקשר ביניכן
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", height: 52, borderRadius: 14,
            background: "#1a1a2e", color: "#fff",
            fontSize: 16, fontWeight: 600,
            border: "none", cursor: "pointer",
            opacity: loading ? 0.6 : 1, marginTop: 20,
            fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(26,26,46,0.15)",
            transition: "opacity 0.2s",
          }}
        >
          {loading ? "שומר..." : "בואי נתחיל"}
        </button>

        {error && (
          <p style={{ fontSize: 13, color: "#ef4444", textAlign: "center", marginTop: 12, background: "rgba(255,255,255,0.8)", borderRadius: 10, padding: "8px 12px" }}>{error}</p>
        )}
      </div>
    </div>
  );
}
