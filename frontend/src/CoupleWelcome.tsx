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

  return (
    <div style={{
      display: "flex", minHeight: "100dvh", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#fff",
      padding: "env(safe-area-inset-top, 0px) 24px 24px",
    }}>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "right" }} dir="rtl">
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/iconOnly.png" alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", marginBottom: 10 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px", lineHeight: 1.5 }}>
            הזוגיות שלכן יכולה לעזור ל־One למצוא חיבורים טובים יותר
          </h1>
        </div>

        <div style={{
          background: "#fff", border: "1px solid #e8e4ee", borderRadius: 16,
          padding: "20px 22px", boxShadow: "0 1px 4px rgba(139,123,168,0.06)",
          display: "flex", flexDirection: "column", gap: 14,
          fontSize: 14, color: "#4b5563", lineHeight: 1.7,
        }}>
          <p style={{ margin: 0 }}>
            תודה שהצטרפת! את ובת זוגך עוזרות ל־One ללמוד מזוגיות קיימת — להכיר שתי נשים שבחרו זו בזו, ולהבין מה מחבר ביניהן.
          </p>

          <p style={{ margin: 0 }}>
            כל אחת מכן תעבור את תהליך ההיכרות של One: שיחה, שאלות וניתוח אישי. כדי שנוכל ללמוד מהחיבור שלכן, נבקש ממך לציין מי בת הזוג שלך ולקשר בין הפרופילים שלכן.
          </p>

          <p style={{ margin: 0 }}>
            בסיום, כל אחת מכן תקבל תובנות אישיות על עצמה, ושתיכן תקבלו גם תובנות על הזוגיות שלכן.
          </p>

          <p style={{ margin: 0, fontWeight: 600, color: "#1a1a2e" }}>
            תודה שאתן עוזרות לנו לדייק את One — ולנשים אחרות למצוא את החיבור שלהן.
          </p>
        </div>

        {/* Partner details */}
        <div style={{
          background: "#fff", border: "1px solid #e8e4ee", borderRadius: 16,
          padding: "20px 22px", marginTop: 16,
          boxShadow: "0 1px 4px rgba(139,123,168,0.06)",
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 14px" }}>
            פרטי בת הזוג
          </p>

          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#1a1a2e" }}>
            שם בת הזוג
          </label>
          <input
            value={partnerName}
            onChange={e => setPartnerName(e.target.value)}
            placeholder="שם מלא"
            style={{
              width: "100%", padding: "10px 14px", fontSize: 15,
              border: "1px solid #e0dce6", borderRadius: 10,
              boxSizing: "border-box", marginBottom: 14, outline: "none",
              fontFamily: "inherit",
            }}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#1a1a2e" }}>
            אימייל בת הזוג
          </label>
          <input
            type="email"
            value={partnerEmail}
            onChange={e => setPartnerEmail(e.target.value)}
            placeholder="כתובת האימייל שלה"
            dir="ltr"
            style={{
              width: "100%", padding: "10px 14px", fontSize: 15,
              border: "1px solid #e0dce6", borderRadius: 10,
              boxSizing: "border-box", marginBottom: 4, outline: "none",
              fontFamily: "inherit", textAlign: "left",
            }}
          />
          <p style={{ fontSize: 11, color: "#aaa", margin: "4px 0 0" }}>
            לצרכי זיהוי — כדי שנוכל לקשר ביניכן
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", height: 50, borderRadius: 14,
            background: "#1a1a2e", color: "#fff",
            fontSize: 16, fontWeight: 600,
            border: "none", cursor: "pointer",
            opacity: loading ? 0.5 : 1, marginTop: 20,
            fontFamily: "inherit",
          }}
        >
          {loading ? "שומר..." : "בואי נתחיל"}
        </button>

        {error && (
          <p style={{ fontSize: 13, color: "#ef4444", textAlign: "center", marginTop: 12 }}>{error}</p>
        )}
      </div>
    </div>
  );
}
