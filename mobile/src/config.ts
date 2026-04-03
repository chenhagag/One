import { Platform } from "react-native";
import Constants from "expo-constants";

const PORT = 3001;

/**
 * Resolves the backend API base URL per platform:
 *
 *  - Web:              localhost
 *  - Android emulator: 10.0.2.2  (emulator's alias for host loopback)
 *  - iOS simulator:    localhost
 *  - Physical device (Expo Go): uses the same IP that Expo's dev server
 *    is broadcasting on, since your phone and laptop share a LAN.
 *
 * If auto-detection fails on a physical device, set the LAN_IP override below.
 */

// ── Manual override ──────────────────────────────────────────────
// If Expo Go on your phone can't reach the backend automatically,
// hard-code your computer's local IP here (e.g. "192.168.1.42").
const LAN_IP_OVERRIDE: string | null = null;
// ─────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  // Web always uses localhost
  if (Platform.OS === "web") {
    return `http://localhost:${PORT}`;
  }

  // Physical device — try to auto-detect the dev server host IP
  if (!Constants.isDevice) {
    // Running in an emulator/simulator
    if (Platform.OS === "android") {
      return `http://10.0.2.2:${PORT}`;
    }
    // iOS simulator
    return `http://localhost:${PORT}`;
  }

  // Physical device via Expo Go
  if (LAN_IP_OVERRIDE) {
    return `http://${LAN_IP_OVERRIDE}:${PORT}`;
  }

  // Auto-detect: Expo dev server exposes the host URI (your LAN IP)
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? // SDK 49+
    (Constants as any).manifest?.debuggerHost; // older SDKs

  if (debuggerHost) {
    const lanIp = debuggerHost.split(":")[0];
    return `http://${lanIp}:${PORT}`;
  }

  // Fallback — shouldn't normally reach here in dev
  return `http://localhost:${PORT}`;
}

export const API_BASE_URL = getBaseUrl();
