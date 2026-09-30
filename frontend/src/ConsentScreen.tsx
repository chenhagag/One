import { useState } from "react";
import { apiFetch } from "./lib/api";
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
  const ww = user.gender === "woman" && !!user.looking_for_gender && user.looking_for_gender !== "man";

  async function handleAccept() {
    if (!checked) return;
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch(`/users/${user.id}`, {
        method: "PATCH",
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
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      backgroundImage: "linear-gradient(rgba(255,255,255,0.4), rgba(255,255,255,0.4)), url(/background.png)",
      backgroundSize: "cover", backgroundPosition: "center",
      padding: "32px 24px",
    }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "right", direction: "rtl" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/iconOnly.png" alt="One" style={{ height: 48, objectFit: "contain", marginBottom: 14 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>
            לפני שמתחילים
          </h1>
        </div>

        {/* Content card */}
        <div style={{
          background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
          borderRadius: 18, padding: "22px 24px",
          boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
          display: "flex", flexDirection: "column", gap: 12,
          fontSize: 14, color: "#4b5563", lineHeight: 1.75,
        }}>
          <p style={{ margin: 0 }}>
            One היא אפליקציית שידוכים {ww ? "לנשים, " : ""}שנועדה להכיר אותך לעומק — להבין מה חשוב לך, מה מושך אותך, מה נכון לך בקשר, ואיזה סוג חיבור באמת יכול להתאים לך.
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
            המידע {f ? "שתשתפי" : "שתשתף"} לא יוצג {ww ? "למשתמשות אחרות" : "למשתמשים אחרים"}, לא יימכר לצדדים שלישיים, ויישמר בהתאם לצורכי השירות.
          </p>

          <p style={{ margin: 0 }}>
            התובנות של ה־AI הן הערכות בלבד, ולא אבחון מקצועי או קביעה סופית {f ? "לגבייך" : "לגביך"}.
          </p>

          <p style={{ margin: 0 }}>
            אפשר לפנות אלינו בכל שלב כדי לבקש לעיין במידע שלך, לתקן אותו או למחוק את החשבון, בכפוף לדין.
          </p>
        </div>

        {/* Checkbox */}
        <div style={{
          background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
          borderRadius: 18, padding: "18px 24px", marginTop: 16,
          boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
        }}>
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
            width: "100%", height: 52, borderRadius: 14,
            background: checked ? "#1a1a2e" : "#b0a8c0",
            color: "#fff", fontSize: 16, fontWeight: 600,
            border: "none", cursor: checked ? "pointer" : "not-allowed",
            opacity: loading ? 0.6 : 1, marginTop: 20,
            transition: "background 0.3s, opacity 0.2s",
            fontFamily: "inherit",
            boxShadow: checked ? "0 2px 8px rgba(26,26,46,0.15)" : "none",
          }}
        >
          {loading ? "שומר..." : "המשך"}
        </button>

        {error && (
          <p style={{ fontSize: 13, color: "#ef4444", textAlign: "center", marginTop: 12, background: "rgba(255,255,255,0.8)", borderRadius: 10, padding: "8px 12px" }}>{error}</p>
        )}
      </div>
    </div>
  );
}
