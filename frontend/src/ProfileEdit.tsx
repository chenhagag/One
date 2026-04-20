import { useState, useEffect } from "react";
import { User } from "./App";
import { ArrowRight } from "lucide-react";

interface EnumOption { value: string; label_he: string; label_en: string; }

export default function ProfileEdit({ user, onBack, onUserUpdate }: { user: User; onBack: () => void; onUserUpdate?: (u: User) => void }) {
  // About me
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [age, setAge] = useState(user.age ? String(user.age) : "");
  const [gender, setGender] = useState(user.gender || "");
  const [city, setCity] = useState(user.city || "");
  const [height, setHeight] = useState(user.height ? String(user.height) : "");
  // Looking for
  const [lookingForGender, setLookingForGender] = useState(user.looking_for_gender || "");
  const [desiredAgeMin, setDesiredAgeMin] = useState(user.desired_age_min ? String(user.desired_age_min) : "");
  const [desiredAgeMax, setDesiredAgeMax] = useState(user.desired_age_max ? String(user.desired_age_max) : "");
  const [ageFlex, setAgeFlex] = useState(user.age_flexibility || "slightly_flexible");
  const [desiredHeightMin, setDesiredHeightMin] = useState(user.desired_height_min ? String(user.desired_height_min) : "");
  const [desiredHeightMax, setDesiredHeightMax] = useState(user.desired_height_max ? String(user.desired_height_max) : "");
  const [heightFlex, setHeightFlex] = useState(user.height_flexibility || "slightly_flexible");
  const [locationRange, setLocationRange] = useState(user.desired_location_range || "my_area");

  const [enums, setEnums] = useState<Record<string, EnumOption[]>>({});
  const [cities, setCities] = useState<{ city_name: string; region: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Fetch fresh user data from pg on mount — don't rely on the stale
  // `user` prop from App.tsx (which was set at registration time).
  useEffect(() => {
    fetch(`/api/users/${user.id}`)
      .then(r => r.json())
      .then((u: any) => {
        if (u.first_name) setFirstName(u.first_name);
        if (u.age != null) setAge(String(u.age));
        if (u.gender) setGender(u.gender);
        if (u.city) setCity(u.city);
        if (u.height != null) setHeight(String(u.height));
        if (u.looking_for_gender) setLookingForGender(u.looking_for_gender);
        if (u.desired_age_min != null) setDesiredAgeMin(String(u.desired_age_min));
        if (u.desired_age_max != null) setDesiredAgeMax(String(u.desired_age_max));
        if (u.age_flexibility) setAgeFlex(u.age_flexibility);
        if (u.desired_height_min != null) setDesiredHeightMin(String(u.desired_height_min));
        if (u.desired_height_max != null) setDesiredHeightMax(String(u.desired_height_max));
        if (u.height_flexibility) setHeightFlex(u.height_flexibility);
        if (u.desired_location_range) setLocationRange(u.desired_location_range);
      })
      .catch(() => {});
  }, [user.id]);

  useEffect(() => {
    fetch("/api/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaved(false); setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          age: age ? parseInt(age) : null,
          gender: gender || null,
          looking_for_gender: lookingForGender || null,
          city: city.trim() || null,
          height: height ? parseInt(height) : null,
          desired_age_min: desiredAgeMin ? parseInt(desiredAgeMin) : null,
          desired_age_max: desiredAgeMax ? parseInt(desiredAgeMax) : null,
          age_flexibility: ageFlex,
          desired_height_min: desiredHeightMin ? parseInt(desiredHeightMin) : null,
          desired_height_max: desiredHeightMax ? parseInt(desiredHeightMax) : null,
          height_flexibility: heightFlex,
          desired_location_range: locationRange,
        }),
      });
      if (!res.ok) { const data = await res.json(); setError(data.error || "שגיאה בשמירה"); return; }
      const updatedUser = await res.json();
      if (onUserUpdate && updatedUser) onUserUpdate(updatedUser);
      onBack();
    } catch { setError("לא ניתן להתחבר לשרת"); }
    finally { setLoading(false); }
  }

  const opts = (cat: string): EnumOption[] => enums[cat] || [];
  const genderOptions = opts("gender").length > 0 ? opts("gender") : [
    { value: "man", label_he: "גבר", label_en: "" }, { value: "woman", label_he: "אישה", label_en: "" },
  ];
  const lookingForOptions = opts("looking_for_gender").length > 0 ? opts("looking_for_gender") : [
    { value: "man", label_he: "גבר", label_en: "" }, { value: "woman", label_he: "אישה", label_en: "" },
    { value: "both", label_he: "שניהם", label_en: "" },
  ];
  const flexOptions = [
    { value: "not_flexible", label: "לא גמיש" },
    { value: "slightly_flexible", label: "קצת גמיש" },
    { value: "very_flexible", label: "מאוד גמיש" },
  ];
  const locationOptions = [
    { value: "my_city", label: "העיר שלי" },
    { value: "my_area", label: "האזור שלי" },
    { value: "bit_further", label: "קצת רחוק יותר" },
    { value: "whole_country", label: "כל הארץ" },
  ];

  return (
    <div style={s.wrapper}>
      <button onClick={onBack} style={s.backBtn}><ArrowRight size={18} /> חזרה לדשבורד</button>

      <form onSubmit={handleSave} dir="rtl">
        <h2 style={s.heading}>תעודת זהות</h2>

        {/* ── About Me ── */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>עליי</h3>

          <label style={s.label}>שם</label>
          <input style={s.input} value={firstName} onChange={(e) => setFirstName(e.target.value)} />

          <div style={s.row}>
            <div style={s.rowItem}>
              <label style={s.label}>גיל</label>
              <input style={s.input} type="number" min="18" max="99" value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div style={s.rowItem}>
              <label style={s.label}>גובה (ס"מ)</label>
              <input style={s.input} type="number" min="120" max="220" value={height} onChange={(e) => setHeight(e.target.value)} />
            </div>
          </div>

          <label style={s.label}>מגדר</label>
          <select style={s.select} value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">בחר/י</option>
            {genderOptions.map((o) => <option key={o.value} value={o.value}>{o.label_he}</option>)}
          </select>

          <label style={s.label}>עיר</label>
          <input style={s.input} value={city} onChange={(e) => setCity(e.target.value)} list="city-list" autoComplete="off" />
          <datalist id="city-list">
            {cities.map(c => <option key={c.city_name} value={c.city_name} />)}
          </datalist>
        </div>

        {/* ── Looking For ── */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>מה אני מחפש/ת</h3>

          <label style={s.label}>מגדר מבוקש</label>
          <select style={s.select} value={lookingForGender} onChange={(e) => setLookingForGender(e.target.value)}>
            <option value="">בחר/י</option>
            {lookingForOptions.map((o) => <option key={o.value} value={o.value}>{o.label_he}</option>)}
          </select>

          <label style={s.label}>טווח גילאים</label>
          <div style={s.row}>
            <div style={s.rowItem}>
              <input style={s.input} type="number" min="18" max="99" placeholder="מ-" value={desiredAgeMin} onChange={(e) => setDesiredAgeMin(e.target.value)} />
            </div>
            <div style={s.rowItem}>
              <input style={s.input} type="number" min="18" max="99" placeholder="עד-" value={desiredAgeMax} onChange={(e) => setDesiredAgeMax(e.target.value)} />
            </div>
          </div>
          <label style={s.label}>גמישות בגיל</label>
          <select style={s.select} value={ageFlex} onChange={(e) => setAgeFlex(e.target.value)}>
            {flexOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label style={s.label}>טווח גובה (ס"מ)</label>
          <div style={s.row}>
            <div style={s.rowItem}>
              <input style={s.input} type="number" min="120" max="220" placeholder="מ-" value={desiredHeightMin} onChange={(e) => setDesiredHeightMin(e.target.value)} />
            </div>
            <div style={s.rowItem}>
              <input style={s.input} type="number" min="120" max="220" placeholder="עד-" value={desiredHeightMax} onChange={(e) => setDesiredHeightMax(e.target.value)} />
            </div>
          </div>
          <label style={s.label}>גמישות בגובה</label>
          <select style={s.select} value={heightFlex} onChange={(e) => setHeightFlex(e.target.value)}>
            {flexOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label style={s.label}>טווח מיקום</label>
          <select style={s.select} value={locationRange} onChange={(e) => setLocationRange(e.target.value)}>
            {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <button type="submit" style={s.btn} disabled={loading}>
          {loading ? "שומר..." : saved ? "נשמר ✓" : "שמור שינויים"}
        </button>
        {error && <p style={s.error}>{error}</p>}
      </form>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    direction: "rtl",
    minHeight: "80vh",
    background: "linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)",
    borderRadius: 20,
    padding: "32px 24px",
    color: "#e2e8f0",
  },
  backBtn: {
    display: "flex", alignItems: "center", gap: 6,
    background: "none", border: "none", color: "#94a3b8",
    fontSize: 14, cursor: "pointer", padding: "4px 0", marginBottom: 16, fontFamily: "inherit",
  },
  heading: {
    marginTop: 0, marginBottom: 24, fontSize: 24, fontWeight: 700,
    background: "linear-gradient(135deg, #C084FC, #818CF8, #A78BFA)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  section: {
    marginBottom: 24, padding: 20,
    background: "rgba(26, 26, 46, 0.7)",
    border: "1px solid #2a2a3e",
    borderRadius: 16,
    backdropFilter: "blur(10px)",
  },
  sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0, color: "#f1f5f9" },
  label: { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6, color: "#94a3b8" },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 15,
    border: "1px solid #2a2a3e", borderRadius: 8,
    boxSizing: "border-box" as const, marginBottom: 16, outline: "none",
    background: "rgba(15, 15, 26, 0.6)", color: "#e2e8f0",
  },
  select: {
    width: "100%", padding: "10px 12px", fontSize: 15,
    border: "1px solid #2a2a3e", borderRadius: 8,
    boxSizing: "border-box" as const, marginBottom: 16, outline: "none",
    background: "rgba(15, 15, 26, 0.6)", color: "#e2e8f0",
  },
  row: { display: "flex", gap: 12, marginBottom: 0 },
  rowItem: { flex: 1 },
  btn: {
    width: "100%", padding: "14px", fontSize: 16, fontWeight: 600,
    background: "linear-gradient(135deg, #818CF8, #6366F1)",
    color: "#fff", border: "none", borderRadius: 30, cursor: "pointer", marginTop: 8,
    letterSpacing: "0.5px",
  },
  error: { color: "#f87171", fontSize: 13, marginTop: 10 },
};
