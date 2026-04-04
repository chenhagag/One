import { API_BASE_URL } from "./config";

export interface RegisterPayload {
  first_name: string;
  email: string;
  age?: number;
  gender?: string;
  looking_for_gender?: string;
  city?: string;
  height?: number;
  desired_age_min?: number;
  desired_age_max?: number;
  age_flexibility?: string;
  desired_height_min?: number;
  desired_height_max?: number;
  height_flexibility?: string;
  desired_location_range?: string;
}

export interface User {
  id: number;
  first_name: string;
  email: string;
  age: number | null;
  gender: string | null;
  looking_for_gender: string | null;
  city: string | null;
  height: number | null;
  user_status: string;
  created_at: string;
}

export async function registerUser(data: RegisterPayload): Promise<User> {
  const res = await fetch(`${API_BASE_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Registration failed");
  return json;
}

// ── Conversation API ──────────────────────────────────────────

export interface ConversationResponse {
  assistant_message: string;
  phase: "chatting" | "summarizing" | "confirmed" | "paused";
  coverage_pct: number;
  readiness_score: number;
  turn_count: number;
  resumed?: boolean;
  turns?: { role: "user" | "assistant"; content: string }[];
}

export async function startConversation(userId: number): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE_URL}/conversation/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to start conversation");
  return json;
}

export async function sendMessage(userId: number, message: string): Promise<ConversationResponse> {
  const res = await fetch(`${API_BASE_URL}/conversation/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, message }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to send message");
  return json;
}

export async function pauseConversation(userId: number): Promise<void> {
  await fetch(`${API_BASE_URL}/conversation/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
}
