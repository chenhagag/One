import { supabase } from "./supabase";

/**
 * Fetch wrapper that auto-attaches the Supabase JWT to every request.
 * Falls back gracefully if no session exists (legacy email-only login).
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  }

  return fetch(`/api${path}`, { ...options, headers });
}
