import { useState, useEffect } from "react";
import { apiFetch } from "./lib/api";
import { getApiBaseUrl } from "./lib/platform";
import type { User } from "./App";

/**
 * Post-OAuth profile completion form.
 * Shown after first OAuth sign-in when profile_complete is false.
 * Collects the same fields as Register.tsx minus email (which comes from OAuth).
 */

interface EnumOption {
  value: string;
  label_he: string;
  label_en: string;
}

interface ProfileSetupProps {
  user: User;
  onComplete: (updatedUser: User) => void;
}

export default function ProfileSetup({ user, onComplete }: ProfileSetupProps) {
  // Don't pre-fill from user object — let user type their own name
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [lookingForGender, setLookingForGender] = useState("");
  const [city, setCity] = useState("");
  const [height, setHeight] = useState("");
  const [selfStyle, setSelfStyle] = useState<string[]>([]);
  const [desiredAgeMin, setDesiredAgeMin] = useState("");
  const [desiredAgeMax, setDesiredAgeMax] = useState("");
  const [ageFlex, setAgeFlex] = useState("slightly_flexible");
  const [desiredHeightMin, setDesiredHeightMin] = useState("");
  const [desiredHeightMax, setDesiredHeightMax] = useState("");
  const [heightFlex, setHeightFlex] = useState("slightly_flexible");
  const [locationRange, setLocationRange] = useState("bit_further");
  const [testUserType, setTestUserType] = useState("User Experience Tester");
  const [partnerName, setPartnerName] = useState("");
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const [enums, setEnums] = useState<Record<string, EnumOption[]>>({});
  const [cities, setCities] = useState<{ city_name: string; region: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/admin/enum-options")
      .then((r) => r.json())
      .then((data: any[]) => {
        const grouped: Record<string, EnumOption[]> = {};
        for (const item of data) {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
        }
        setEnums(grouped);
      })
      .catch(() => {});
  }, []);

  function toggleStyle(val: string) {
    setSelfStyle((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim()) {
      setError("שם הוא שדה חובה");
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName.trim(),
          age: age ? parseInt(age) : null,
          gender: gender || null,
          looking_for_gender: lookingForGender || null,
          city: city.trim() || null,
          height: height ? parseInt(height) : null,
          self_style: selfStyle.length > 0 ? selfStyle : null,
          desired_age_min: desiredAgeMin ? parseInt(desiredAgeMin) : null,
          desired_age_max: desiredAgeMax ? parseInt(desiredAgeMax) : null,
          age_flexibility: ageFlex,
          desired_height_min: desiredHeightMin ? parseInt(desiredHeightMin) : null,
          desired_height_max: desiredHeightMax ? parseInt(desiredHeightMax) : null,
          height_flexibility: heightFlex,
          desired_location_range: locationRange,
          test_user_type: testUserType || null,
          partner_name: partnerName.trim() || null,
          email_updates: emailUpdates,
          whatsapp_updates: whatsappUpdates,
          whatsapp_phone: whatsappPhone.trim() || null,
          profile_complete: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save profile");
        return;
      }

      let self_style = data.self_style;
      if (typeof self_style === "string") {
        try { self_style = JSON.parse(self_style); } catch { self_style = null; }
      }
      onComplete({ ...data, self_style });
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  const opts = (cat: string): EnumOption[] => enums[cat] || [];

  // Inline styles — elegant black/lilac theme
  const s: Record<string, React.CSSProperties> = {
    section: { marginBottom: 24, padding: "20px 20px 4px", background: "#fff", borderRadius: 16, border: "1px solid #e8e4ee", boxShadow: "0 1px 4px rgba(139,123,168,0.06)" },
    label: { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#1a1a2e" },
    input: {
      width: "100%", padding: "10px 14px", fontSize: 15,
      border: "1px solid #e0dce6", borderRadius: 10,
      boxSizing: "border-box" as const, marginBottom: 16, outline: "none",
      fontFamily: "inherit",
    },
    select: {
      width: "100%", padding: "10px 14px", fontSize: 15,
      border: "1px solid #e0dce6", borderRadius: 10,
      boxSizing: "border-box" as const, marginBottom: 16, outline: "none", background: "#fff",
      fontFamily: "inherit",
    },
    chip: {
      padding: "6px 14px", borderRadius: 20,
      border: "1px solid #e0dce6", background: "#fff",
      fontSize: 13, cursor: "pointer", transition: "all 0.15s",
      fontFamily: "inherit",
    },
    chipActive: {
      padding: "6px 14px", borderRadius: 20,
      border: "1px solid #8b7ba8", background: "#8b7ba8",
      color: "#fff", fontSize: 13, cursor: "pointer",
      fontFamily: "inherit",
    },
    btn: {
      width: "100%", padding: "14px", fontSize: 16, fontWeight: 600,
      background: "#1a1a2e", color: "#fff", border: "none",
      borderRadius: 14, cursor: "pointer", marginTop: 8,
      fontFamily: "inherit",
    },
    error: { color: "#c0392b", fontSize: 13, marginTop: 10 },
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <form onSubmit={handleSubmit} dir="rtl">
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/roundLogo.png" alt="" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", marginBottom: 12 }} />
          <h2 style={{ marginTop: 0, marginBottom: 6, fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>נתוני פתיחה</h2>
          <p style={{ color: "#888", marginBottom: 0, marginTop: 0, fontSize: 14 }}>
            כמה פרטים טכניים, כדי שהמערכת תדע לכוון לאנשים הרלוונטיים עבורך.
          </p>
        </div>

        <div style={s.section}>
          <label style={s.label}>שם *</label>
          <input
            style={s.input}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="השם שלך"
            required
          />

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>גיל</label>
              <input style={s.input} type="number" min="18" max="99" value={age} onChange={(e) => setAge(e.target.value)} placeholder="גיל" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.label}>עיר</label>
              <input style={s.input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="עיר מגורים" list="setup-city-list" autoComplete="off" />
              <datalist id="setup-city-list">
                {cities.map(c => <option key={c.city_name} value={c.city_name} />)}
              </datalist>
              <p style={{ fontSize: 11, color: "#aaa", marginTop: -10, marginBottom: 8 }}>אם העיר שלך לא מופיעה — אפשר לבחור עיר קרובה</p>
            </div>
          </div>

          <label style={s.label}>מגדר</label>
          <select style={s.select} value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">בחר/י</option>
            {(opts("gender").length > 0 ? opts("gender") : [
              { value: "man", label_he: "גבר" },
              { value: "woman", label_he: "אישה" },
              { value: "undefined", label_he: "לא מוגדר" },
            ]).map((o) => (
              <option key={o.value} value={o.value}>{o.label_he}</option>
            ))}
          </select>

          <label style={s.label}>מחפש/ת</label>
          <select style={s.select} value={lookingForGender} onChange={(e) => setLookingForGender(e.target.value)}>
            <option value="">בחר/י</option>
            {(opts("looking_for_gender").length > 0 ? opts("looking_for_gender") : [
              { value: "man", label_he: "גבר" },
              { value: "woman", label_he: "אישה" },
              { value: "both", label_he: "שניהם" },
              { value: "doesnt_matter", label_he: "לא משנה" },
            ]).map((o) => (
              <option key={o.value} value={o.value}>{o.label_he}</option>
            ))}
          </select>

          <label style={s.label}>סטטוס</label>
          <select style={s.select} value={testUserType} onChange={(e) => { setTestUserType(e.target.value); if (e.target.value !== "Couple Tester") setPartnerName(""); }}>
            <option value="User Experience Tester">אני רווק/ה שמשתתף/ת ב-MVP</option>
            <option value="Couple Tester">אני בזוגיות ועוזר/ת לאימון המערכת</option>
          </select>

          {testUserType === "Couple Tester" && (
            <>
              <label style={s.label}>שם בן/בת הזוג (שם מלא)</label>
              <input
                style={s.input}
                type="text"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="שם מלא של בן/בת הזוג"
              />
            </>
          )}
        </div>

        <div style={{ ...s.section, background: "#f5f0fb", border: "1px solid #e8e0f0" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 12px" }}>עדכונים והתראות</p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, color: "#444", lineHeight: 1.6, marginBottom: 12 }}>
            <input type="checkbox" checked={emailUpdates} onChange={e => setEmailUpdates(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: "#8b7ba8", flexShrink: 0 }} />
            <span>אני מעוניין/ת לקבל עדכונים במייל לגבי התאמות ועדכונים חשובים (לא נשלח דיוור שיווקי)</span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, color: "#444", lineHeight: 1.6 }}>
            <input type="checkbox" checked={whatsappUpdates} onChange={e => setWhatsappUpdates(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: "#8b7ba8", flexShrink: 0 }} />
            <span>אני מעוניין/ת לקבל עדכונים גם בהודעות WhatsApp או SMS</span>
          </label>
          {whatsappUpdates && (
            <input
              style={{ ...s.input, marginTop: 10, marginBottom: 0 }}
              type="tel"
              value={whatsappPhone}
              onChange={e => setWhatsappPhone(e.target.value)}
              placeholder="מספר טלפון"
              dir="ltr"
            />
          )}
        </div>

        <button style={s.btn} type="submit" disabled={loading}>
          {loading ? "...שומר" : "בואו נתחיל"}
        </button>

        {error && <p style={s.error}>{error}</p>}
      </form>
    </div>
  );
}
