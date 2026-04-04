import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { registerUser } from "../src/api";

// ── Options (matching web form) ─────────────────────────────────

const GENDER_OPTIONS = [
  { value: "man", label: "גבר" },
  { value: "woman", label: "אישה" },
  { value: "undefined", label: "לא מוגדר" },
];

const LOOKING_FOR_OPTIONS = [
  { value: "man", label: "גבר" },
  { value: "woman", label: "אישה" },
  { value: "both", label: "שניהם" },
  { value: "doesnt_matter", label: "לא משנה" },
];

const FLEXIBILITY_OPTIONS = [
  { value: "not_flexible", label: "לא גמיש" },
  { value: "slightly_flexible", label: "קצת גמיש" },
  { value: "very_flexible", label: "מאוד גמיש" },
];

const LOCATION_OPTIONS = [
  { value: "my_city", label: "העיר שלי" },
  { value: "my_area", label: "האזור שלי" },
  { value: "bit_further", label: "קצת רחוק יותר" },
  { value: "whole_country", label: "כל הארץ" },
];

// ── Validation ──────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Errors { firstName?: string; email?: string; age?: string; }

function validate(firstName: string, email: string, age: string): Errors {
  const e: Errors = {};
  if (!firstName.trim()) e.firstName = "שדה חובה";
  if (!email.trim()) e.email = "שדה חובה";
  else if (!EMAIL_RE.test(email.trim())) e.email = "אימייל לא תקין";
  if (age) { const n = parseInt(age, 10); if (isNaN(n) || n < 18 || n > 120) e.age = "גיל 18-120"; }
  return e;
}

// ── Component ───────────────────────────────────────────────────

export default function RegisterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  // About me
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");

  // Looking for
  const [lookingFor, setLookingFor] = useState("");
  const [desiredAgeMin, setDesiredAgeMin] = useState("");
  const [desiredAgeMax, setDesiredAgeMax] = useState("");
  const [ageFlex, setAgeFlex] = useState("slightly_flexible");
  const [desiredHeightMin, setDesiredHeightMin] = useState("");
  const [desiredHeightMax, setDesiredHeightMax] = useState("");
  const [heightFlex, setHeightFlex] = useState("slightly_flexible");
  const [locationRange, setLocationRange] = useState("my_area");

  const handleRegister = async () => {
    setSubmitted(true);
    const errs = validate(firstName, email, age);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const user = await registerUser({
        first_name: firstName.trim(),
        email: email.trim().toLowerCase(),
        age: age ? parseInt(age, 10) : undefined,
        gender: gender || undefined,
        looking_for_gender: lookingFor || undefined,
        city: city.trim() || undefined,
        height: height ? parseInt(height, 10) : undefined,
        desired_age_min: desiredAgeMin ? parseInt(desiredAgeMin, 10) : undefined,
        desired_age_max: desiredAgeMax ? parseInt(desiredAgeMax, 10) : undefined,
        age_flexibility: ageFlex,
        desired_height_min: desiredHeightMin ? parseInt(desiredHeightMin, 10) : undefined,
        desired_height_max: desiredHeightMax ? parseInt(desiredHeightMax, 10) : undefined,
        height_flexibility: heightFlex,
        desired_location_range: locationRange,
      });
      // Navigate to chat with user data
      router.replace({ pathname: "/chat", params: { userId: String(user.id), userName: user.first_name } });
    } catch (err: any) {
      if (err.message?.includes("already registered")) {
        setErrors((p) => ({ ...p, email: "האימייל הזה כבר רשום" }));
      } else {
        Alert.alert("שגיאה", err.message || "משהו השתבש");
      }
    } finally {
      setLoading(false);
    }
  };

  const onChangeFirstName = (v: string) => { setFirstName(v); if (submitted) setErrors((p) => ({ ...p, firstName: validate(v, email, age).firstName })); };
  const onChangeEmail = (v: string) => { setEmail(v); if (submitted) setErrors((p) => ({ ...p, email: validate(firstName, v, age).email })); };
  const onChangeAge = (v: string) => { setAge(v); if (submitted) setErrors((p) => ({ ...p, age: validate(firstName, email, v).age })); };

  // ── Render helpers ────────────────────────────────────────────

  function OptionButtons({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
    return (
      <View style={st.optionRow}>
        {options.map((o) => (
          <Pressable key={o.value} style={[st.optionBtn, value === o.value && st.optionSel]} onPress={() => onChange(o.value)}>
            <Text style={[st.optionTxt, value === o.value && st.optionTxtSel]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
        <Text style={st.heading}>הרשמה ל-MatchMe</Text>
        <Text style={st.sub}>ספר/י לנו קצת על עצמך</Text>

        {/* ── About Me ─────────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>עליי</Text>

          <Text style={st.label}>שם *</Text>
          <TextInput style={[st.input, errors.firstName && st.inputErr]} value={firstName} onChangeText={onChangeFirstName} placeholder="השם שלך" />
          {errors.firstName && <Text style={st.err}>{errors.firstName}</Text>}

          <Text style={st.label}>אימייל *</Text>
          <TextInput style={[st.input, errors.email && st.inputErr]} value={email} onChangeText={onChangeEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          {errors.email && <Text style={st.err}>{errors.email}</Text>}

          <View style={st.row}>
            <View style={st.rowItem}>
              <Text style={st.label}>גיל</Text>
              <TextInput style={[st.input, errors.age && st.inputErr]} value={age} onChangeText={onChangeAge} placeholder="גיל" keyboardType="numeric" maxLength={3} />
              {errors.age && <Text style={st.err}>{errors.age}</Text>}
            </View>
            <View style={st.rowItem}>
              <Text style={st.label}>גובה (ס"מ)</Text>
              <TextInput style={st.input} value={height} onChangeText={setHeight} placeholder='גובה בס"מ' keyboardType="numeric" maxLength={3} />
            </View>
          </View>

          <Text style={st.label}>מגדר</Text>
          <OptionButtons options={GENDER_OPTIONS} value={gender} onChange={setGender} />

          <Text style={st.label}>עיר</Text>
          <TextInput style={st.input} value={city} onChangeText={setCity} placeholder="העיר שלך" />
        </View>

        {/* ── Looking For ──────────────────────── */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>מה אני מחפש/ת</Text>

          <Text style={st.label}>מגדר רצוי</Text>
          <OptionButtons options={LOOKING_FOR_OPTIONS} value={lookingFor} onChange={setLookingFor} />

          <Text style={st.label}>טווח גילאים רצוי</Text>
          <View style={st.row}>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredAgeMin} onChangeText={setDesiredAgeMin} placeholder="מגיל" keyboardType="numeric" maxLength={2} />
            </View>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredAgeMax} onChangeText={setDesiredAgeMax} placeholder="עד גיל" keyboardType="numeric" maxLength={2} />
            </View>
            <View style={st.rowItem}>
              <OptionButtons options={FLEXIBILITY_OPTIONS} value={ageFlex} onChange={setAgeFlex} />
            </View>
          </View>

          <Text style={st.label}>טווח גובה רצוי (ס"מ)</Text>
          <View style={st.row}>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredHeightMin} onChangeText={setDesiredHeightMin} placeholder="מגובה" keyboardType="numeric" maxLength={3} />
            </View>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredHeightMax} onChangeText={setDesiredHeightMax} placeholder="עד גובה" keyboardType="numeric" maxLength={3} />
            </View>
            <View style={st.rowItem}>
              <OptionButtons options={FLEXIBILITY_OPTIONS} value={heightFlex} onChange={setHeightFlex} />
            </View>
          </View>

          <Text style={st.label}>טווח מיקום</Text>
          <OptionButtons options={LOCATION_OPTIONS} value={locationRange} onChange={setLocationRange} />
        </View>

        <Pressable style={[st.submitBtn, loading && st.submitDis]} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.submitTxt}>הרשמה</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: "#F5F5FF" },
  heading: { fontSize: 24, fontWeight: "bold", color: "#333", marginBottom: 4, textAlign: "right" },
  sub: { fontSize: 14, color: "#888", marginBottom: 20, textAlign: "right" },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 8, textAlign: "right" },
  label: { fontSize: 14, fontWeight: "500", color: "#555", marginBottom: 4, marginTop: 12, textAlign: "right" },
  input: { backgroundColor: "#fafafa", borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, textAlign: "right" },
  inputErr: { borderColor: "#E53935" },
  err: { color: "#E53935", fontSize: 12, marginTop: 2, textAlign: "right" },
  row: { flexDirection: "row", gap: 10 },
  rowItem: { flex: 1 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff" },
  optionSel: { backgroundColor: "#6C63FF", borderColor: "#6C63FF" },
  optionTxt: { fontSize: 13, color: "#333" },
  optionTxtSel: { color: "#fff", fontWeight: "600" },
  submitBtn: { backgroundColor: "#6C63FF", paddingVertical: 16, borderRadius: 30, alignItems: "center", marginTop: 24 },
  submitDis: { opacity: 0.6 },
  submitTxt: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
