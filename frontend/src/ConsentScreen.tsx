import { useState } from "react";
import type { User } from "./App";

interface ConsentScreenProps {
  user: User;
  onComplete: (user: User) => void;
}

export default function ConsentScreen({ user, onComplete }: ConsentScreenProps) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const f = user.gender === "woman"; // female text forms

  async function handleAccept() {
    if (!checked) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent_accepted: true }),
      });

      if (!res.ok) {
        setError("שגיאה בשמירה, נסו שוב");
        return;
      }

      const updated = await res.json();
      onComplete(updated);
    } catch {
      setError("שגיאת רשת, נסו שוב");
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
          <img src="/roundLogo.png" alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", marginBottom: 10 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
            לפני שמתחילים
          </h1>
        </div>

        <div style={{
          background: "#fff", border: "1px solid #e8e4ee", borderRadius: 16,
          padding: "20px 22px", boxShadow: "0 1px 4px rgba(139,123,168,0.06)",
          display: "flex", flexDirection: "column", gap: 14,
          fontSize: 14, color: "#4b5563", lineHeight: 1.7,
        }}>
          <p style={{ margin: 0 }}>
            One היא אפליקציית שידוכים שנועדה להכיר אותך לעומק — להבין מה חשוב לך, מה מושך אותך, מה נכון לך בקשר, ואיזה סוג חיבור באמת יכול להתאים לך.
          </p>

          <p style={{ margin: 0 }}>
            במקום להציף אותך בעשרות אפשרויות, One עוברת איתך תהליך אישי וממוקד. דרך שיחה ושאלות עומק, היא לומדת את ההעדפות, הסגנון והצרכים שלך — ומשתמשת בזה כדי להציע לך התאמה אחת מדויקת.
          </p>

          <p style={{ margin: 0 }}>
            One משתמשת ב־AI כדי לנהל את השיחה, לנתח את המידע ולהפיק תובנות.
          </p>

          <p style={{ margin: 0 }}>
            במהלך השימוש נאסוף ונעבד מידע {f ? "שתשתפי" : "שתשתף"} — למשל תשובות בשיחה, תחומי עניין, העדפות ופרטי פרופיל. המידע ישמש להפעלת השירות, הפקת תובנות ודיוק ההתאמה.
          </p>

          <p style={{ margin: 0 }}>
            המידע {f ? "שתשתפי" : "שתשתף"} לא יוצג למשתמשים אחרים, לא יימכר לצדדים שלישיים, ויישמר בהתאם לצורכי השירות.
          </p>

          <p style={{ margin: 0 }}>
            התובנות של ה־AI הן הערכות בלבד, ולא אבחון מקצועי או קביעה סופית {f ? "לגבייך" : "לגביך"}.
          </p>

          <p style={{ margin: 0 }}>
            אפשר לפנות אלינו בכל שלב כדי לבקש לעיין במידע שלך, לתקן אותו או למחוק את החשבון, בכפוף לדין.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            cursor: "pointer", fontSize: 14, color: "#1a1a2e", lineHeight: 1.6,
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ marginTop: 4, width: 18, height: 18, cursor: "pointer", accentColor: "#8b7ba8", flexShrink: 0 }}
            />
            <span>
              {f ? "קראתי ואני מסכימה" : "קראתי ואני מסכים"} ל<a href="/terms" target="_blank" style={{ color: "#8b7ba8", textDecoration: "underline" }}>תנאי השימוש</a> ול<a href="/privacy" target="_blank" style={{ color: "#8b7ba8", textDecoration: "underline" }}>מדיניות הפרטיות</a>, {f ? "ומסכימה" : "ומסכים"} ש־One תשתמש במידע שאשתף לצורך ניתוח באמצעות AI, יצירת תובנות והצעת התאמות.
            </span>
          </label>
        </div>

        <button
          onClick={handleAccept}
          disabled={!checked || loading}
          style={{
            width: "100%", height: 50, borderRadius: 14,
            background: checked ? "#1a1a2e" : "#d1d5db",
            color: "#fff", fontSize: 16, fontWeight: 600,
            border: "none", cursor: checked ? "pointer" : "not-allowed",
            opacity: loading ? 0.5 : 1, marginTop: 20,
            transition: "background 0.2s",
            fontFamily: "inherit",
          }}
        >
          {loading ? "שומר..." : "המשך"}
        </button>

        {error && (
          <p style={{ fontSize: 13, color: "#ef4444", textAlign: "center", marginTop: 12 }}>{error}</p>
        )}
      </div>
    </div>
  );
}
