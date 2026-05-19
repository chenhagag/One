import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
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

    // Global timeout — if nothing works in 10s, give up
    const globalTimeout = setTimeout(() => {
      if (!done && !cancelled) {
        done = true;
        const msg = "Sign-in timed out. Please try again.";
        setErrorMsg(msg);
        onError(msg);
      }
    }, 10000);

    async function syncUser(accessToken: string) {
      if (done || cancelled) return;
      setStatus("Setting up your account...");

      const res = await fetch("/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log("[auth-callback] /auth/sync status:", res.status);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || `Failed to sync account (${res.status})`;
        console.error("[auth-callback]", msg);
        if (!cancelled) { done = true; setErrorMsg(msg); onError(msg); }
        return;
      }

      const user = await res.json();
      console.log("[auth-callback] user synced:", user.id, user.email);
      if (!cancelled) {
        done = true;
        onSuccess(user, user.profile_complete !== false);
      }
    }

    async function handleCallback() {
      if (!supabase) {
        done = true;
        onError("OAuth not configured");
        return;
      }

      console.log("[auth-callback] URL:", window.location.href);

      // Listen for auth state change (handles PKCE code exchange)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log("[auth-callback] auth event:", event, "session:", !!session);
          if (session && !done) {
            subscription.unsubscribe();
            await syncUser(session.access_token);
          }
        }
      );

      // Also try getSession after a short delay (in case event already fired)
      setTimeout(async () => {
        if (done || cancelled) return;
        try {
          const result = await Promise.race([
            supabase!.auth.getSession(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          const session = result && "data" in result ? result.data.session : null;
          console.log("[auth-callback] fallback getSession:", !!session);
          if (session && !done) {
            subscription.unsubscribe();
            await syncUser(session.access_token);
          }
        } catch {
          // Supabase blocked — global timeout will handle
        }
      }, 1500);
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
        {errorMsg && <p style={{ fontSize: 13, color: "#ef4444", maxWidth: 300, textAlign: "center" }}>{errorMsg}</p>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
