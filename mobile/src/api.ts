import { API_BASE_URL } from "./config";

export interface RegisterPayload {
  first_name: string;
  email: string;
  age?: number;
  gender?: string;
  looking_for_gender?: string;
  city?: string;
  height?: number;
  self_style?: string[];
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
  self_style: string | null;
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

  if (!res.ok) {
    throw new Error(json.error || "Registration failed");
  }

  return json;
}
