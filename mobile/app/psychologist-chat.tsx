import { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { startPsychologist, sendPsychologistMessage, triggerAnalysis } from "../src/api";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export default function PsychologistChatScreen() {
  const router = useRouter();
  const { userId: rawUserId, userName } = useLocalSearchParams<{ userId: string; userName: string }>();
  const userId = parseInt(rawUserId || "0", 10);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // Start psychologist chat on mount
  useEffect(() => {
    if (started || !userId) return;
    setStarted(true);
    setLoading(true);

    startPsychologist(userId)
      .then((data) => {
        setMessages(data.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })));
      })
      .catch(() => setMessages([{ role: "system", content: "לא הצלחנו להתחבר לשרת. נסה שוב מאוחר יותר." }]))
      .finally(() => setLoading(false));
  }, [userId, started]);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const data = await sendPsychologistMessage(userId, text);
      setMessages((prev) => [...prev, { role: "assistant", content: data.assistant_message }]);
    } catch {
      setMessages((prev) => [...prev, { role: "system", content: "שגיאה בשליחה, נסה שוב." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    // Fire analysis on exit (fire-and-forget)
    triggerAnalysis(userId);
    router.back();
  }

  function renderMessage({ item }: { item: Message }) {
    const style =
      item.role === "system" ? st.bubbleSystem :
      item.role === "user" ? st.bubbleUser : st.bubbleAssistant;
    return (
      <View style={style}>
        <Text style={item.role === "user" ? st.textUser : st.textOther}>{item.content}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={st.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {loading && (
        <View style={st.loadingRow}>
          <ActivityIndicator size="small" color="#6C63FF" />
        </View>
      )}

      <View>
        <View style={st.inputRow}>
          <TextInput
            style={st.input}
            value={input}
            onChangeText={setInput}
            placeholder="...כתבי כאן"
            editable={!loading}
            multiline
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable style={[st.sendBtn, (!input.trim() || loading) && st.sendDis]} onPress={handleSend} disabled={!input.trim() || loading}>
            <Text style={st.sendBtnText}>שלחי</Text>
          </Pressable>
        </View>
        <Pressable style={st.backBtn} onPress={handleBack} disabled={loading}>
          <Text style={st.backBtnText}>חזרה לדשבורד</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5FF" },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleUser: {
    alignSelf: "flex-end", backgroundColor: "#1a1a1a", borderRadius: 16, borderBottomRightRadius: 4,
    padding: 12, maxWidth: "80%", marginBottom: 10,
  },
  bubbleAssistant: {
    alignSelf: "flex-start", backgroundColor: "#f0f0f0", borderRadius: 16, borderBottomLeftRadius: 4,
    padding: 12, maxWidth: "80%", marginBottom: 10,
  },
  bubbleSystem: {
    alignSelf: "center", backgroundColor: "#f8f4e8", borderRadius: 12,
    padding: 14, maxWidth: "90%", marginBottom: 10,
  },
  textUser: { color: "#fff", fontSize: 15, lineHeight: 22, textAlign: "right" },
  textOther: { color: "#1a1a1a", fontSize: 15, lineHeight: 22, textAlign: "right" },
  loadingRow: { alignItems: "center", paddingVertical: 8 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#e5e5e5" },
  input: {
    flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, textAlign: "right",
  },
  sendBtn: { backgroundColor: "#1a1a1a", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 12 },
  sendDis: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  backBtn: { alignItems: "center", paddingVertical: 8, paddingBottom: 16 },
  backBtnText: { color: "#888", fontSize: 13, textDecorationLine: "underline" },
});
