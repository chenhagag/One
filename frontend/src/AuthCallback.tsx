import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { saveSupabaseTokens } from "./lib/api";
import type { User } from "./App";

interface AuthCallbackProps {
  onSuccess: (user: User, profileComplete: boolean) => void;
  onError: (message: string) => void;
}

export default function AuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const [status, setStatus] = useState("Signing you in...");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // On-screen debug logger (visible on iPhone without dev tools)
  function log(msg: string) {
    console.log("[auth-callback]", msg);
    setDebugLog((prev) => [...prev, `${new Date().toLocaleTimeString()} ${msg}`]);
  }

  useEffect(() => {
    let cancelled = false;
    let done = false;

    // Global timeout — if nothing works in 15s, give up
    const globalTimeout = setTimeout(() => {
      if (!done && !cancelled) {
        done = true;
        log("TIMEOUT — no session in 15s");
        const msg = "Sign-in timed out. Please try again.";
        setErrorMsg(msg);
        onError(msg);
      }
    }, 15000);

    function finish(user: User, profileComplete: boolean) {
      if (done || cancelled) return;
      done = true;
      clearTimeout(globalTimeout);
      log(`SUCCESS user=${user.id} email=${user.email}`);
      onSuccess(user, profileComplete);
    }

    function fail(msg: string) {
      if (done || cancelled) return;
      done = true;
      clearTimeout(globalTimeout);
      log(`FAIL: ${msg}`);
      setErrorMsg(msg);
      onError(msg);
    }

    async function syncUser(accessToken: string, refreshToken?: string) {
      if (done || cancelled) return;
      setStatus("Setting up your account...");

      // Persist tokens in our own localStorage — immune to Safari ITP
      saveSupabaseTokens(accessToken, refreshToken);
      log("tokens saved to localStorage");

      log("calling /auth/sync...");
      try {
        const res = await fetch("/auth/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        log(`/auth/sync → ${res.status}`);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          fail(data.error || `Sync failed (${res.status})`);
          return;
        }

        const user = await res.json();
        log(`synced: id=${user.id} email=${user.email}`);
        finish(user, user.profile_complete !== false);
      } catch (err: any) {
        fail(`Network error: ${err.message}`);
      }
    }

    async function handleCallback() {
      if (!supabase) {
        fail("OAuth not configured");
        return;
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hashParams = new URLSearchParams(url.hash.replace("#", ""));
      const hashAccessToken = hashParams.get("access_token");
      const hashRefreshToken = hashParams.get("refresh_token");

      log(`URL: ${window.location.href}`);
      log(`code=${!!code} hash_token=${!!hashAccessToken}`);

      // ── Strategy 1: PKCE code exchange (primary for Safari) ──────
      if (code) {
        log("Strategy 1: PKCE code exchange...");
        setStatus("Verifying your identity...");
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            log(`PKCE exchange error: ${error.message}`);
            // Don't fail yet — fall through to other strategies
          } else if (data.session) {
            log("PKCE exchange SUCCESS");
            await syncUser(data.session.access_token, data.session.refresh_token);
            return;
          }
        } catch (err: any) {
          log(`PKCE exchange exception: ${err.message}`);
        }
      }

      // ── Strategy 2: Hash fragment token (implicit flow fallback) ──
      if (hashAccessToken) {
        log("Strategy 2: hash fragment token");
        await syncUser(hashAccessToken, hashRefreshToken || undefined);
        return;
      }

      // ── Strategy 3: onAuthStateChange + getSession fallback ──────
      log("Strategy 3: waiting for auth state change...");
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          log(`auth event: ${event} session=${!!session}`);
          if (session && !done) {
            subscription.unsubscribe();
            await syncUser(session.access_token, session.refresh_token);
          }
        }
      );

      // Also try getSession after a short delay
      setTimeout(async () => {
        if (done || cancelled) return;
        log("trying getSession fallback...");
        try {
          const result = await Promise.race([
            supabase!.auth.getSession(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
          ]);
          const session = result && "data" in result ? result.data.session : null;
          log(`getSession → session=${!!session}`);
          if (session && !done) {
            subscription.unsubscribe();
            await syncUser(session.access_token, session.refresh_token);
          }
        } catch (err: any) {
          log(`getSession failed: ${err.message}`);
        }
      }, 1000);
    }

    handleCallback();

    return () => {
      cancelled = true;
      clearTimeout(globalTimeout);
    };
  }, [onSuccess, onError]);

  return (
    <div style={{ display: "flex", minHeight: "100dvh", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e5e7eb", borderTopColor: "#1f2937", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: 14, color: "#6b7280" }}>{status}</p>
        {errorMsg && (
          <div style={{ maxWidth: 300, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#ef4444", marginBottom: 12 }}>{errorMsg}</p>
            <button
              onClick={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }}
              style={{ fontSize: 13, color: "#6b7280", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
            >
              Back to login
            </button>
          </div>
        )}
      </div>
      {/* Debug log — visible on iPhone for troubleshooting */}
      {debugLog.length > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          maxHeight: "40vh", overflow: "auto",
          background: "#111", color: "#0f0", fontSize: 11,
          fontFamily: "monospace", padding: 8, lineHeight: 1.4,
          whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {debugLog.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
