import { useState } from "react";
import { supabase } from "./lib/supabase";

interface AuthScreenProps {
  onEmailLogin: () => void;
}

export default function AuthScreen({ onEmailLogin }: AuthScreenProps) {
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = isIOS || (/^((?!chrome|android).)*safari/i.test(navigator.userAgent));

  async function handleOAuth(provider: "google" | "apple") {
    setLoading(provider);
    setError("");

    try {
      if (!supabase) { setError("OAuth not configured"); setLoading(null); return; }

      const redirectTo = `${window.location.origin}/auth/callback`;

      // skipBrowserRedirect: true — get the URL back instead of letting
      // Supabase redirect automatically. Safari ITP blocks the automatic
      // redirect because it involves Supabase's third-party domain.
      // We redirect manually with window.location.href which always works.
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
        // Manual redirect — works on all browsers including Safari
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

  // Safari/iOS: hide Google OAuth (Safari ITP blocks it), show only email
  // Other browsers: show Google (and Apple on iOS)
  const buttons: ("google" | "apple")[] = isSafari
    ? []
    : isIOS
      ? ["apple", "google"]
      : ["google"];

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6">
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
        <h1 className="mb-2 text-5xl font-bold tracking-tight text-gray-900">
          One
        </h1>
        <p className="text-base text-gray-400">Find your perfect match</p>
      </div>

      {/* OAuth buttons (hidden on Safari — ITP blocks Google OAuth) */}
      {buttons.length > 0 && (
        <>
          <div className="flex w-full max-w-xs flex-col gap-3">
            {buttons.map((provider) =>
              provider === "apple" ? (
                <button
                  key="apple"
                  onClick={() => handleOAuth("apple")}
                  disabled={!!loading}
                  className="flex h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-black text-[15px] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
                >
                  <AppleLogo />
                  Continue with Apple
                </button>
              ) : (
                <button
                  key="google"
                  onClick={() => handleOAuth("google")}
                  disabled={!!loading}
                  className="flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white text-[15px] font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
                >
                  <GoogleLogo />
                  Continue with Google
                </button>
              )
            )}
          </div>

          {/* Divider */}
          <div className="my-6 flex w-full max-w-xs items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
        </>
      )}

      {/* Email login — primary on Safari, secondary elsewhere */}
      <button
        onClick={onEmailLogin}
        className={buttons.length > 0
          ? "text-sm text-gray-400 transition-colors hover:text-gray-600"
          : "flex h-[52px] w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-gray-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
        }
      >
        Continue with email
      </button>

      {/* Error message */}
      {error && (
        <div className="mt-6 w-full max-w-xs rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600">
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
