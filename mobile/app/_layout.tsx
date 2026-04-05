import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#6C63FF" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "MatchMe" }} />
      <Stack.Screen name="register" options={{ title: "הרשמה" }} />
      <Stack.Screen name="chat" options={{ title: "שיחה", headerBackVisible: false }} />
      <Stack.Screen name="photos" options={{ title: "תמונות", headerBackVisible: false }} />
      <Stack.Screen name="done" options={{ title: "MatchMe", headerBackVisible: false }} />
      <Stack.Screen name="success" options={{ title: "Welcome!", headerBackVisible: false }} />
    </Stack>
  );
}
