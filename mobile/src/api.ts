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

// ── Psychologist API ──────────────────────────────────────────

export async function startPsychologist(userId: number): Promise<{ messages: { role: string; content: string }[]; is_returning: boolean }> {
  const res = await fetch(`${API_BASE_URL}/psychologist/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to start psychologist chat");
  return json;
}

export async function sendPsychologistMessage(userId: number, message: string): Promise<{ assistant_message: string; turn_count: number; done?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/psychologist/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, message }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to send message");
  return json;
}

export async function triggerAnalysis(userId: number): Promise<void> {
  await fetch(`${API_BASE_URL}/conversation/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  }).catch(() => {});
}

// ── User Update API ──────────────────────────────────────────

export async function getUser(userId: number): Promise<User> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to get user");
  return json;
}

export async function updateUser(userId: number, data: Record<string, any>): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update user");
  return json;
}

export async function getEnumOptions(): Promise<{ value: string; label_he: string; label_en: string; category: string }[]> {
  const res = await fetch(`${API_BASE_URL}/admin/enum-options`);
  const json = await res.json();
  if (!res.ok) return [];
  return json;
}

// ── Photo API ──────────────────────────────────────────────────

export interface PhotoUploadResult {
  filename: string;
  url: string;
  photo_count: number;
}

export interface UserPhoto {
  id: number;
  filename: string;
  url: string;
  original_name: string;
  created_at: string;
}

export async function uploadPhoto(userId: number, imageUri: string): Promise<PhotoUploadResult> {
  const formData = new FormData();
  const filename = imageUri.split("/").pop() || "photo.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("photo", { uri: imageUri, name: filename, type } as any);

  const res = await fetch(`${API_BASE_URL}/users/${userId}/photos`, {
    method: "POST",
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Upload failed");
  return json;
}

export async function getUserPhotos(userId: number): Promise<{ photos: UserPhoto[]; count: number }> {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/photos`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load photos");
  return json;
}

export async function deletePhoto(userId: number, photoId: number): Promise<void> {
  await fetch(`${API_BASE_URL}/users/${userId}/photos/${photoId}`, { method: "DELETE" });
}

export { API_BASE_URL };
