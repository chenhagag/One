import { supabase } from "./supabase";
import { getApiBaseUrl } from "./platform";

// ── Token persistence (our own localStorage keys) ──────────────
// Safari ITP can block Supabase's internal storage on its third-party
// domain. We keep our own copy of the access token so that API calls
// never depend on Supabase's storage layer working.

const TOKEN_KEY = "one_access_token";
const REFRESH_KEY = "one_refresh_token";

export function saveSupabaseTokens(accessToken: string, refreshToken?: string) {
  try {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch {
    // localStorage unavailable (private browsing edge case) — proceed without
  }
}

export function clearSupabaseTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

function getSavedAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Try to get a fresh access token. Strategy:
 * 1. Ask Supabase client (works when ITP doesn't block it)
 * 2. Fall back to our own localStorage copy
 * 3. If Supabase has a refresh token, try refreshing silently
 */
async function getAccessToken(): Promise<string | null> {
  // Strategy 1: Supabase client — fast path, 2s timeout
  if (supabase) {
    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      const session = result && "data" in result ? result.data.session : null;
      if (session?.access_token) {
        // Keep our copy fresh
        saveSupabaseTokens(session.access_token, session.refresh_token);
        return session.access_token;
      }
    } catch {
      // Supabase blocked — try our fallback
    }
  }

  // Strategy 2: Our own localStorage copy
  const saved = getSavedAccessToken();
  if (saved) return saved;

  return null;
}

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

  const token = await getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(`${getApiBaseUrl()}/api${path}`, { ...options, headers });
}
