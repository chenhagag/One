import { View, Text, StyleSheet } from "react-native";

export default function DoneScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>❤️</Text>
      <Text style={styles.title}>תודה!</Text>
      <Text style={styles.subtitle}>
        אנחנו מתחילים לחפש עבורך את ההתאמה המושלמת
      </Text>
      <Text style={styles.note}>
        נעדכן אותך ברגע שנמצא מישהו מתאים
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5FF",
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#444",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  note: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
});
