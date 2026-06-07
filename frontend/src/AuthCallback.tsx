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
  const [expired, setExpired] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let done = false;

    // Check for OTP expired error in URL hash or search params
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace("#", ""));
    const errorCode = url.searchParams.get("error_code") || hashParams.get("error_code");
    const errorType = url.searchParams.get("error") || hashParams.get("error");

    if (errorCode === "otp_expired" || (errorType === "access_denied" && hashParams.get("error_description")?.includes("expired"))) {
      const savedEmail = localStorage.getItem("user_login_email") || "";
      setResendEmail(savedEmail);
      setExpired(true);
      return;
    }

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
        const deviceInfo = (() => {
          const ua = navigator.userAgent;
          const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
          let device = "desktop";
          if (/iphone|ipad|ipod/i.test(ua)) device = "iphone";
          else if (/android/i.test(ua)) device = "android";
          return { device, pwa_installed: isStandalone };
        })();
        const res = await fetch("/auth/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(deviceInfo),
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
      const code = url.searchParams.get("code");
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

  async function handleResend() {
    const trimmed = resendEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;

    setResending(true);
    try {
      const res = await fetch("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, redirectTo: `${window.location.origin}/auth/callback` }),
      });
      if (res.ok) {
        localStorage.setItem("user_login_email", trimmed);
        setResendDone(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || "שליחה נכשלה, נסו שוב");
      }
    } catch {
      setErrorMsg("שגיאת רשת, נסו שוב");
    } finally {
      setResending(false);
    }
  }

  // ── Expired link — resend UI ──
  if (expired) {
    return (
      <div style={{ display: "flex", minHeight: "100dvh", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", padding: "0 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: 340, width: "100%", textAlign: "center" }}>
          {resendDone ? (
            <>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>שלחנו לינק חדש</h1>
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }} dir="rtl">
                בדקו את תיבת המייל ב-<strong>{resendEmail.trim()}</strong> ולחצו על הלינק החדש.
              </p>
              <button
                onClick={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }}
                style={{ marginTop: 16, fontSize: 13, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}
              >
                חזרה למסך ההתחברות
              </button>
            </>
          ) : (
            <>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }} dir="rtl">הקישור פג תוקף</h1>
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.6 }} dir="rtl">
                ייתכן שמערכת אבטחת המייל פתחה את הלינק לפניכם. זה קורה לפעמים.
              </p>
              <p style={{ fontSize: 14, color: "#6b7280", margin: "4px 0 0", lineHeight: 1.6 }} dir="rtl">
                הזינו את המייל ונשלח לכם לינק חדש:
              </p>
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => { setResendEmail(e.target.value); setErrorMsg(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleResend()}
                placeholder="הזינו אימייל"
                dir="rtl"
                autoFocus
                style={{
                  width: "100%", height: 48, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff",
                  padding: "0 16px", fontSize: 15, color: "#374151", outline: "none", boxSizing: "border-box", marginTop: 8,
                }}
              />
              <button
                onClick={handleResend}
                disabled={resending}
                style={{
                  width: "100%", height: 48, borderRadius: 12, background: "#111827", color: "#fff",
                  fontSize: 15, fontWeight: 500, border: "none", cursor: "pointer", opacity: resending ? 0.5 : 1, marginTop: 4,
                }}
              >
                {resending ? "שולח..." : "שליחה מחדש"}
              </button>
              {errorMsg && (
                <p style={{ fontSize: 13, color: "#ef4444", margin: "8px 0 0" }} dir="rtl">{errorMsg}</p>
              )}
              <button
                onClick={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }}
                style={{ marginTop: 12, fontSize: 13, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}
              >
                חזרה למסך ההתחברות
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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
