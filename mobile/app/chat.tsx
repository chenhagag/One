import { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { startConversation, sendMessage, pauseConversation } from "../src/api";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

type Phase = "chatting" | "summarizing" | "confirmed" | "paused";

export default function ChatScreen() {
  const router = useRouter();
  const { userId: rawUserId, userName } = useLocalSearchParams<{ userId: string; userName: string }>();
  const userId = parseInt(rawUserId || "0", 10);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("chatting");
  const [started, setStarted] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Start conversation on mount
  useEffect(() => {
    if (started || !userId) return;
    setStarted(true);
    setLoading(true);

    startConversation(userId)
      .then((data) => {
        if (data.resumed && data.turns) {
          setMessages(data.turns);
        } else {
          setMessages([{ role: "system", content: data.assistant_message }]);
        }
        setPhase(data.phase || "chatting");
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
    if (!text || loading || phase === "confirmed" || phase === "paused") return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const data = await sendMessage(userId, text);
      if (data.phase === "confirmed") {
        setMessages((prev) => [...prev, { role: "system", content: data.assistant_message }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.assistant_message }]);
      }
      setPhase(data.phase);
    } catch {
      setMessages((prev) => [...prev, { role: "system", content: "שגיאה בשליחה, נסה שוב." }]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePause() {
    try {
      await pauseConversation(userId);
      setPhase("paused");
    } catch {}
  }

  function handleComplete() {
    router.replace({ pathname: "/photos", params: { userId: rawUserId || "" } });
  }

  const canType = phase === "chatting" || phase === "summarizing";

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
      {/* Messages */}
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

      {/* Bottom area */}
      {phase === "confirmed" ? (
        <View style={st.bottomCenter}>
          <Pressable style={st.findBtn} onPress={handleComplete}>
            <Text style={st.findBtnText}>Find My One ❤️</Text>
          </Pressable>
        </View>
      ) : phase === "paused" ? (
        <View style={st.bottomCenter}>
          <Text style={st.pausedText}>השיחה נשמרה. אפשר להמשיך בכל זמן.</Text>
        </View>
      ) : (
        <View>
          <View style={st.inputRow}>
            <TextInput
              style={st.input}
              value={input}
              onChangeText={setInput}
              placeholder={phase === "summarizing" ? "...תיקון או אישור" : "...כתבי כאן"}
              editable={canType && !loading}
              multiline
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <Pressable style={[st.sendBtn, (!input.trim() || loading || !canType) && st.sendDis]} onPress={handleSend} disabled={!input.trim() || loading || !canType}>
              <Text style={st.sendBtnText}>שלחי</Text>
            </Pressable>
          </View>
          <Pressable style={st.pauseBtn} onPress={handlePause} disabled={loading}>
            <Text style={st.pauseBtnText}>נמשיך בפעם אחרת</Text>
          </Pressable>
        </View>
      )}
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
  textUser: { color: "#fff", fontSize: 15, lineHeight: 22 },
  textOther: { color: "#1a1a1a", fontSize: 15, lineHeight: 22 },
  loadingRow: { alignItems: "center", paddingVertical: 8 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#e5e5e5" },
  input: {
    flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, textAlign: "right",
  },
  sendBtn: { backgroundColor: "#1a1a1a", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 12 },
  sendDis: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  pauseBtn: { alignItems: "center", paddingVertical: 8, paddingBottom: 16 },
  pauseBtnText: { color: "#888", fontSize: 13, textDecorationLine: "underline" },
  bottomCenter: { alignItems: "center", padding: 24, borderTopWidth: 1, borderTopColor: "#e5e5e5" },
  findBtn: {
    backgroundColor: "#6C63FF", paddingVertical: 16, paddingHorizontal: 40, borderRadius: 30,
  },
  findBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  pausedText: { color: "#666", fontSize: 14 },
});
