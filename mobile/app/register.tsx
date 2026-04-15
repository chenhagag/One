import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { registerUser } from "../src/api";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Errors { firstName?: string; email?: string; }

function validate(firstName: string, email: string): Errors {
  const e: Errors = {};
  if (!firstName.trim()) e.firstName = "שדה חובה";
  if (!email.trim()) e.email = "שדה חובה";
  else if (!EMAIL_RE.test(email.trim())) e.email = "אימייל לא תקין";
  return e;
}

export default function RegisterScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");

  const handleRegister = async () => {
    setSubmitted(true);
    const errs = validate(firstName, email);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const user = await registerUser({
        first_name: firstName.trim(),
        email: email.trim().toLowerCase(),
        gender: gender || undefined,
        looking_for_gender: lookingFor || undefined,
      });
      router.replace({ pathname: "/dashboard", params: { userId: String(user.id), userName: user.first_name } });
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

  const onChangeFirstName = (v: string) => { setFirstName(v); if (submitted) setErrors((p) => ({ ...p, firstName: validate(v, email).firstName })); };
  const onChangeEmail = (v: string) => { setEmail(v); if (submitted) setErrors((p) => ({ ...p, email: validate(firstName, v).email })); };

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

        <View style={st.section}>
          <Text style={st.label}>שם *</Text>
          <TextInput style={[st.input, errors.firstName && st.inputErr]} value={firstName} onChangeText={onChangeFirstName} placeholder="השם שלך" />
          {errors.firstName && <Text style={st.err}>{errors.firstName}</Text>}

          <Text style={st.label}>אימייל *</Text>
          <TextInput style={[st.input, errors.email && st.inputErr]} value={email} onChangeText={onChangeEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          {errors.email && <Text style={st.err}>{errors.email}</Text>}

          <Text style={st.label}>מגדר</Text>
          <OptionButtons options={GENDER_OPTIONS} value={gender} onChange={setGender} />

          <Text style={st.label}>מחפש/ת</Text>
          <OptionButtons options={LOOKING_FOR_OPTIONS} value={lookingFor} onChange={setLookingFor} />
        </View>

        <Pressable style={[st.submitBtn, loading && st.submitDis]} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.submitTxt}>הרשמה</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: "#F5F5FF" },
  heading: { fontSize: 24, fontWeight: "bold", color: "#333", marginBottom: 4, textAlign: "right" },
  sub: { fontSize: 14, color: "#888", marginBottom: 20, textAlign: "right" },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "500", color: "#555", marginBottom: 4, marginTop: 12, textAlign: "right" },
  input: { backgroundColor: "#fafafa", borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, textAlign: "right" },
  inputErr: { borderColor: "#E53935" },
  err: { color: "#E53935", fontSize: 12, marginTop: 2, textAlign: "right" },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff" },
  optionSel: { backgroundColor: "#6C63FF", borderColor: "#6C63FF" },
  optionTxt: { fontSize: 13, color: "#333" },
  optionTxtSel: { color: "#fff", fontWeight: "600" },
  submitBtn: { backgroundColor: "#6C63FF", paddingVertical: 16, borderRadius: 30, alignItems: "center", marginTop: 24 },
  submitDis: { opacity: 0.6 },
  submitTxt: { color: "#fff", fontSize: 18, fontWeight: "600" },
});
