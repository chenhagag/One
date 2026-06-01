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

  async function handleAccept() {
    if (!checked) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/admin/users/${user.id}`, {
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
      padding: "0 24px",
    }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "right" }} dir="rtl">
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 24, textAlign: "center" }}>
          לפני שמתחילים
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 14, color: "#4b5563", lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            One משתמשת ב־AI כדי לנהל איתך שיחה, להבין טוב יותר את ההעדפות והסגנון שלך, ולהציע התאמות רלוונטיות יותר.
          </p>

          <p style={{ margin: 0 }}>
            במהלך השימוש נאסוף ונעבד את המידע שתבחרי לשתף — למשל תשובות בשיחה, תחומי עניין, העדפות ופרטי פרופיל. המידע ישמש להפעלת השירות, יצירת תובנות, התאמות ושיפור המערכת.
          </p>

          <p style={{ margin: 0 }}>
            המידע שתשתפי בשיחה מיועד לעיבוד על ידי מערכת ה־AI של One בלבד, ולא יוצג או ישותף עם משתמשים אחרים או עם גורמים חיצוניים.
          </p>

          <p style={{ margin: 0 }}>
            התובנות של ה־AI הן הערכות בלבד ולא אבחון מקצועי או קביעה סופית לגבייך.
          </p>

          <p style={{ margin: 0 }}>
            המידע שלך לא יימכר לצדדים שלישיים. אפשר לבקש מאיתנו לעיין במידע, לתקן אותו או למחוק את החשבון, בהתאם למדיניות הפרטיות.
          </p>
        </div>

        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          marginTop: 28, cursor: "pointer", fontSize: 14, color: "#111827", lineHeight: 1.6,
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 4, width: 18, height: 18, cursor: "pointer", accentColor: "#111827", flexShrink: 0 }}
          />
          <span>
            אני מאשר/ת שקראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות, כולל שימוש ב־AI לעיבוד המידע שאשתף ב־One.
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!checked || loading}
          style={{
            width: "100%", height: 48, borderRadius: 12,
            background: checked ? "#111827" : "#d1d5db",
            color: "#fff", fontSize: 15, fontWeight: 500,
            border: "none", cursor: checked ? "pointer" : "not-allowed",
            opacity: loading ? 0.5 : 1, marginTop: 20,
            transition: "background 0.2s",
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
