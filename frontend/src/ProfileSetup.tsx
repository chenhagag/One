import { useState, useEffect } from "react";
import { apiFetch } from "./lib/api";
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
  const [firstName, setFirstName] = useState(user.first_name || "");
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
  const [locationRange, setLocationRange] = useState("my_area");
  const [testUserType, setTestUserType] = useState("");
  const [partnerName, setPartnerName] = useState("");

  const [enums, setEnums] = useState<Record<string, EnumOption[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/enum-options")
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

  // Inline styles matching the Register.tsx look
  const s: Record<string, React.CSSProperties> = {
    section: { marginBottom: 28, padding: "20px", background: "#fafafa", borderRadius: 12 },
    label: { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#444" },
    input: {
      width: "100%", padding: "10px 12px", fontSize: 15,
      border: "1px solid #ddd", borderRadius: 8,
      boxSizing: "border-box" as const, marginBottom: 16, outline: "none",
    },
    select: {
      width: "100%", padding: "10px 12px", fontSize: 15,
      border: "1px solid #ddd", borderRadius: 8,
      boxSizing: "border-box" as const, marginBottom: 16, outline: "none", background: "#fff",
    },
    chip: {
      padding: "6px 14px", borderRadius: 20,
      border: "1px solid #ddd", background: "#fff",
      fontSize: 13, cursor: "pointer", transition: "all 0.15s",
    },
    chipActive: {
      padding: "6px 14px", borderRadius: 20,
      border: "1px solid #1a1a1a", background: "#1a1a1a",
      color: "#fff", fontSize: 13, cursor: "pointer",
    },
    btn: {
      width: "100%", padding: "14px", fontSize: 16, fontWeight: 600,
      background: "#1a1a1a", color: "#fff", border: "none",
      borderRadius: 8, cursor: "pointer", marginTop: 8,
    },
    error: { color: "#c0392b", fontSize: 13, marginTop: 10 },
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={handleSubmit} dir="rtl">
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 22 }}>השלמת פרופיל</h2>
        <p style={{ color: "#666", marginBottom: 32, marginTop: 0 }}>
          עוד כמה פרטים כדי שנוכל למצוא לך את ההתאמה המושלמת
        </p>

        <div style={s.section}>
          <label style={s.label}>שם *</label>
          <input
            style={s.input}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="השם שלך"
            required
          />

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

          <label style={s.label}>סוג משתמש לבדיקות</label>
          <select style={s.select} value={testUserType} onChange={(e) => { setTestUserType(e.target.value); if (e.target.value !== "Couple Tester") setPartnerName(""); }}>
            <option value="">בחר/י</option>
            <option value="Couple Tester">אני בזוגיות ועוזר/ת בבדיקות שידוך</option>
            <option value="User Experience Tester">אני רווק/ה ועוזר/ת בבדיקות מערכת</option>
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

        <button style={s.btn} type="submit" disabled={loading}>
          {loading ? "...שומר" : "בואו נתחיל"}
        </button>

        {error && <p style={s.error}>{error}</p>}
      </form>
    </div>
  );
}
