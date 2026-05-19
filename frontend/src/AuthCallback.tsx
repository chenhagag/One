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

    async function handleCallback() {
      try {
        if (!supabase) { if (!cancelled) onError("OAuth not configured"); return; }

        console.log("[auth-callback] URL:", window.location.href);
        console.log("[auth-callback] hash:", window.location.hash ? "present" : "empty");

        // Wait for Supabase to process the URL hash/params
        // onAuthStateChange fires when Supabase picks up the tokens from the URL
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log("[auth-callback] auth event:", event, "session:", !!session);

            if (event === "SIGNED_IN" && session) {
              subscription.unsubscribe();

              if (cancelled) return;
              setStatus("Setting up your account...");

              try {
                const res = await fetch("/auth/sync", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                  },
                });

                console.log("[auth-callback] /auth/sync status:", res.status);

                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  const msg = data.error || `Failed to sync account (${res.status})`;
                  console.error("[auth-callback]", msg);
                  if (!cancelled) { setErrorMsg(msg); onError(msg); }
                  return;
                }

                const user = await res.json();
                console.log("[auth-callback] user synced:", user.id, user.email);
                if (!cancelled) {
                  onSuccess(user, user.profile_complete !== false);
                }
              } catch (err: any) {
                const msg = err.message || "Failed to sync account";
                console.error("[auth-callback] sync error:", msg);
                if (!cancelled) { setErrorMsg(msg); onError(msg); }
              }
            }
          }
        );

        // Also try getSession as fallback (in case event already fired)
        setTimeout(async () => {
          if (cancelled) return;
          const { data: { session } } = await supabase!.auth.getSession();
          console.log("[auth-callback] fallback getSession:", !!session);
          if (session) {
            // Trigger the same flow
            subscription.unsubscribe();
            setStatus("Setting up your account...");

            const res = await fetch("/auth/sync", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              const msg = data.error || `Failed to sync account (${res.status})`;
              if (!cancelled) { setErrorMsg(msg); onError(msg); }
              return;
            }

            const user = await res.json();
            if (!cancelled) {
              onSuccess(user, user.profile_complete !== false);
            }
          } else if (!cancelled) {
            const msg = "No session found after sign-in";
            console.error("[auth-callback]", msg);
            setErrorMsg(msg);
            onError(msg);
          }
        }, 1500);

      } catch (err: any) {
        const msg = err.message || "Something went wrong. Please try again.";
        console.error("[auth-callback] error:", msg);
        if (!cancelled) { setErrorMsg(msg); onError(msg); }
      }
    }

    handleCallback();
    return () => { cancelled = true; };
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
