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
  entryPoint?: string | null;
}

export default function ProfileSetup({ user, onComplete, entryPoint }: ProfileSetupProps) {
  const isForWomen = entryPoint !== "main";
  const isCouples = entryPoint === "couples";
  // Don't pre-fill from user object — let user type their own name
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState(isForWomen ? "woman" : "");
  const [lookingForGender, setLookingForGender] = useState(isForWomen ? "woman" : "");
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
  const [testUserType, setTestUserType] = useState(isCouples ? "Couple Tester" : "User Experience Tester");
  const [partnerName, setPartnerName] = useState("");
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);
  const [noUpdates, setNoUpdates] = useState(false);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [focused, setFocused] = useState<string | null>(null);

  const [enums, setEnums] = useState<Record<string, EnumOption[]>>({});
  const [cities, setCities] = useState<{ city_name: string; region: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/cities").then(r => r.json()).then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch("/enum-options")
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
      const res = await apiFetch(`/users/${user.id}`, {
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
          email_updates: noUpdates ? false : emailUpdates,
          whatsapp_updates: noUpdates ? false : whatsappUpdates,
          whatsapp_phone: whatsappPhone.trim() || null,
          email_marketing: emailMarketing,
          entry_point: entryPoint || null,
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

  const inputStyle = (name: string): React.CSSProperties => ({
    width: "100%", padding: "12px 16px", fontSize: 15,
    border: `1.5px solid ${focused === name ? "#8b7ba8" : "#e0dce6"}`,
    borderRadius: 12, boxSizing: "border-box" as const, outline: "none",
    fontFamily: "inherit", transition: "border-color 0.2s",
    background: "#faf9fc",
  });

  const selectStyle = (name: string): React.CSSProperties => ({
    ...inputStyle(name),
    background: "#faf9fc",
    appearance: "auto" as const,
  });

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#555",
  };

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center",
      backgroundImage: "linear-gradient(rgba(255,255,255,0.4), rgba(255,255,255,0.4)), url(/background.png)",
      backgroundSize: "cover", backgroundPosition: "center",
      padding: "40px 24px 32px",
    }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <form onSubmit={handleSubmit} dir="rtl">
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <img src="/iconOnly.png" alt="One" style={{ height: 48, objectFit: "contain", marginBottom: 14 }} />
            <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>
              {isForWomen ? "כמה פרטים לפני שמתחילות" : "כמה פרטים לפני שמתחילים"}
            </h2>
            <p style={{ color: "#8b7ba8", margin: 0, fontSize: 14, fontWeight: 500 }}>
              {isForWomen ? "כדי שנדע לכוון למי שרלוונטית עבורך" : "כדי שהמערכת תדע לכוון לאנשים הרלוונטיים עבורך"}
            </p>
          </div>

          {/* Main form card */}
          <div style={{
            background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
            borderRadius: 18, padding: "24px 24px 8px",
            boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
            marginBottom: 16,
          }}>
            <label style={labelStyle}>שם *</label>
            <input
              style={{ ...inputStyle("name"), marginBottom: 18 }}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused(null)}
              placeholder="השם שלך"
              required
            />

            <div style={{ display: "flex", gap: 12, marginBottom: 2 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>גיל</label>
                <input
                  style={{ ...inputStyle("age"), marginBottom: 18 }}
                  type="number" min="18" max="99" value={age}
                  onChange={(e) => setAge(e.target.value)}
                  onFocus={() => setFocused("age")}
                  onBlur={() => setFocused(null)}
                  placeholder="גיל"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>עיר</label>
                <input
                  style={{ ...inputStyle("city"), marginBottom: 4 }}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onFocus={() => setFocused("city")}
                  onBlur={() => setFocused(null)}
                  placeholder="עיר מגורים"
                  list="setup-city-list"
                  autoComplete="off"
                />
                <datalist id="setup-city-list">
                  {cities.map(c => <option key={c.city_name} value={c.city_name} />)}
                </datalist>
                <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 12px" }}>אם העיר שלך לא מופיעה — אפשר לבחור עיר קרובה</p>
              </div>
            </div>

            {!isForWomen && <>
              <label style={labelStyle}>מגדר</label>
              <select
                style={{ ...selectStyle("gender"), marginBottom: 18 }}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                onFocus={() => setFocused("gender")}
                onBlur={() => setFocused(null)}
              >
                <option value="">בחר/י</option>
                {(opts("gender").length > 0 ? opts("gender") : [
                  { value: "man", label_he: "גבר" },
                  { value: "woman", label_he: "אישה" },
                  { value: "undefined", label_he: "לא מוגדר" },
                ]).map((o) => (
                  <option key={o.value} value={o.value}>{o.label_he}</option>
                ))}
              </select>

              <label style={labelStyle}>מחפש/ת</label>
              <select
                style={{ ...selectStyle("looking"), marginBottom: 18 }}
                value={lookingForGender}
                onChange={(e) => setLookingForGender(e.target.value)}
                onFocus={() => setFocused("looking")}
                onBlur={() => setFocused(null)}
              >
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
            </>}

            {!isForWomen && <>
              <label style={labelStyle}>סטטוס</label>
              <select
                style={{ ...selectStyle("status"), marginBottom: 18 }}
                value={testUserType}
                onChange={(e) => { setTestUserType(e.target.value); if (e.target.value !== "Couple Tester") setPartnerName(""); }}
                onFocus={() => setFocused("status")}
                onBlur={() => setFocused(null)}
              >
                <option value="User Experience Tester">אני רווק/ה שמשתתף/ת ב-MVP</option>
                <option value="Couple Tester">אני בזוגיות ועוזר/ת לאימון המערכת</option>
              </select>

              {testUserType === "Couple Tester" && (
                <>
                  <label style={labelStyle}>שם בן/בת הזוג (שם מלא)</label>
                  <input
                    style={{ ...inputStyle("partner"), marginBottom: 18 }}
                    type="text"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    onFocus={() => setFocused("partner")}
                    onBlur={() => setFocused(null)}
                    placeholder="שם מלא של בן/בת הזוג"
                  />
                </>
              )}
            </>}
          </div>

          {/* Notifications card */}
          <div style={{
            background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
            borderRadius: 18, padding: "20px 24px",
            boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 4px" }}>
              {isForWomen ? "איך תרצי לקבל עדכונים?" : "איך תרצה לקבל עדכונים?"}
            </p>
            <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6, margin: "0 0 14px" }}>
              עד שתהיה אפליקציה להורדה ואפשרות לנוטיפיקיישנס — זו הדרך היחידה שלנו {isForWomen ? "לעדכן אותך" : "לעדכן אותך"} על התאמה או הודעה {isForWomen ? "שממתינה לך" : "שממתינה לך"} במערכת.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 10 }}>
              <input type="checkbox" checked={emailUpdates} onChange={e => { setEmailUpdates(e.target.checked); if (e.target.checked) setNoUpdates(false); }} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#8b7ba8", flexShrink: 0 }} />
              <span>במייל</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "#555", lineHeight: 1.6 }}>
              <input type="checkbox" checked={whatsappUpdates} onChange={e => { setWhatsappUpdates(e.target.checked); if (e.target.checked) setNoUpdates(false); }} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#8b7ba8", flexShrink: 0 }} />
              <span>בוואטסאפ</span>
            </label>
            {whatsappUpdates && (
              <input
                style={{ ...inputStyle("phone"), marginTop: 12 }}
                type="tel"
                value={whatsappPhone}
                onChange={e => setWhatsappPhone(e.target.value)}
                onFocus={() => setFocused("phone")}
                onBlur={() => setFocused(null)}
                placeholder="מספר טלפון (למשל 0501234567)"
                dir="ltr"
              />
            )}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 12, color: "#9ca3af", lineHeight: 1.6, marginTop: 12 }}>
              <input type="checkbox" checked={noUpdates} onChange={e => { setNoUpdates(e.target.checked); if (e.target.checked) { setEmailUpdates(false); setWhatsappUpdates(false); } }} style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: "#8b7ba8", flexShrink: 0 }} />
              <span>{isForWomen ? "לא מעוניינת לקבל עדכונים, אכנס למערכת מדי פעם לבדוק" : "לא מעוניין/ת לקבל עדכונים, אכנס למערכת מדי פעם לבדוק"}</span>
            </label>
            {!emailUpdates && !whatsappUpdates && !noUpdates && (
              <p style={{ fontSize: 11, color: "#dc2626", margin: "8px 0 0" }}>
                {isForWomen ? "יש לבחור לפחות אפשרות אחת" : "יש לבחור לפחות אפשרות אחת"}
              </p>
            )}
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "14px 0 0", paddingTop: 12 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                <input type="checkbox" checked={emailMarketing} onChange={e => setEmailMarketing(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: "#8b7ba8", flexShrink: 0 }} />
                <span>עדכונים כלליים על המערכת, סקרים וחדשות במייל</span>
              </label>
            </div>
          </div>

          <button
            style={{
              width: "100%", height: 52, fontSize: 16, fontWeight: 600,
              background: "#1a1a2e", color: "#fff", border: "none",
              borderRadius: 14, cursor: "pointer", marginTop: 20,
              fontFamily: "inherit", opacity: loading ? 0.6 : 1,
              boxShadow: "0 2px 8px rgba(26,26,46,0.15)",
              transition: "opacity 0.2s",
            }}
            type="submit" disabled={loading || (!emailUpdates && !whatsappUpdates && !noUpdates)}
          >
            {loading ? "...שומר" : isForWomen ? "בואי נתחיל" : "בואו נתחיל"}
          </button>

          {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12, textAlign: "center", background: "rgba(255,255,255,0.8)", borderRadius: 10, padding: "8px 12px" }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}
