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

  useEffect(() => {
    let cancelled = false;
    let done = false;

    const globalTimeout = setTimeout(() => {
      if (!done && !cancelled) {
        done = true;
        const msg = "Sign-in timed out. Please try again.";
        setErrorMsg(msg);
        onError(msg);
      }
    }, 15000);

    function finish(user: User, profileComplete: boolean) {
      if (done || cancelled) return;
      done = true;
      clearTimeout(globalTimeout);
      onSuccess(user, profileComplete);
    }

    function fail(msg: string) {
      if (done || cancelled) return;
      done = true;
      clearTimeout(globalTimeout);
      setErrorMsg(msg);
      onError(msg);
    }

    async function syncUser(accessToken: string, refreshToken?: string) {
      if (done || cancelled) return;
      setStatus("Setting up your account...");

      saveSupabaseTokens(accessToken, refreshToken);

      try {
        const res = await fetch("/auth/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          fail(data.error || `Sync failed (${res.status})`);
          return;
        }

        const user = await res.json();
        finish(user, user.profile_complete !== false);
      } catch (err: any) {
        fail(`Network error: ${err.message}`);
      }
    }

    async function handleCallback() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hashParams = new URLSearchParams(url.hash.replace("#", ""));
      const hashAccessToken = hashParams.get("access_token");
      const hashRefreshToken = hashParams.get("refresh_token");

      // Strategy 1: Hash fragment token (implicit flow)
      if (hashAccessToken) {
        await syncUser(hashAccessToken, hashRefreshToken || undefined);
        return;
      }

      // Strategy 2: Server-side code exchange (works on Safari — bypasses ITP)
      if (code) {
        setStatus("Verifying your identity...");
        try {
          const res = await fetch("/auth/exchange-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          if (res.ok && data.access_token) {
            await syncUser(data.access_token, data.refresh_token);
            return;
          }
        } catch {
          // Fall through to client-side strategies
        }
      }

      // Strategy 3: Client-side Supabase exchange (Chrome/Android)
      if (supabase) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (_event, session) => {
            if (session && !done) {
              subscription.unsubscribe();
              await syncUser(session.access_token, session.refresh_token);
            }
          }
        );

        if (code) {
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error && data.session) {
              subscription.unsubscribe();
              await syncUser(data.session.access_token, data.session.refresh_token);
              return;
            }
          } catch {
            // onAuthStateChange may still fire
          }
        }

        // Strategy 4: getSession fallback
        setTimeout(async () => {
          if (done || cancelled) return;
          try {
            const result = await Promise.race([
              supabase!.auth.getSession(),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
            const session = result && "data" in result ? result.data.session : null;
            if (session && !done) {
              subscription.unsubscribe();
              await syncUser(session.access_token, session.refresh_token);
            }
          } catch {
            // Will hit global timeout
          }
        }, 1500);
      }
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
