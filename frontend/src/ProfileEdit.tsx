import { useState, useEffect } from "react";
import { User } from "./App";
import { apiFetch } from "./lib/api";

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
  // Sensitive details
  const [maritalStatus, setMaritalStatus] = useState((user as any).marital_status || "");
  const [hasChildren, setHasChildren] = useState<boolean | null>((user as any).has_children != null ? !!(user as any).has_children : null);
  const [religion, setReligion] = useState((user as any).religion || "");
  const [smoker, setSmoker] = useState<boolean | null>((user as any).smoker != null ? !!(user as any).smoker : null);

  // Couple partner
  const [partnerName, setPartnerName] = useState((user as any).partner_name || "");
  const [isCouple, setIsCouple] = useState(user.test_user_type === "Couple Tester");

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
    apiFetch(`/users/${user.id}`)
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
        if (u.marital_status) setMaritalStatus(u.marital_status);
        if (u.has_children != null) setHasChildren(!!u.has_children);
        if (u.religion) setReligion(u.religion);
        if (u.smoker != null) setSmoker(!!u.smoker);
        if (u.partner_name) setPartnerName(u.partner_name);
        if (u.test_user_type) setIsCouple(u.test_user_type === "Couple Tester");
      })
      .catch(() => {});
  }, [user.id]);

  useEffect(() => {
    apiFetch(`/cities`).then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch(`/enum-options`)
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
    apiFetch(`/users/${user.id}/photos`).then(r => r.json()).then(data => {
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
      await apiFetch(`/users/${user.id}/photos`, { method: "POST", body: form });
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
    apiFetch(`/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ photo_ai_consent: consentAI }),
    }).catch(() => {});
    if (pendingFile) {
      uploadFile(pendingFile);
      setPendingFile(null);
    }
  }

  async function handleDeletePhoto(id: number) {
    await apiFetch(`/users/${user.id}/photos/${id}`, { method: "DELETE" });
    setSelectedPhotoId(null);
    loadPhotos();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSaved(false); setLoading(true);
    try {
      const res = await apiFetch(`/users/${user.id}`, {
        method: "PATCH",
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
          marital_status: maritalStatus,
          has_children: hasChildren,
          religion: religion || null,
          smoker,
          partner_name: isCouple ? (partnerName.trim() || null) : undefined,
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

          <div style={{ background: "#f8f9fb", borderRadius: 10, padding: "14px 16px", marginTop: 16, fontSize: 12, color: "#555", lineHeight: 1.7 }}>
            <p style={{ fontWeight: 600, color: "#1a1a2e", margin: "0 0 8px", fontSize: 13 }}>איך המערכת משתמשת בתמונות?</p>
            <p style={{ margin: "0 0 6px" }}>🔒 <strong>פרטיות מלאה:</strong> ב-One אין קטלוג ציבורי ואף אחד לא יכול "לדפדף" בנתונים שלך סתם כך.</p>
            <p style={{ margin: "0 0 6px" }}>🎯 <strong>חשיפה מדויקת בלבד:</strong> התמונות (יחד עם השם והגיל) ייחשפו אך ורק בפני אנשים שהאלגוריתם כבר מצא עבורך כהתאמה פסיכולוגית ואישיותית עמוקה.</p>
            <p style={{ margin: 0 }}>👁️ <strong>ניתוח מראה ואישור הדדי:</strong> המערכת תבצע בדיקת הלימה ויזואלית, ותעביר את התמונות לאישור דיסקרטי ושלבי של שני הצדדים. המשוב שלכם ילטש את ציון ההתאמה הסופי, כאשר אישור הדדי הוא תנאי חובה לפתיחת הקשר.</p>
          </div>
        </div>

        {/* ── About Me ── */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>עליי</h3>
          <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5, margin: "-8px 0 14px" }}>הפרטים שלך לא חשופים למשתמשים אחרים. לקראת התאמה אפשרית — נציג את השם, הגיל והתמונה בלבד למועמדים הרלוונטיים.</p>

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

        {/* ── Looking For / Couple Partner ── */}
        {isCouple ? (
          <div style={s.card}>
            <h3 style={s.cardTitle}>{user.gender === "woman" ? "בן הזוג שלי" : "בת הזוג שלי"}</h3>
            <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5, margin: "-8px 0 14px" }}>
              {user.gender === "woman" ? "שם בן הזוג כפי שרשום במערכת — כדי שנוכל לחבר ביניכם ולהציג תובנות זוגיות." : "שם בת הזוג כפי שרשום במערכת — כדי שנוכל לחבר ביניכם ולהציג תובנות זוגיות."}
            </p>
            <label style={s.label}>{user.gender === "woman" ? "שם בן הזוג" : "שם בת הזוג"}</label>
            <input style={s.input} type="text" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder={user.gender === "woman" ? "הכניסי את שמו כפי שנרשם" : "הכנס את שמה כפי שנרשמה"} />
          </div>
        ) : (
          <div style={s.card}>
            <h3 style={s.cardTitle}>מה אני מחפש/ת</h3>
            <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5, margin: "-8px 0 14px" }}>הנתונים לא יופיעו בשום מקום — הם משמשים אותנו לסינון ראשוני של ההתאמות עבורך.</p>

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
        )}

        {/* ── Sensitive Details — compact ── */}
        <div style={s.card}>
          <h3 style={{ ...s.cardTitle, fontSize: 14 }}>פרטים אישיים</h3>
          <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5, margin: "-8px 0 12px" }}>
            כמה פרטים שהעדפנו לא לנחש. השיתוף לבחירתך, והוא חיוני לסינון ההתאמות.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <div style={{ flex: "1 1 45%", minWidth: 120 }}>
              <label style={{ fontSize: 11, color: "#888", marginBottom: 3, display: "block" }}>מצב משפחתי</label>
              <select style={{ ...s.select, fontSize: 12, padding: "6px 8px", marginBottom: 0, color: maritalStatus ? undefined : "#aaa" }} value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)}>
                <option value="" disabled>בחר/י מצב משפחתי</option>
                <option value="single">רווק/ה</option>
                <option value="divorced">גרוש/ה</option>
                <option value="married">נשוי/נשואה</option>
              </select>
            </div>
            <div style={{ flex: "1 1 45%", minWidth: 120 }}>
              <label style={{ fontSize: 11, color: "#888", marginBottom: 3, display: "block" }}>ילדים</label>
              <select style={{ ...s.select, fontSize: 12, padding: "6px 8px", marginBottom: 0, color: hasChildren === null ? "#aaa" : undefined }} value={hasChildren === null ? "" : hasChildren ? "yes" : "no"} onChange={(e) => setHasChildren(e.target.value === "yes")}>
                <option value="" disabled>יש לך ילדים?</option>
                <option value="no">אין לי ילדים</option>
                <option value="yes">יש לי ילדים</option>
              </select>
            </div>
            <div style={{ flex: "1 1 45%", minWidth: 120 }}>
              <label style={{ fontSize: 11, color: "#888", marginBottom: 3, display: "block" }}>דת</label>
              <select style={{ ...s.select, fontSize: 12, padding: "6px 8px", marginBottom: 0, color: religion ? undefined : "#aaa" }} value={religion} onChange={(e) => setReligion(e.target.value)}>
                <option value="" disabled>בחר/י דת</option>
                <option value="jewish">יהודי/ה</option>
                <option value="muslim">מוסלמי/ת</option>
                <option value="christian">נוצרי/ה</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div style={{ flex: "1 1 45%", minWidth: 120 }}>
              <label style={{ fontSize: 11, color: "#888", marginBottom: 3, display: "block" }}>עישון</label>
              <select style={{ ...s.select, fontSize: 12, padding: "6px 8px", marginBottom: 0, color: smoker === null ? "#aaa" : undefined }} value={smoker === null ? "" : smoker ? "yes" : "no"} onChange={(e) => setSmoker(e.target.value === "yes")}>
                <option value="" disabled>מעשן/ת?</option>
                <option value="no">לא מעשן/ת</option>
                <option value="yes">מעשן/ת</option>
              </select>
            </div>
          </div>
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
    maxWidth: 720,
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
