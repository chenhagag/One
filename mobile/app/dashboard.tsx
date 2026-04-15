import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { API_BASE_URL } from "../src/config";

interface Card {
  key: string;
  title: string;
  description?: string;
  icon: string;
  progress: number;
  status: "completed" | "available" | "locked";
  accentColor: string;
}

interface Progress {
  identity_pct: number;
  lab_pct: number;
  depth_pct: number;
  coverage_pct: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { userId, userName } = useLocalSearchParams<{ userId: string; userName: string }>();
  const [progress, setProgress] = useState<Progress>({ identity_pct: 0, lab_pct: 0, depth_pct: 0, coverage_pct: 0 });

  const fetchProgress = useCallback(() => {
    if (!userId) return;
    fetch(`${API_BASE_URL}/users/${userId}/dashboard-progress`)
      .then(r => r.json())
      .then(setProgress)
      .catch(() => {});
  }, [userId]);

  // Refresh on screen focus (coming back from chat/profile)
  useFocusEffect(useCallback(() => { fetchProgress(); }, [fetchProgress]));

  const cards: Card[] = [
    {
      key: "identity",
      title: "תעודת זהות",
      icon: "🪪",
      progress: progress.identity_pct,
      status: progress.identity_pct >= 100 ? "completed" : "available",
      accentColor: "#A78BFA",
    },
    {
      key: "deep_chat",
      title: "שיחת עומק",
      description: "שיחה חופשית על מה שחשוב לך באמת, על ערכים ועל מה שבלב.",
      icon: "💬",
      progress: progress.depth_pct,
      status: progress.depth_pct >= 100 ? "completed" : "available",
      accentColor: "#818CF8",
    },
    {
      key: "personality_lab",
      title: "מעבדת האישיות",
      description: "מבדק אקטיבי של סימולציות ודילמות כדי להבין את ה-DNA שלך.",
      icon: "🧪",
      progress: progress.lab_pct,
      status: progress.lab_pct >= 100 ? "completed" : "available",
      accentColor: "#6366F1",
    },
    {
      key: "partner_compass",
      title: "המצפן הזוגי",
      description: "מה מושך אותך? בחירה מהירה של סגנונות, תמונות ואנרגיות.",
      icon: "🧭",
      progress: 0,
      status: "locked",
      accentColor: "#C084FC",
    },
  ];

  function handleNavigate(key: string) {
    if (key === "identity") {
      router.push({ pathname: "/profile-edit", params: { userId } });
    } else if (key === "deep_chat") {
      router.push({ pathname: "/psychologist-chat", params: { userId, userName } });
    } else if (key === "personality_lab") {
      router.push({ pathname: "/chat", params: { userId, userName } });
    }
  }

  return (
    <View style={st.container}>
      <Text style={st.title}>המסע שלך מתחיל כאן</Text>
      <Text style={st.subtitle}>היי {userName || ""}, כל שלב מקרב אותך להתאמה המושלמת</Text>

      <View style={st.cardsContainer}>
        {cards.map((card) => {
          const isClickable = card.status !== "locked";
          return (
            <Pressable
              key={card.key}
              style={[
                st.card,
                { borderColor: card.status === "completed" ? card.accentColor + "60" : "#2a2a3e" },
                card.status === "locked" && st.cardLocked,
              ]}
              onPress={() => isClickable && handleNavigate(card.key)}
              disabled={!isClickable}
            >
              <View style={st.cardTop}>
                <View style={[st.iconWrap, { backgroundColor: card.accentColor + "18" }]}>
                  <Text style={st.iconText}>{card.icon}</Text>
                </View>
                {card.status === "completed" && (
                  <View style={[st.statusBadge, { backgroundColor: "#10B981" }]}>
                    <Text style={st.badgeText}>✓</Text>
                  </View>
                )}
                {card.status === "locked" && (
                  <View style={[st.statusBadge, { backgroundColor: "#4B5563" }]}>
                    <Text style={st.badgeText}>🔒</Text>
                  </View>
                )}
              </View>

              <Text style={st.cardTitle}>{card.title}</Text>

              {card.description && <Text style={st.cardDesc}>{card.description}</Text>}

              <View style={st.progressTrack}>
                <View style={[
                  st.progressFill,
                  {
                    width: `${card.progress}%`,
                    backgroundColor: card.progress >= 100 ? "#10B981" : card.accentColor,
                  },
                ]} />
              </View>
              <Text style={st.progressLabel}>
                {card.progress >= 100 ? "הושלם" : card.status === "locked" ? "בקרוב" : `${card.progress}%`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
    padding: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#C084FC",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 32,
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a2a3e",
    backgroundColor: "rgba(26, 26, 46, 0.9)",
  },
  cardLocked: {
    opacity: 0.5,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 24,
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    color: "#fff",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#f1f5f9",
    textAlign: "right",
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 20,
    textAlign: "right",
    marginBottom: 14,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2a2a3e",
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 6,
    textAlign: "right",
  },
});
