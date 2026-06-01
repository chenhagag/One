import { useState, useEffect, useCallback } from "react";
import Register from "./Register";
import ProfileEdit from "./ProfileEdit";
import Result from "./Result";
import AdminView from "./AdminView";
import NewChat from "./NewChat";
import Insights from "./Insights";
import PWAInstallFlow from "./PWAInstallFlow";
import AuthScreen from "./AuthScreen";
import AuthCallback from "./AuthCallback";
import ProfileSetup from "./ProfileSetup";
import ConsentScreen from "./ConsentScreen";
import { supabase } from "./lib/supabase";
import { saveSupabaseTokens, clearSupabaseTokens } from "./lib/api";

type View =
  | "landing"
  | "register"
  | "welcome"
  | "profile_edit"
  | "result"
  | "done"
  | "admin"
  | "new_chat"
  | "insights"
  | "pwa_install"
  | "auth"
  | "auth_callback"
  | "profile_setup"
  | "consent";

// Full user type matching the expanded DB schema
export interface User {
  id: number;
  first_name: string;
  email: string;
  age?: number;
  gender?: string;
  looking_for_gender?: string;
  city?: string;
  height?: number;
  self_style?: string[];
  desired_age_min?: number;
  desired_age_max?: number;
  age_flexibility?: string;
  desired_height_min?: number;
  desired_height_max?: number;
  height_flexibility?: string;
  desired_location_range?: string;
  test_user_type?: string;
}

// Simplified user type for Chat/Result (legacy components use .name)
export interface ChatUser {
  id: number;
  name: string;
  email: string;
}

// Analysis result from the new trait-based analysis agent
export interface AnalysisResult {
  saved: { internal_saved: number; external_saved: number };
  analysis: {
    internal_traits: { internal_name: string; score: number; confidence: number; weight_for_match?: number | null }[];
    external_traits: { internal_name: string; personal_value?: string | null; desired_value?: string | null }[];
    profiling_completeness: { internal_assessed: number; internal_total: number; external_assessed: number; external_total: number; coverage_pct: number; ready_for_matching: boolean };
    recommended_probes: string[];
  };
}

// ── Secret admin path ───────────────────────────────────────────
const ADMIN_SECRET_PATH = "admin-secure-access-2026-chen";
const ADMIN_EMAIL = "chen.hagag@gmail.com";

// ── localStorage helpers ────────────────────────────────────────
function saveSession(user: User) {
  localStorage.setItem("matchme_user_id", String(user.id));
  localStorage.setItem("matchme_user_email", user.email);
}

function clearSession() {
  localStorage.removeItem("matchme_user_id");
  localStorage.removeItem("matchme_user_email");
}

function getSavedSession(): { id: number; email: string } | null {
  const id = localStorage.getItem("matchme_user_id");
  const email = localStorage.getItem("matchme_user_email");
  if (id && email) return { id: parseInt(id, 10), email };
  return null;
}

// ── Styles ──────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  app: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: 600,
    margin: "0 auto",
    padding: "40px 20px",
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
    borderBottom: "1px solid #e5e5e5",
    paddingBottom: 16,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 600 },
  logoutBtn: {
    fontSize: 12,
    color: "#888",
    cursor: "pointer",
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 4,
    padding: "4px 10px",
  },
  readyContainer: { textAlign: "center" as const, padding: "40px 0" },
  landingContainer: {
    textAlign: "center" as const,
    padding: "80px 20px",
  },
  landingTitle: {
    fontSize: 42,
    fontWeight: "bold" as const,
    color: "#6C63FF",
    marginBottom: 8,
  },
  landingSubtitle: {
    fontSize: 18,
    color: "#666",
    marginBottom: 48,
  },
  landingBtnRow: {
    display: "flex",
    gap: 16,
    justifyContent: "center",
  },
  landingBtn: {
    padding: "14px 36px",
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 30,
    cursor: "pointer",
    border: "none",
  },
};

// ── App ─────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [user, setUser] = useState<User | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [autoLoginDone, setAutoLoginDone] = useState(false);

  // ── Auto-login on mount: Supabase session + legacy fallback ────
  useEffect(() => {
    // Check for secret admin path in URL hash — defer to after auth check
    const isAdminRequest = window.location.hash === `#${ADMIN_SECRET_PATH}`;
    if (isAdminRequest && window.location.hostname === "localhost") {
      setView("admin");
      setAutoLoginDone(true);
      return;
    }

    // Check for OAuth callback (Supabase puts tokens in URL hash)
    if (window.location.pathname === "/auth/callback" || window.location.hash.includes("access_token") || window.location.search.includes("code=")) {
      setView("auth_callback");
      setAutoLoginDone(true);
      return;
    }

    // Try Supabase session first (only if configured), with timeout
    const initAuth = async () => {
      if (supabase) {
        try {
          const sessionResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          const session = sessionResult && "data" in sessionResult ? sessionResult.data.session : null;
          if (session) {
            // Persist tokens in our own storage (Safari ITP resilience)
            saveSupabaseTokens(session.access_token, session.refresh_token);
            try {
              const res = await fetch("/auth/sync", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
              });
              if (res.ok) {
                const data = await res.json();
                setUser(data);
                saveSession(data);
                if (isAdminRequest && data.email === ADMIN_EMAIL) {
                  setView("admin");
                } else if (data.profile_complete === false) {
                  setView("profile_setup");
                } else if (!data.consent_accepted) {
                  setView("consent");
                } else {
                  setView("new_chat");
                }
                setAutoLoginDone(true);
                return;
              }
            } catch {
              // Fall through to legacy check
            }
          }
        } catch {
          // Supabase blocked or failed — fall through
        }
      }

      // Fallback: legacy localStorage session
      const saved = getSavedSession();
      if (saved) {
        try {
          const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: saved.email }),
          });
          const data = await res.json();
          if (data.id) {
            setUser(data);
            if (isAdminRequest && data.email === ADMIN_EMAIL) {
              setView("admin");
            } else {
              setView("new_chat");
            }
          }
        } catch {
          // Ignore — show landing
        }
      }

      setAutoLoginDone(true);
    };
    initAuth();

    // Listen for auth state changes (only if Supabase configured)
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") {
          clearSession();
          setUser(null);
          setView("auth");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Check if should show PWA install (mobile + not standalone)
  function shouldShowPWAInstall(): boolean {
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    return isMobile && !isStandalone;
  }

  // ── Successful registration ────────────────────────────────────
  function handleRegisterSuccess(u: User) {
    saveSession(u);
    setUser(u);
    setView("welcome"); // Show onboarding — only after fresh registration
  }

  // ── Logout ─────────────────────────────────────────────────────
  function handleLogout() {
    supabase?.auth.signOut().catch(() => {});
    clearSession();
    clearSupabaseTokens();
    setUser(null);
    setAnalysis(null);
    setView("auth");
  }

  // ── OAuth callback handlers ───────────────────────────────────
  const handleAuthSuccess = useCallback((u: User, profileComplete: boolean) => {
    // Clean URL so refresh doesn't re-trigger auth callback
    window.history.replaceState({}, "", "/");
    console.log("[auth] success, user:", JSON.stringify(u));
    saveSession(u);
    setUser(u);
    if (!profileComplete) {
      setView("profile_setup");
    } else if (!u.consent_accepted) {
      setView("consent");
    } else if (shouldShowPWAInstall()) {
      setView("pwa_install");
    } else {
      setView("new_chat");
    }
  }, []);

  const handleAuthError = useCallback((message: string) => {
    console.error("[auth callback]", message);
    window.history.replaceState({}, "", "/");
    setView("auth");
  }, []);

  // ── Profile setup complete ────────────────────────────────────
  function handleProfileSetupComplete(u: User) {
    saveSession(u);
    setUser(u);
    setView("consent");
  }

  function handleConsentComplete(u: User) {
    saveSession(u);
    setUser(u);
    setView(shouldShowPWAInstall() ? "pwa_install" : "new_chat");
  }

  // ── Don't render until auto-login check completes ──────────────
  if (!autoLoginDone) {
    return (
      <div style={{ ...styles.app, textAlign: "center", paddingTop: 100 }}>
        <p style={{ color: "#aaa" }}>Loading...</p>
      </div>
    );
  }

  // Hide header in full-screen views
  const showHeader = view !== "landing" && view !== "admin" && view !== "welcome" && view !== "new_chat" && view !== "insights" && view !== "auth" && view !== "auth_callback" && view !== "profile_setup";

  return (
    <div style={view === "admin" ? { ...styles.app, maxWidth: "100%" } : view === "new_chat" ? { ...styles.app, maxWidth: "100%", padding: 0 } : styles.app}>
      {showHeader && (
        <div style={styles.header}>
          <h1
            style={{ ...styles.title, cursor: "pointer" }}
            onClick={() => { if (user) setView("new_chat"); }}
          >
            One
          </h1>
          {user && (
            <button style={styles.logoutBtn} onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      )}

      {/* Auth screen — OAuth buttons (new default landing) */}
      {(view === "landing" || view === "auth") && (
        <AuthScreen />
      )}

      {/* OAuth callback — handles redirect from Google/Apple */}
      {view === "auth_callback" && (
        <AuthCallback onSuccess={handleAuthSuccess} onError={handleAuthError} />
      )}

      {/* Profile setup — after first OAuth sign-in */}
      {view === "profile_setup" && user && (
        <ProfileSetup user={user} onComplete={handleProfileSetupComplete} />
      )}

      {/* Consent — after profile setup, before entering app */}
      {view === "consent" && user && (
        <ConsentScreen user={user} onComplete={handleConsentComplete} />
      )}

      {/* Registration form (legacy fallback) */}
      {view === "register" && (
        <Register onSuccess={handleRegisterSuccess} />
      )}

      {/* Welcome / PWA Install — after fresh registration */}
      {view === "welcome" && user && (
        <PWAInstallFlow
          userName={user.first_name}
          gender={user.gender}
          testUserType={(user as any).test_user_type}
          onComplete={() => setView("new_chat")}
        />
      )}

      {/* PWA Install — after login on mobile */}
      {view === "pwa_install" && user && (
        <PWAInstallFlow
          userName={user.first_name}
          gender={user.gender}
          testUserType={(user as any).test_user_type}
          onComplete={() => setView("new_chat")}
        />
      )}

      {/* Result display */}
      {view === "result" && user && analysis && (
        <Result
          user={{ id: user.id, name: user.first_name, email: user.email }}
          analysis={analysis}
          onReset={() => {
            handleLogout();
          }}
        />
      )}

      {/* Conversation complete — waiting for match */}
      {view === "done" && user && (
        <div style={styles.readyContainer}>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>!{user.first_name} ,תודה</h2>
          <p style={{ color: "#666", marginBottom: 8, fontSize: 16 }}>
            אנחנו מתחילים לחפש עבורך את ההתאמה המושלמת
          </p>
          <p style={{ color: "#999", fontSize: 14 }}>
            נעדכן אותך ברגע שנמצא מישהו מתאים
          </p>
          <button
            style={{ ...styles.logoutBtn, marginTop: 24 }}
            onClick={() => setView("new_chat")}
          >
            חזרה לדשבורד
          </button>
        </div>
      )}

      {/* Admin view — only accessible via secret hash URL */}
      {view === "admin" && (
        <AdminView
          onBack={() => {
            window.location.hash = "";
            user ? setView("new_chat") : setView("landing");
          }}
          onStartChat={(u) => {
            setUser({ id: u.id, first_name: u.first_name, email: u.email } as User);
            saveSession({ id: u.id, first_name: u.first_name, email: u.email } as User);
            setChatSessionKey(k => k + 1);
            setView("chat");
          }}
          onViewDashboard={(u) => {
            setUser({ id: u.id, first_name: u.first_name, email: u.email } as User);
            saveSession({ id: u.id, first_name: u.first_name, email: u.email } as User);
            setView("new_chat");
          }}
          onViewNewChat={(u) => {
            setUser({ id: u.id, first_name: u.first_name, email: u.email } as User);
            saveSession({ id: u.id, first_name: u.first_name, email: u.email } as User);
            setView("new_chat");
          }}
        />
      )}

      {view === "new_chat" && user && (
        <NewChat
          user={user}
          onBack={() => setView("admin")}
          onNavigate={(v) => setView(v as View)}
          onUserUpdate={(u) => setUser(u)}
          onLogout={handleLogout}
        />
      )}

      {/* Insights is now rendered inside NewChat via onNavigate */}
    </div>
  );
}
