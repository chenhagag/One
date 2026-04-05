import { useState, useEffect } from "react";
import {
  View, Text, Pressable, StyleSheet, Image, FlatList,
  ActivityIndicator, Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { uploadPhoto, getUserPhotos, deletePhoto, API_BASE_URL, type UserPhoto } from "../src/api";

const MIN_PHOTOS = 3;

export default function PhotosScreen() {
  const router = useRouter();
  const { userId: rawUserId } = useLocalSearchParams<{ userId: string }>();
  const userId = parseInt(rawUserId || "0", 10);

  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    getUserPhotos(userId)
      .then(data => setPhotos(data.photos))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "We need access to your photos to continue.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MIN_PHOTOS - photos.length,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        const uploaded = await uploadPhoto(userId, asset.uri);
        setPhotos(prev => [...prev, {
          id: Date.now(),
          filename: uploaded.filename,
          url: uploaded.url,
          original_name: asset.fileName || "photo.jpg",
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (err: any) {
      Alert.alert("Upload failed", err.message || "Could not upload photo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photoId: number) {
    try {
      await deletePhoto(userId, photoId);
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch {}
  }

  function handleContinue() {
    router.replace("/done");
  }

  const canContinue = photos.length >= MIN_PHOTOS;

  if (loading) {
    return (
      <View style={st.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <View style={st.container}>
      <Text style={st.title}>העלאת תמונות</Text>
      <Text style={st.subtitle}>
        כדי שנוכל למצוא לך התאמה מדויקת, נצטרך לפחות {MIN_PHOTOS} תמונות שלך.
      </Text>

      <Text style={st.counter}>
        {photos.length} / {MIN_PHOTOS} תמונות
      </Text>

      {/* Photo grid */}
      <FlatList
        data={photos}
        numColumns={3}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={st.grid}
        renderItem={({ item }) => (
          <View style={st.photoWrapper}>
            <Image
              source={{ uri: `${API_BASE_URL}${item.url}` }}
              style={st.photo}
            />
            <Pressable
              style={st.deleteBtn}
              onPress={() => handleDelete(item.id)}
            >
              <Text style={st.deleteBtnText}>✕</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={st.emptyState}>
            <Text style={st.emptyText}>עדיין לא העלית תמונות</Text>
          </View>
        }
      />

      {/* Add photo button */}
      {photos.length < 6 && (
        <Pressable
          style={[st.addBtn, uploading && st.addBtnDisabled]}
          onPress={handlePickPhoto}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={st.addBtnText}>
              + הוסיפי תמונה
            </Text>
          )}
        </Pressable>
      )}

      {/* Validation message */}
      {!canContinue && photos.length > 0 && (
        <Text style={st.validation}>
          צריך עוד {MIN_PHOTOS - photos.length} {MIN_PHOTOS - photos.length === 1 ? "תמונה" : "תמונות"}
        </Text>
      )}

      {/* Continue button */}
      <Pressable
        style={[st.continueBtn, !canContinue && st.continueBtnDisabled]}
        onPress={handleContinue}
        disabled={!canContinue}
      >
        <Text style={st.continueBtnText}>
          {canContinue ? "המשך ❤️" : `צריך לפחות ${MIN_PHOTOS} תמונות`}
        </Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5FF", padding: 20 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F5FF" },
  title: { fontSize: 24, fontWeight: "bold", color: "#333", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 16, lineHeight: 22 },
  counter: { fontSize: 16, fontWeight: "600", color: "#6C63FF", textAlign: "center", marginBottom: 16 },
  grid: { paddingBottom: 16 },
  photoWrapper: { flex: 1 / 3, aspectRatio: 1, padding: 4, position: "relative" },
  photo: { width: "100%", height: "100%", borderRadius: 10 },
  deleteBtn: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12,
    width: 24, height: 24, alignItems: "center", justifyContent: "center",
  },
  deleteBtnText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 14, color: "#aaa" },
  addBtn: {
    backgroundColor: "#6C63FF", paddingVertical: 14, borderRadius: 25,
    alignItems: "center", marginBottom: 12,
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  validation: { fontSize: 13, color: "#E53935", textAlign: "center", marginBottom: 8 },
  continueBtn: {
    backgroundColor: "#1a1a1a", paddingVertical: 16, borderRadius: 30,
    alignItems: "center",
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
