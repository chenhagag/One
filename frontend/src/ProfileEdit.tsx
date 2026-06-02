import { useState, useEffect } from "react";
import { User } from "./App";

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
  const [locationRange, setLocationRange] = useState(user.desired_location_range || "bit_further");

  const [enums, setEnums] = useState<Record<string, EnumOption[]>>({});
  const [cities, setCities] = useState<{ city_name: string; region: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Photos state
  const [photos, setPhotos] = useState<{ id: number; url: string }[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [showPhotoConsent, setShowPhotoConsent] = useState(false);
  const [consentProfile, setConsentProfile] = useState(false);
  const [consentAI, setConsentAI] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [photoConsentGiven, setPhotoConsentGiven] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Fetch fresh user data from pg on mount
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

  // Photos
  function loadPhotos() {
    fetch(`/api/users/${user.id}/photos`).then(r => r.json()).then(data => {
      if (data.photos) setPhotos(data.photos);
    }).catch(() => {});
  }
  useEffect(() => { loadPhotos(); }, [user.id]);
  useEffect(() => { if (photos.length > 0) setPhotoConsentGiven(true); }, [photos]);

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append("photo", file);
    setUploading(true);
    try {
      await fetch(`/api/users/${user.id}/photos`, { method: "POST", body: form });
      loadPhotos();
    } catch { alert("שגיאה בהעלאת התמונה"); }
    finally { setUploading(false); }
  }

  function handleFileSelect(file: File) {
    if (photoConsentGiven) {
      uploadFile(file);
    } else {
      setPendingFile(file);
      setShowPhotoConsent(true);
    }
  }

  function handleConsentConfirm() {
    if (!consentProfile) return;
    setPhotoConsentGiven(true);
    setShowPhotoConsent(false);
    fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_ai_consent: consentAI }),
    }).catch(() => {});
    if (pendingFile) {
      uploadFile(pendingFile);
      setPendingFile(null);
    }
  }

  async function handleDeletePhoto(id: number) {
    await fetch(`/api/users/${user.id}/photos/${id}`, { method: "DELETE" });
    setSelectedPhotoId(null);
    loadPhotos();
  }

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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
    { value: "my_city", label: "העיר שלי בלבד" },
    { value: "my_area", label: "האזור שלי בלבד" },
    { value: "bit_further", label: "האזור שלי + מרחק נסיעה סביר" },
    { value: "whole_country", label: "כל הארץ" },
  ];

  const PHOTO_SIZE = 104;
  const MAX_PHOTOS = 6;

  return (
    <div style={s.wrapper}>
      <style>{`
        .pe-photo-tile { transition: transform 0.15s, box-shadow 0.15s; }
        .pe-photo-tile:hover { transform: scale(1.03); }
        .pe-save-btn { transition: background 0.2s, transform 0.1s; }
        .pe-save-btn:active { transform: scale(0.98); }
      `}</style>
      <form onSubmit={handleSave} dir="rtl">

        {/* ── Photos ── */}
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={s.cardTitle}>התמונות שלי</h3>
            <span style={{ fontSize: 12, color: photos.length >= 1 ? "#22c55e" : "#aaa" }}>
              {photos.length}/6
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${PHOTO_SIZE}px)`, gap: 10, justifyContent: "center" }}>
            {photos.map(p => (
              <div
                key={p.id}
                className="pe-photo-tile"
                style={{
                  width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 14, overflow: "hidden",
                  cursor: "pointer", position: "relative",
                  boxShadow: selectedPhotoId === p.id ? "0 0 0 3px #6366f1" : "0 2px 8px rgba(0,0,0,0.08)",
                }}
                onClick={() => setSelectedPhotoId(selectedPhotoId === p.id ? null : p.id)}
              >
                <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {/* Selected overlay */}
                {selectedPhotoId === p.id && (
                  <div style={{
                    position: "absolute", inset: 0, background: "rgba(99,102,241,0.15)",
                    display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8,
                  }}>
                    <button
                      type="button"
                      style={{
                        background: "rgba(239,68,68,0.9)", color: "#fff", border: "none",
                        borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 600,
                        cursor: "pointer", backdropFilter: "blur(4px)", fontFamily: "inherit",
                      }}
                      onClick={(e) => { e.stopPropagation(); handleDeletePhoto(p.id); }}
                    >
                      הסרת תמונה
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Upload tile */}
            {photos.length < MAX_PHOTOS && (
              <label style={{
                width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 14,
                border: "2px dashed #d4d4e8", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", cursor: "pointer",
                background: "#fafaff", color: "#999",
              }}>
                {uploading ? (
                  <span style={{ fontSize: 13 }}>...</span>
                ) : (
                  <>
                    <span style={{ fontSize: 26, lineHeight: 1, marginBottom: 2 }}>+</span>
                    <span style={{ fontSize: 11 }}>הוספה</span>
                  </>
                )}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  handleFileSelect(file);
                  e.target.value = "";
                }} />
              </label>
            )}
          </div>

          {photos.length === 0 && (
            <p style={{ fontSize: 13, color: "#999", textAlign: "center", marginTop: 12, marginBottom: 0 }}>
              העלו תמונה אחת לפחות כדי להשלים את הפרופיל
            </p>
          )}
          {photos.length > 0 && photos.length < 3 && (
            <p style={{ fontSize: 12, color: "#aaa", textAlign: "center", marginTop: 10, marginBottom: 0 }}>
              רצוי להעלות 3 תמונות לפחות
            </p>
          )}
        </div>

        {/* ── About Me ── */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>עליי</h3>

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
          <p style={{ fontSize: 11, color: "#aaa", marginTop: -10, marginBottom: 8 }}>אם העיר שלך לא מופיעה — אפשר לבחור עיר קרובה</p>
        </div>

        {/* ── Looking For ── */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>מה אני מחפש/ת</h3>

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

        <button type="submit" className="pe-save-btn" style={{
          ...s.btn,
          background: saved ? "#22c55e" : "#6366f1",
        }} disabled={loading}>
          {loading ? "שומר..." : saved ? "נשמר בהצלחה" : "שמירת שינויים"}
        </button>
        {error && <p style={s.error}>{error}</p>}
      </form>

      {/* Photo consent modal */}
      {showPhotoConsent && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "28px 24px",
            maxWidth: 380, width: "100%", direction: "rtl", textAlign: "right",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a2e", margin: "0 0 12px" }}>הסכמה להעלאת תמונה</h3>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, margin: "0 0 20px" }}>
              התמונה תשמש להצגה בפרופיל שלך וליצירת התאמות בתוך האפליקציה. היא לא תפורסם מחוץ ל־One.
            </p>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 14, color: "#111827", lineHeight: 1.6, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={consentProfile}
                onChange={(e) => setConsentProfile(e.target.checked)}
                style={{ marginTop: 4, width: 18, height: 18, cursor: "pointer", accentColor: "#6366f1", flexShrink: 0 }}
              />
              <span>אני מאשר/ת העלאה ושימוש בתמונת הפרופיל שלי לצורך השתתפות במאגר ההתאמות של One.</span>
            </label>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 14, color: "#111827", lineHeight: 1.6, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={consentAI}
                onChange={(e) => setConsentAI(e.target.checked)}
                style={{ marginTop: 4, width: 18, height: 18, cursor: "pointer", accentColor: "#6366f1", flexShrink: 0 }}
              />
              <span>אני מאשר/ת ל־One להשתמש ב־AI כדי לנתח את תמונת הפרופיל שלי, לצורך שיפור התאמות.</span>
            </label>

            <p style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6, margin: "0 0 20px", paddingRight: 28 }}>
              * ניתוח AI הוא אופציונלי. ניתן להשתתף במאגר גם בלעדיו.
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleConsentConfirm}
                disabled={!consentProfile}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: consentProfile ? "#6366f1" : "#d1d5db",
                  color: "#fff", fontSize: 14, fontWeight: 600, border: "none",
                  cursor: consentProfile ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                }}
              >
                אישור והעלאה
              </button>
              <button
                type="button"
                onClick={() => { setShowPhotoConsent(false); setPendingFile(null); }}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: "#f5f5fa", color: "#6b7280", fontSize: 14,
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    direction: "rtl",
    maxWidth: 520,
    margin: "0 auto",
    padding: "24px 20px 40px",
    fontFamily: "'Segoe UI', 'Arial', sans-serif",
    color: "#1a1a2e",
  },
  card: {
    marginBottom: 16, padding: "20px 20px 16px",
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 16, marginTop: 0, color: "#1a1a2e" },
  label: { display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#888" },
  input: {
    width: "100%", padding: "11px 14px", fontSize: 14,
    border: "1px solid #e8e8f0", borderRadius: 10,
    boxSizing: "border-box" as const, marginBottom: 14, outline: "none",
    background: "#fafaff", color: "#1a1a2e",
  },
  select: {
    width: "100%", padding: "11px 14px", fontSize: 14,
    border: "1px solid #e8e8f0", borderRadius: 10,
    boxSizing: "border-box" as const, marginBottom: 14, outline: "none",
    background: "#fafaff", color: "#1a1a2e",
  },
  row: { display: "flex", gap: 12, marginBottom: 0 },
  rowItem: { flex: 1 },
  btn: {
    width: "100%", padding: "14px", fontSize: 15, fontWeight: 600,
    color: "#fff", border: "none", borderRadius: 12, cursor: "pointer",
    marginTop: 4, fontFamily: "inherit",
  },
  error: { color: "#ef4444", fontSize: 13, marginTop: 10, textAlign: "center" },
};
