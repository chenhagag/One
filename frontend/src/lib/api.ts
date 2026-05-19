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
    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      const session = result && "data" in result ? result.data.session : null;
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch {
      // Supabase blocked — continue without JWT
    }
  }

  return fetch(`/api${path}`, { ...options, headers });
}
