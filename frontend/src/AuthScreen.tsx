import { useState } from "react";
import { supabase } from "./lib/supabase";

export default function AuthScreen() {
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");
  const [showLanding, setShowLanding] = useState(true);

  // Magic link state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = isIOS || (/^((?!chrome|android).)*safari/i.test(navigator.userAgent));

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(provider);
    setError("");

    try {
      if (!supabase) { setError("OAuth not configured"); setLoading(null); return; }

      const redirectTo = `${window.location.origin}/auth/callback`;

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) {
        setError(`Sign-in failed: ${oauthError.message}`);
        setLoading(null);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        setError("Could not get sign-in URL. Please try email login.");
        setLoading(null);
      }
    } catch (err: any) {
      setError(`Could not connect to auth service: ${err.message}`);
      setLoading(null);
    }
  }

  async function handleMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("הזינו כתובת אימייל");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("כתובת האימייל לא תקינה");
      return;
    }

    if (!supabase) {
      setError("Authentication service is not configured");
      return;
    }

    setMagicLinkLoading(true);
    setError("");

    // Save email for resend on expired link
    localStorage.setItem("user_login_email", trimmed);

    try {
      // Send magic link via our backend (bypasses Safari ITP blocking Supabase)
      const res = await fetch("/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, redirectTo: `${window.location.origin}/auth/callback` }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(`שליחת הלינק נכשלה: ${data.error || "Unknown error"}`);
        return;
      }

      setMagicLinkSent(true);
    } catch (err: any) {
      setError(`לא הצלחנו להתחבר לשירות: ${err.message}`);
    } finally {
      setMagicLinkLoading(false);
    }
  }

  // ── Landing page — before auth ──
  if (showLanding) {
    return (
      <div style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(to bottom, #e8e4e0 0%, #f2efec 30%, #fff 60%)",
      }}>
        {/* Cover image — fades softly into warm gray */}
        <div style={{
          width: "100%",
          height: 260,
          backgroundImage: "url(/coverMainScreen.png)",
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
          position: "relative",
          flexShrink: 0,
        }}>
          {/* Bottom fade — into warm gray that continues below */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 120,
            background: "linear-gradient(to bottom, transparent 0%, rgba(232,228,224,0.6) 50%, #e8e4e0 100%)",
          }} />
          {/* Side fades */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 60,
            background: "linear-gradient(to right, rgba(232,228,224,0.4), transparent)",
          }} />
          <div style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 60,
            background: "linear-gradient(to left, rgba(232,228,224,0.4), transparent)",
          }} />
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: "0 28px 32px",
          marginTop: -24,
          direction: "rtl",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: 480,
          margin: "-24px auto 0",
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}>
          {/* Logo */}
          <img src="/logoOneGraishSmall.png" alt="One" style={{ height: 32, objectFit: "contain", marginTop: 16, marginBottom: 20 }} />

          {/* Welcome text */}
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 20px", textAlign: "center" }}>
            ברוכים הבאים ל-One
          </h2>

          <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 14px", textAlign: "right", width: "100%" }}>
            איך זה עובד?
          </p>

          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {[
              { num: "1", text: "מנהלים שיחה — משוחחים עם ה-AI שלנו: מי אתם, מה חשוב לכם בקשר, מה אתם מחפשים." },
              { num: "2", text: "מקבלים תובנות — בסיום השיחה, תקבלו מפת אישיות מעמיקה הרלוונטית למערכות יחסים." },
              { num: "3", text: "נכנסים למאגר — אנחנו בונים את הפרופיל שלכם ומדייקים על בסיס תיאוריות פסיכולוגיות מוכחות." },
              { num: "4", text: "ממתינים להתאמה — אנחנו לא מתפשרים על התאמות בינוניות. אנחנו מחפשים איכות, לא כמות." },
              { num: "5", text: "מוודאים משיכה — ברגע שתעלה התאמה, נשלח לכם תמונה לאישור כדי לוודא גם חיבור ויזואלי." },
              { num: "6", text: "מתחילים להכיר — תקבלו את ההתאמה המדויקת ביותר עבורכם ותוכלו לצאת לדרך." },
            ].map(step => (
              <div key={step.num} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{
                  width: 24, height: 24, borderRadius: "50%", background: "#8b7ba8", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>
                  {step.num}
                </span>
                <p style={{ fontSize: 13, color: "#444", lineHeight: 1.6, margin: 0 }}>{step.text}</p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 14, color: "#555", textAlign: "center", margin: "0 0 24px", lineHeight: 1.6 }}>
            בהצלחה,<br />צוות One
          </p>

          {/* CTA button */}
          <button
            onClick={() => setShowLanding(false)}
            style={{
              width: "100%",
              maxWidth: 320,
              padding: "14px 24px",
              fontSize: 16,
              fontWeight: 600,
              background: "#1a1a2e",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              marginBottom: 8,
            }}
          >
            המשך לאפליקציה
          </button>
        </div>
      </div>
    );
  }

  // ── Magic link sent — success screen ──
  if (magicLinkSent) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6 pt-[env(safe-area-inset-top,0px)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">שלחנו לך לינק להתחברות</h1>
          <p className="text-base text-gray-500" dir="rtl">
            בדקו את תיבת המייל שלכם ב-<span className="font-medium text-gray-700">{email.trim()}</span> ולחצו על הלינק כדי להיכנס.
          </p>
          <p className="mt-3 text-sm text-gray-400" dir="rtl">
            לא קיבלתם? בדקו בספאם או נסו שוב.
          </p>
        </div>

        <button
          onClick={() => { setMagicLinkSent(false); setError(""); }}
          className="mt-4 text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          חזרה למסך ההתחברות
        </button>
      </div>
    );
  }

  // ── Email form screen (after clicking "Login / Register") ──
  if (showEmailForm) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6 pt-[env(safe-area-inset-top,0px)]">
        <div className="mb-10 text-center">
          <img src="/logoOneSmall.png" alt="One" style={{ height: 28, objectFit: "contain", margin: "0 auto 8px" }} />
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-base text-gray-400" style={{ margin: 0 }}>Understand yourself. Find your One</p>
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
            placeholder="הזינו אימייל"
            dir="rtl"
            autoFocus
            className="h-[52px] w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
            disabled={magicLinkLoading}
          />
          <button
            onClick={handleMagicLink}
            disabled={magicLinkLoading}
            className="flex h-[52px] w-full items-center justify-center rounded-xl bg-gray-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
          >
            {magicLinkLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              "שלחו לי לינק להתחברות"
            )}
          </button>
        </div>

        {error && (
          <div className="mt-6 w-full max-w-xs rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600" dir="rtl">
            {error}
          </div>
        )}

        <button
          onClick={() => { setShowEmailForm(false); setError(""); }}
          className="mt-6 text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          חזרה
        </button>

        <p className="mt-auto pt-12 text-center text-xs text-gray-300">
          By continuing, you agree to our Terms of Service
          <br />
          and Privacy Policy.
        </p>
      </div>
    );
  }

  // ── Main auth screen (Google + email) ──
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6 pt-[env(safe-area-inset-top,0px)]">
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200 border-t-gray-800" />
            <p className="text-sm text-gray-500">
              {loading === "google" ? "Connecting to Google..." : "Connecting to Apple..."}
            </p>
          </div>
        </div>
      )}

      {/* Logo + tagline */}
      <div className="mb-16 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <img src="/logoOneSmall.png" alt="One" style={{ height: 32, objectFit: "contain" }} />
        </div>
        <p className="text-base text-gray-400">Understand yourself. Find your One</p>
      </div>

      {/* Google OAuth + email fallback — shown to all browsers */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={() => handleOAuth("google")}
          disabled={!!loading}
          className="flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white text-[15px] font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
        >
          <GoogleLogo />
          Continue with Google
        </button>
      </div>

      <div className="my-6 flex w-full max-w-xs items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        onClick={() => setShowEmailForm(true)}
        className="text-sm text-gray-400 transition-colors hover:text-gray-600"
      >
        Login / Register with email
      </button>

      {/* Error message */}
      {error && (
        <div className="mt-6 w-full max-w-xs rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600" dir="rtl">
          {error}
        </div>
      )}

      {/* Footer */}
      <p className="mt-auto pt-12 text-center text-xs text-gray-300">
        By continuing, you agree to our Terms of Service
        <br />
        and Privacy Policy.
      </p>
    </div>
  );
}

// ── Brand logos (inline SVG for zero-dependency) ────────────────

function AppleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M14.94 13.38c-.36.83-.53 1.2-.99 1.93-.64.99-1.54 2.23-2.66 2.24-1 .01-1.25-.65-2.6-.64-1.35.01-1.63.66-2.63.65-1.12-.01-1.97-1.12-2.61-2.12C1.78 12.58 1.6 9.47 2.72 7.82c.8-1.17 2.04-1.86 3.2-1.86 1.19 0 1.94.66 2.93.66.95 0 1.53-.66 2.91-.66 1.03 0 2.12.56 2.91 1.53-2.56 1.4-2.14 5.05.27 6.89zM11.37 4.2c.5-.64.88-1.54.74-2.46-.81.06-1.76.57-2.31 1.24-.5.6-.92 1.52-.76 2.4.89.03 1.81-.5 2.33-1.18z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
