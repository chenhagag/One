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
      <Stack.Screen name="register" options={{ title: "Register" }} />
      <Stack.Screen
        name="success"
        options={{ title: "Welcome!", headerBackVisible: false }}
      />
    </Stack>
  );
}
