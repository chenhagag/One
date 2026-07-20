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
 * 1. Check our own localStorage copy first (instant, works for OTP + OAuth)
 * 2. Ask Supabase client as fallback (for OAuth users whose token we don't have yet)
 */
async function getAccessToken(): Promise<string | null> {
  // Strategy 1: Our own localStorage copy — fastest path
  const saved = getSavedAccessToken();
  if (saved) return saved;

  // Strategy 2: Supabase client — for OAuth users, 2s timeout
  if (supabase) {
    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      const session = result && "data" in result ? result.data.session : null;
      if (session?.access_token) {
        saveSupabaseTokens(session.access_token, session.refresh_token);
        return session.access_token;
      }
    } catch {
      // Supabase blocked — no token available
    }
  }

  return null;
}

/**
 * Try to force-refresh the Supabase token.
 * Returns new access token or null if refresh failed.
 */
async function tryRefreshToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) return null;
    saveSupabaseTokens(data.session.access_token, data.session.refresh_token);
    return data.session.access_token;
  } catch {
    return null;
  }
}

// Prevent multiple session-expired events from firing simultaneously
let sessionExpiredFired = false;
function fireSessionExpired() {
  if (sessionExpiredFired) return;
  sessionExpiredFired = true;
  window.dispatchEvent(new CustomEvent("session-expired"));
  // Reset after 3s so it can fire again if user logs in and expires again
  setTimeout(() => { sessionExpiredFired = false; }, 3000);
}

/**
 * Fetch wrapper that auto-attaches the Supabase JWT to every request.
 * On 401, attempts a token refresh and retries once. If refresh fails,
 * dispatches a "session-expired" event so App.tsx can redirect to login.
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const isFormData = options?.body instanceof FormData;
  const baseHeaders: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options?.headers as Record<string, string>),
  };

  const token = await getAccessToken();
  if (token) {
    baseHeaders["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${getApiBaseUrl()}/api${path}`, { ...options, headers: baseHeaders });

  // On 401 — try refreshing the token and retry once.
  // apiFetch is only used by logged-in components (login/OTP use raw fetch),
  // so a 401 here always means the session is broken.
  if (res.status === 401 && !path.includes("/log-error")) {
    if (token) {
      // Had a token but it was rejected — try refreshing
      const newToken = await tryRefreshToken();
      if (newToken) {
        baseHeaders["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(`${getApiBaseUrl()}/api${path}`, { ...options, headers: baseHeaders });
      } else {
        fireSessionExpired();
      }
    } else {
      // No token at all (legacy login without JWT) — session is invalid
      fireSessionExpired();
    }
  }

  // Auto-report errors (non-2xx) — skip /log-error to avoid infinite loop
  if (!res.ok && !path.includes("/log-error")) {
    // Clone response to read body without consuming it for the caller
    const cloned = res.clone();
    cloned.text().then(body => {
      let errorDetail = "";
      try { errorDetail = JSON.parse(body)?.error || body.slice(0, 300); } catch { errorDetail = body.slice(0, 300); }
      reportError({
        route: path,
        method: options?.method || "GET",
        status_code: res.status,
        message: `API ${res.status}: ${path}`,
        extra: { response: errorDetail },
      });
    }).catch(() => {
      reportError({
        route: path,
        method: options?.method || "GET",
        status_code: res.status,
        message: `API ${res.status}: ${path}`,
      });
    });
  }

  return res;
}

// ── Error reporting ─────────────────────────────────────────────

let errorReportQueue: Array<Record<string, any>> = [];
let errorFlushTimer: ReturnType<typeof setTimeout> | null = null;

function reportError(data: { route?: string; method?: string; status_code?: number; message: string; stack?: string; extra?: any }) {
  // Deduplicate — don't report the same error multiple times within 10s
  const key = `${data.message}:${data.route}`;
  if (errorReportQueue.some(e => `${e.message}:${e.route}` === key)) return;

  errorReportQueue.push({ source: "frontend", ...data });

  // Batch — flush after 2s to avoid spamming during rapid failures
  if (!errorFlushTimer) {
    errorFlushTimer = setTimeout(flushErrors, 2000);
  }
}

async function flushErrors() {
  errorFlushTimer = null;
  const batch = errorReportQueue.splice(0, 10); // Max 10 per flush
  for (const err of batch) {
    try {
      const token = getSavedAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      fetch(`${getApiBaseUrl()}/api/log-error`, {
        method: "POST",
        headers,
        body: JSON.stringify(err),
      }).catch(() => {});
    } catch {
      // Never let error reporting break the app
    }
  }
}

/** Initialize global error handlers — call once from App.tsx */
export function initErrorReporting() {
  window.addEventListener("error", (e) => {
    reportError({
      message: e.message || "Uncaught error",
      stack: e.error?.stack,
      extra: { filename: e.filename, lineno: e.lineno, colno: e.colno },
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    reportError({
      message: reason?.message || String(reason) || "Unhandled promise rejection",
      stack: reason?.stack,
    });
  });
}
