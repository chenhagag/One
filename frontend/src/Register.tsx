import { useState, useEffect } from "react";
import { User } from "./App";

/**
 * Registration Form — based on "טופס הזנה" sheet
 *
 * Sections:
 * 1. About me: name, gender, age, city, height, look style
 * 2. Looking for: gender, age range + flexibility, height range + flexibility, location range
 */

interface EnumOption {
  value: string;
  label_he: string;
  label_en: string;
}

const s: Record<string, React.CSSProperties> = {
  heading: { marginTop: 0, marginBottom: 8, fontSize: 22 },
  sub: { color: "#666", marginBottom: 32, marginTop: 0 },
  section: { marginBottom: 28, padding: "20px", background: "#fafafa", borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0, color: "#333" },
  label: { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#444" },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid #ddd",
    borderRadius: 8,
    boxSizing: "border-box" as const,
    marginBottom: 16,
    outline: "none",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid #ddd",
    borderRadius: 8,
    boxSizing: "border-box" as const,
    marginBottom: 16,
    outline: "none",
    background: "#fff",
  },
  row: { display: "flex", gap: 12, marginBottom: 16 },
  rowItem: { flex: 1 },
  checkboxGroup: { display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 16 },
  chip: {
    padding: "6px 14px",
    borderRadius: 20,
    border: "1px solid #ddd",
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  chipActive: {
    padding: "6px 14px",
    borderRadius: 20,
    border: "1px solid #1a1a1a",
    background: "#1a1a1a",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
  },
  btn: {
    width: "100%",
    padding: "14px",
    fontSize: 16,
    fontWeight: 600,
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    marginTop: 8,
  },
  error: { color: "#c0392b", fontSize: 13, marginTop: 10 },
};

export default function Register({ onSuccess }: { onSuccess: (u: User) => void }) {
  // Form state
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
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

  // Enum options from server
  const [enums, setEnums] = useState<Record<string, EnumOption[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load enum options on mount
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
      .catch(() => {}); // Silently fail — form still works with hardcoded fallbacks
  }, []);

  function toggleStyle(val: string) {
    setSelfStyle((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !email.trim()) {
      setError("שם ואימייל הם שדות חובה");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          email: email.trim(),
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      // Parse self_style back from JSON string
      const user: User = {
        ...data,
        self_style: data.self_style ? JSON.parse(data.self_style) : null,
      };
      onSuccess(user);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  // Helper to get options for a category
  const opts = (cat: string): EnumOption[] => enums[cat] || [];

  return (
    <form onSubmit={handleSubmit} dir="rtl">
      <h2 style={s.heading}>הרשמה ל-MatchMe</h2>
      <p style={s.sub}>רק כמה פרטים בסיסיים כדי להתחיל</p>

      <div style={s.section}>
        <label style={s.label}>שם *</label>
        <input
          style={s.input}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="השם שלך"
          required
        />

        <label style={s.label}>אימייל *</label>
        <input
          style={{ ...s.input, direction: "ltr", textAlign: "right" }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
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
      </div>

      <button style={s.btn} type="submit" disabled={loading}>
        {loading ? "...נרשם" : "הרשמה"}
      </button>

      {error && <p style={s.error}>{error}</p>}
    </form>
  );
}
