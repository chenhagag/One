import { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getUser, updateUser, uploadPhoto, getUserPhotos, deletePhoto, API_BASE_URL, type UserPhoto } from "../src/api";

const GENDER_OPTIONS = [
  { value: "man", label: "גבר" },
  { value: "woman", label: "אישה" },
];

const LOOKING_FOR_OPTIONS = [
  { value: "man", label: "גבר" },
  { value: "woman", label: "אישה" },
  { value: "both", label: "שניהם" },
];

const FLEX_OPTIONS = [
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

export default function ProfileEditScreen() {
  const router = useRouter();
  const { userId: rawUserId } = useLocalSearchParams<{ userId: string }>();
  const userId = parseInt(rawUserId || "0", 10);

  // About me
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [height, setHeight] = useState("");
  // Looking for
  const [lookingForGender, setLookingForGender] = useState("");
  const [desiredAgeMin, setDesiredAgeMin] = useState("");
  const [desiredAgeMax, setDesiredAgeMax] = useState("");
  const [ageFlex, setAgeFlex] = useState("slightly_flexible");
  const [desiredHeightMin, setDesiredHeightMin] = useState("");
  const [desiredHeightMax, setDesiredHeightMax] = useState("");
  const [heightFlex, setHeightFlex] = useState("slightly_flexible");
  const [locationRange, setLocationRange] = useState("my_area");

  // Photos
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load existing user data + photos on mount
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      getUser(userId).then((u: any) => {
        if (u.first_name) setFirstName(u.first_name);
        if (u.age) setAge(String(u.age));
        if (u.gender) setGender(u.gender);
        if (u.city) setCity(u.city);
        if (u.height) setHeight(String(u.height));
        if (u.looking_for_gender) setLookingForGender(u.looking_for_gender);
        if (u.desired_age_min) setDesiredAgeMin(String(u.desired_age_min));
        if (u.desired_age_max) setDesiredAgeMax(String(u.desired_age_max));
        if (u.age_flexibility) setAgeFlex(u.age_flexibility);
        if (u.desired_height_min) setDesiredHeightMin(String(u.desired_height_min));
        if (u.desired_height_max) setDesiredHeightMax(String(u.desired_height_max));
        if (u.height_flexibility) setHeightFlex(u.height_flexibility);
        if (u.desired_location_range) setLocationRange(u.desired_location_range);
      }),
      getUserPhotos(userId).then((data) => setPhotos(data.photos)),
    ])
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, [userId]);

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("צריך הרשאה", "צריך גישה לתמונות כדי להעלות.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      const uploaded = await uploadPhoto(userId, result.assets[0].uri);
      setPhotos((prev) => [...prev, {
        id: Date.now(),
        filename: uploaded.filename,
        url: uploaded.url,
        original_name: result.assets[0].fileName || "photo.jpg",
        created_at: new Date().toISOString(),
      }]);
    } catch (err: any) {
      Alert.alert("שגיאה", err.message || "העלאה נכשלה");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeletePhoto(photoId: number) {
    try {
      await deletePhoto(userId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch {}
  }

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setError(""); setSaved(false); setLoading(true);
    try {
      await updateUser(userId, {
        first_name: firstName.trim() || undefined,
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
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { setError("לא ניתן להתחבר לשרת"); }
    finally { setLoading(false); }
  }

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

  if (initialLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5FF" }}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={st.backRow}>
          <Text style={st.backText}>→ חזרה לדשבורד</Text>
        </Pressable>

        <Text style={st.heading}>תעודת זהות</Text>

        {/* About me */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>עליי</Text>

          <Text style={st.label}>שם</Text>
          <TextInput style={st.input} value={firstName} onChangeText={setFirstName} placeholder="השם שלך" />

          <View style={st.row}>
            <View style={st.rowItem}>
              <Text style={st.label}>גיל</Text>
              <TextInput style={st.input} value={age} onChangeText={setAge} placeholder="גיל" keyboardType="numeric" maxLength={3} />
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

        {/* Looking for */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>מה אני מחפש/ת</Text>

          <Text style={st.label}>מגדר מבוקש</Text>
          <OptionButtons options={LOOKING_FOR_OPTIONS} value={lookingForGender} onChange={setLookingForGender} />

          <Text style={st.label}>טווח גילאים</Text>
          <View style={st.row}>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredAgeMin} onChangeText={setDesiredAgeMin} placeholder="מ-" keyboardType="numeric" maxLength={2} />
            </View>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredAgeMax} onChangeText={setDesiredAgeMax} placeholder="עד-" keyboardType="numeric" maxLength={2} />
            </View>
          </View>
          <Text style={st.label}>גמישות בגיל</Text>
          <OptionButtons options={FLEX_OPTIONS} value={ageFlex} onChange={setAgeFlex} />

          <Text style={st.label}>טווח גובה (ס"מ)</Text>
          <View style={st.row}>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredHeightMin} onChangeText={setDesiredHeightMin} placeholder="מ-" keyboardType="numeric" maxLength={3} />
            </View>
            <View style={st.rowItem}>
              <TextInput style={st.input} value={desiredHeightMax} onChangeText={setDesiredHeightMax} placeholder="עד-" keyboardType="numeric" maxLength={3} />
            </View>
          </View>
          <Text style={st.label}>גמישות בגובה</Text>
          <OptionButtons options={FLEX_OPTIONS} value={heightFlex} onChange={setHeightFlex} />

          <Text style={st.label}>טווח מיקום</Text>
          <OptionButtons options={LOCATION_OPTIONS} value={locationRange} onChange={setLocationRange} />
        </View>

        {/* Photos */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>תמונות</Text>
          <Text style={{ fontSize: 13, color: "#888", textAlign: "right", marginBottom: 12 }}>
            מומלץ להעלות 3 תמונות
          </Text>

          <View style={st.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.id} style={st.photoWrapper}>
                <Image source={{ uri: `${API_BASE_URL}${photo.url}` }} style={st.photo} />
                <Pressable style={st.photoDelete} onPress={() => handleDeletePhoto(photo.id)}>
                  <Text style={st.photoDeleteText}>✕</Text>
                </Pressable>
              </View>
            ))}

            {/* Add photo button */}
            <Pressable
              style={[st.photoAdd, uploading && { opacity: 0.5 }]}
              onPress={handlePickPhoto}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#6C63FF" />
              ) : (
                <Text style={st.photoAddText}>+</Text>
              )}
            </Pressable>
          </View>
        </View>

        <Pressable style={[st.saveBtn, loading && st.saveBtnDis]} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={st.saveBtnText}>{saved ? "נשמר ✓" : "שמור שינויים"}</Text>
          )}
        </Pressable>
        {error ? <Text style={st.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: "#F5F5FF" },
  backRow: { marginBottom: 12 },
  backText: { fontSize: 14, color: "#666", textAlign: "right" },
  heading: { fontSize: 22, fontWeight: "bold", color: "#333", textAlign: "right", marginBottom: 20 },
  section: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 8, textAlign: "right" },
  label: { fontSize: 14, fontWeight: "500", color: "#555", marginBottom: 4, marginTop: 12, textAlign: "right" },
  input: { backgroundColor: "#fafafa", borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, textAlign: "right", marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  rowItem: { flex: 1 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff" },
  optionSel: { backgroundColor: "#6C63FF", borderColor: "#6C63FF" },
  optionTxt: { fontSize: 13, color: "#333" },
  optionTxtSel: { color: "#fff", fontWeight: "600" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoWrapper: { width: 100, height: 100, borderRadius: 10, overflow: "hidden", position: "relative" },
  photo: { width: "100%", height: "100%", borderRadius: 10 },
  photoDelete: {
    position: "absolute", top: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12,
    width: 24, height: 24, alignItems: "center", justifyContent: "center",
  },
  photoDeleteText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  photoAdd: {
    width: 100, height: 100, borderRadius: 10,
    borderWidth: 2, borderColor: "#ddd", borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa",
  },
  photoAddText: { fontSize: 32, color: "#bbb" },
  saveBtn: { backgroundColor: "#1a1a1a", paddingVertical: 16, borderRadius: 30, alignItems: "center", marginTop: 24 },
  saveBtnDis: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  error: { color: "#E53935", fontSize: 13, textAlign: "center", marginTop: 10 },
});
