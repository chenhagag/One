import { useState, useRef } from "react";
import { supabase } from "./lib/supabase";
import { saveSupabaseTokens } from "./lib/api";
import { isNativeApp, getOAuthRedirectUrl, getApiBaseUrl } from "./lib/platform";
import { Browser } from "@capacitor/browser";
import PWAInstallFlow from "./PWAInstallFlow";
import type { User } from "./App";

interface AuthScreenProps {
  onOtpSuccess?: (user: User, profileComplete: boolean) => void;
}

export default function AuthScreen({ onOtpSuccess }: AuthScreenProps) {
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");
  // Detect native: Capacitor runs on https://localhost (not http)
  const isNative = isNativeApp() || (window.location.hostname === "localhost" && window.location.protocol === "https:");
  console.log("[AuthScreen] isNative:", isNative, "isNativeApp:", isNativeApp(), "hostname:", window.location.hostname, "protocol:", window.location.protocol, "href:", window.location.href);
  const [showLanding, setShowLanding] = useState(() => {
    if (isNative) return false;
    return !sessionStorage.getItem("one_seen_landing");
  });
  const [showPWAInstall, setShowPWAInstall] = useState(() => {
    if (isNative) return false;
    const seenLanding = sessionStorage.getItem("one_seen_landing");
    const seenPWA = sessionStorage.getItem("one_seen_pwa");
    const mob = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    return !!seenLanding && !seenPWA && mob && !standalone;
  });

  // Email + OTP state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isInAppBrowser = /FBAN|FBAV|Instagram|LinkedInApp|Line\//i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(provider);
    setError("");
    try {
      if (!supabase) { setError("OAuth not configured"); setLoading(null); return; }
      const redirectTo = getOAuthRedirectUrl();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError) { setError(`Sign-in failed: ${oauthError.message}`); setLoading(null); return; }
      if (data?.url) {
        if (isNativeApp()) {
          // Save PKCE code verifier before opening browser (Capacitor may lose it)
          const keys = Object.keys(localStorage);
          const verifierKey = keys.find(k => k.includes("code-verifier"));
          if (verifierKey) {
            localStorage.setItem("__cap_code_verifier_key", verifierKey);
            localStorage.setItem("__cap_code_verifier_val", localStorage.getItem(verifierKey) || "");
            console.log("[OAuth] Saved code verifier:", verifierKey);
          }
          await Browser.open({ url: data.url });
          setLoading(null);
        } else {
          window.location.href = data.url;
        }
      } else {
        setError("Could not get sign-in URL. Please try email login.");
        setLoading(null);
      }
    } catch (err: any) {
      setError(`Could not connect to auth service: ${err.message}`);
      setLoading(null);
    }
  }

  async function handleSendOtp() {
    const trimmed = email.trim();
    if (!trimmed) { setError("הזינו כתובת אימייל"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("כתובת האימייל לא תקינה"); return; }

    setOtpLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שליחת הקוד נכשלה");
        return;
      }
      setOtpSent(true);
      setOtpCode(["", "", "", "", "", ""]);
      // Focus first digit after render
      setTimeout(() => digitRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(`לא הצלחנו להתחבר לשירות: ${err.message}`);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) { setError("הזינו כתובת אימייל"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError("כתובת האימייל לא תקינה"); return; }

    setMagicLinkLoading(true);
    setError("");
    localStorage.setItem("user_login_email", trimmed);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, redirectTo: getOAuthRedirectUrl() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(`שליחת הלינק נכשלה: ${data.error || "Unknown error"}`); return; }
      setMagicLinkSent(true);
    } catch (err: any) {
      setError(`לא הצלחנו להתחבר לשירות: ${err.message}`);
    } finally {
      setMagicLinkLoading(false);
    }
  }

  async function handleVerifyOtp(codeArr: string[]) {
    const code = codeArr.join("");
    if (code.length !== 6) return;

    setVerifying(true);
    setError("");
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "invalid_code") {
          setError("הקוד שגוי או שפג תוקפו. נסו שוב.");
        } else {
          setError(data.error || "אימות נכשל");
        }
        setOtpCode(["", "", "", "", "", ""]);
        setTimeout(() => digitRefs.current[0]?.focus(), 100);
        return;
      }
      // Save Supabase tokens if returned (OTP now generates a real session)
      if (data.access_token) {
        saveSupabaseTokens(data.access_token, data.refresh_token);
        // Also set the session on the Supabase client for auto-refresh
        supabase?.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        }).catch(() => {});
      }
      // Success — pass user to App
      if (onOtpSuccess) {
        onOtpSuccess(data as User, data.profile_complete !== false);
      }
    } catch (err: any) {
      setError(`שגיאת רשת: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  }

  function handleDigitChange(index: number, value: string) {
    // Allow only digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...otpCode];
    newCode[index] = digit;
    setOtpCode(newCode);

    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits filled
    if (digit && index === 5 && newCode.every(d => d)) {
      handleVerifyOtp(newCode);
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;
    const newCode = [...otpCode];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setOtpCode(newCode);
    // Focus the next empty or last digit
    const nextIdx = Math.min(pasted.length, 5);
    digitRefs.current[nextIdx]?.focus();
    // Auto-submit if all 6
    if (pasted.length === 6) {
      handleVerifyOtp(newCode);
    }
  }

  // ── Landing page — before auth ──
  if (showLanding) {
    return (
      <div style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.35)), url(/background.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        padding: "32px 28px",
      }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          maxWidth: 480, width: "100%", direction: "rtl",
        }}>
          <img src="/nameLogoTrans.png" alt="One" style={{ height: 36, objectFit: "contain", marginBottom: 12 }} />
          <p style={{ fontSize: 15, color: "#555", textAlign: "center", margin: "0 0 32px" }}>Meet, as you are.</p>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 20px", textAlign: "center" }}>
            ברוכים הבאים ל-One
          </h2>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 14px", textAlign: "right", width: "100%" }}>
            איך זה עובד?
          </p>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {[
              { num: "1", text: "מנהלים שיחה: משוחחים עם ה-AI שלנו - מי אתם, מה חשוב לכם בקשר, מה אתם מחפשים." },
              { num: "2", text: "מקבלים תובנות: בסיום השיחה, תקבלו מפת אישיות מעמיקה הרלוונטית למערכות יחסים (סגנון היקשרות, טיפוס MBTI, אניאגרם ועוד)." },
              { num: "3", text: "נכנסים למאגר: אנחנו בונים את הניתוח שלכם ומדייקים את מה שאנחנו מחפשים עבורכם, על בסיס תיאוריות פסיכולוגיות מוכחות ונתונים של זוגות אמיתיים." },
              { num: "4", text: "ממתינים להתאמה: אנחנו לא מתפשרים על התאמות בינוניות, זה עשוי לקחת קצת זמן, אבל אנחנו מחפשים איכות, לא כמות." },
              { num: "5", text: "מוודאים משיכה: ברגע שתעלה התאמה פוטנציאלית, נשלח לכם תמונה שלהם לאישור, כדי לוודא שיש גם חיבור ויזואלי ומשיכה." },
              { num: "6", text: "מתחילים להכיר: לאחר שקלול סופי של כל הנתונים, תקבלו את ההתאמה המדויקת ביותר עבורכם – פנימית וחיצונית – ותוכלו לצאת לדרך." },
            ].map(step => (
              <div key={step.num} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{
                  width: 24, height: 24, borderRadius: "50%", background: "#8b7ba8", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>{step.num}</span>
                <p style={{ fontSize: 13, color: "#2a2a3e", lineHeight: 1.6, margin: 0 }}>{step.text}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 14, color: "#2a2a3e", textAlign: "center", margin: "0 0 24px", lineHeight: 1.6 }}>
            בהצלחה,<br />צוות One
          </p>
          <button
            onClick={() => {
              sessionStorage.setItem("one_seen_landing", "1");
              setShowLanding(false);
              if (!isNative && isMobile && !isStandalone) setShowPWAInstall(true);
            }}
            style={{
              width: "100%", maxWidth: 320, padding: "14px 24px", fontSize: 16, fontWeight: 600,
              background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 14,
              cursor: "pointer", fontFamily: "inherit", marginBottom: 8,
            }}
          >
            המשך לאפליקציה
          </button>
        </div>
      </div>
    );
  }

  // ── PWA install screen ──
  if (showPWAInstall) {
    return <PWAInstallFlow userName="" gender="" testUserType={null} onComplete={() => { sessionStorage.setItem("one_seen_pwa", "1"); setShowPWAInstall(false); }} />;
  }

  // ── Magic link sent screen (regular browser) ──
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

  // ── OTP code entry screen ──
  if (otpSent) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6 pt-[env(safe-area-inset-top,0px)]">
        <div className="mb-8 text-center">
          <img src="/nameLogoTrans.png" alt="One" style={{ height: 28, objectFit: "contain", margin: "0 auto 16px" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>הזינו את הקוד</h1>
          <p style={{ fontSize: 14, color: "#888", margin: 0 }} dir="rtl">
            שלחנו קוד בן 6 ספרות ל-<span style={{ fontWeight: 600, color: "#555" }}>{email.trim()}</span>
          </p>
        </div>

        {/* 6-digit code input */}
        <div style={{ display: "flex", gap: 8, direction: "ltr", marginBottom: 16 }} onPaste={handlePaste}>
          {otpCode.map((digit, i) => (
            <input
              key={i}
              ref={el => { digitRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleDigitChange(i, e.target.value)}
              onKeyDown={e => handleDigitKeyDown(i, e)}
              disabled={verifying}
              style={{
                width: 44, height: 52, textAlign: "center", fontSize: 22, fontWeight: 700,
                border: `2px solid ${digit ? "#1a1a2e" : "#d1d5db"}`,
                borderRadius: 10, outline: "none", color: "#1a1a2e",
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#8b7ba8"}
              onBlur={e => e.target.style.borderColor = digit ? "#1a1a2e" : "#d1d5db"}
            />
          ))}
        </div>

        {verifying && (
          <div style={{ marginBottom: 12 }}>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-800" style={{ margin: "0 auto" }} />
          </div>
        )}

        {error && (
          <div className="mb-4 w-full max-w-xs rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600" dir="rtl">
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8 }}>
          <button
            onClick={() => { setOtpSent(false); setOtpCode(["", "", "", "", "", ""]); setError(""); }}
            className="text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            שינוי אימייל
          </button>
          <button
            onClick={() => { setError(""); handleSendOtp(); }}
            disabled={otpLoading}
            className="text-sm text-gray-400 transition-colors hover:text-gray-600"
            style={{ fontWeight: 500 }}
          >
            {otpLoading ? "שולח..." : "שליחה מחדש"}
          </button>
        </div>
      </div>
    );
  }

  // ── Email form screen ──
  if (showEmailForm) {
    const emailAction = handleSendOtp;
    const emailLoading = otpLoading;
    const emailButtonText = "שלחו לי קוד כניסה";

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6 pt-[env(safe-area-inset-top,0px)]">
        <div className="mb-10 text-center">
          <img src="/nameLogoTrans.png" alt="One" style={{ height: 28, objectFit: "contain", margin: "0 auto 8px" }} />
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-base text-gray-400" style={{ margin: 0 }}>Meet, as you are.</p>
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && emailAction()}
            placeholder="הזינו אימייל"
            dir="rtl"
            autoFocus
            className="h-[52px] w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
            disabled={emailLoading}
          />
          <button
            onClick={emailAction}
            disabled={emailLoading}
            className="flex h-[52px] w-full items-center justify-center rounded-xl bg-gray-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
          >
            {emailLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              emailButtonText
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
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}>
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

      <div className="mb-16 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <img src="/nameLogoTrans.png" alt="One" style={{ height: 32, objectFit: "contain" }} />
        </div>
        <p className="text-base text-gray-400">Meet, as you are.</p>
      </div>

      {isInAppBrowser ? (
        <>
          {/* In-app browser: OTP email is primary */}
          <div className="flex w-full max-w-xs flex-col gap-3">
            <button
              onClick={() => setShowEmailForm(true)}
              className="flex h-[52px] w-full items-center justify-center rounded-xl bg-gray-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
            >
              כניסה עם אימייל
            </button>
          </div>

          <div className="my-6 flex w-full max-w-xs items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <button
            onClick={() => handleOAuth("google")}
            disabled={!!loading}
            className="text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            Continue with Google
          </button>
        </>
      ) : (
        <>
          {/* Regular browser: Google is primary */}
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
        </>
      )}

      {error && (
        <div className="mt-6 w-full max-w-xs rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600" dir="rtl">
          {error}
        </div>
      )}

      <p className="mt-auto pt-12 text-center text-xs text-gray-300">
        By continuing, you agree to our Terms of Service
        <br />
        and Privacy Policy.
      </p>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
