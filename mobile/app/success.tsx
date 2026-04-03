import { View, Text, StyleSheet } from "react-native";

export default function SuccessScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.checkmark}>V</Text>
      <Text style={styles.title}>You're in!</Text>
      <Text style={styles.subtitle}>
        Your profile has been created. We'll start finding your match soon.
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
  checkmark: {
    fontSize: 64,
    color: "#4CAF50",
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
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
});
