import { useState, useEffect } from "react";
import Register from "./Register";
import Dashboard from "./Dashboard";
import ProfileEdit from "./ProfileEdit";
import Chat from "./Chat";
import PsychologistChat from "./PsychologistChat";
import Result from "./Result";
import AdminView from "./AdminView";

type View =
  | "landing"
  | "register"
  | "login"
  | "welcome"
  | "dashboard"
  | "profile_edit"
  | "chat"
  | "psychologist_chat"
  | "result"
  | "done"
  | "admin";

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
  loginForm: {
    maxWidth: 360,
    margin: "0 auto",
    textAlign: "right" as const,
  },
  loginInput: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 15,
    border: "1px solid #ddd",
    borderRadius: 8,
    boxSizing: "border-box" as const,
    marginBottom: 12,
    direction: "ltr" as const,
  },
};

// ── App ─────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [user, setUser] = useState<User | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [autoLoginDone, setAutoLoginDone] = useState(false);

  // Bug report state (must be before any early return — Rules of Hooks)
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugText, setBugText] = useState("");
  const [bugSent, setBugSent] = useState(false);

  // ── Auto-login on mount ────────────────────────────────────────
  useEffect(() => {
    // Check for secret admin path in URL hash
    if (window.location.hash === `#${ADMIN_SECRET_PATH}`) {
      setView("admin");
      setAutoLoginDone(true);
      return;
    }

    const saved = getSavedSession();
    if (!saved) {
      setAutoLoginDone(true);
      return;
    }

    // Try to restore session from saved email
    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: saved.email }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setUser(data);
          setView("dashboard");
        }
      })
      .catch(() => {})
      .finally(() => setAutoLoginDone(true));
  }, []);

  // ── Login handler ──────────────────────────────────────────────
  async function handleLogin() {
    if (!loginEmail.trim()) { setLoginError("Please enter your email"); return; }
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed");
        return;
      }
      saveSession(data);
      setUser(data);
      setView("dashboard");
    } catch {
      setLoginError("Could not reach the server");
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Successful registration ────────────────────────────────────
  function handleRegisterSuccess(u: User) {
    saveSession(u);
    setUser(u);
    setView("welcome"); // Show onboarding — only after fresh registration
  }

  // ── Logout ─────────────────────────────────────────────────────
  function handleLogout() {
    clearSession();
    setUser(null);
    setAnalysis(null);
    setView("landing");
  }

  // ── Don't render until auto-login check completes ──────────────
  if (!autoLoginDone) {
    return (
      <div style={{ ...styles.app, textAlign: "center", paddingTop: 100 }}>
        <p style={{ color: "#aaa" }}>Loading...</p>
      </div>
    );
  }

  async function handleBugSubmit() {
    if (!bugText.trim()) return;
    try {
      await fetch("/api/report-bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.id, report_text: bugText.trim() }),
      });
      setBugSent(true);
      setBugText("");
      setTimeout(() => { setBugSent(false); setShowBugReport(false); }, 2000);
    } catch {}
  }

  // Dashboard uses a dark theme — hide the default light header
  const showHeader = view !== "dashboard" && view !== "landing" && view !== "admin" && view !== "welcome";

  return (
    <div style={view === "admin" ? { ...styles.app, maxWidth: "100%" } : view === "dashboard" ? { ...styles.app, padding: "20px" } : styles.app}>
      {showHeader && (
        <div style={styles.header}>
          <h1
            style={{ ...styles.title, cursor: "pointer" }}
            onClick={() => { if (user) setView("dashboard"); }}
          >
            MatchMe
          </h1>
          {user && (
            <button style={styles.logoutBtn} onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      )}

      {/* Landing — choose Register or Login */}
      {view === "landing" && (
        <div style={styles.landingContainer}>
          <h1 style={styles.landingTitle}>MatchMe</h1>
          <p style={styles.landingSubtitle}>Find your perfect match</p>
          <div style={styles.landingBtnRow}>
            <button
              style={{ ...styles.landingBtn, background: "#6C63FF", color: "#fff" }}
              onClick={() => setView("register")}
            >
              Register
            </button>
            <button
              style={{ ...styles.landingBtn, background: "#fff", color: "#6C63FF", border: "2px solid #6C63FF" }}
              onClick={() => setView("login")}
            >
              Login
            </button>
          </div>
        </div>
      )}

      {/* Login form */}
      {view === "login" && (
        <div>
          <h2 style={{ textAlign: "center", marginBottom: 24 }}>Login</h2>
          <div style={styles.loginForm}>
            <input
              style={styles.loginInput}
              type="email"
              placeholder="Enter your email"
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              autoFocus
            />
            {loginError && <p style={{ color: "#E53935", fontSize: 13, marginBottom: 8 }}>{loginError}</p>}
            <button
              style={{ ...styles.landingBtn, background: "#6C63FF", color: "#fff", width: "100%" }}
              onClick={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? "..." : "Login"}
            </button>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#888" }}>
              Don't have an account?{" "}
              <span style={{ color: "#6C63FF", cursor: "pointer" }} onClick={() => { setView("register"); setLoginError(""); }}>
                Register
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Registration form */}
      {view === "register" && (
        <Register onSuccess={handleRegisterSuccess} />
      )}

      {/* Welcome / Onboarding — only after fresh registration */}
      {view === "welcome" && user && (
        <div dir="rtl" style={{ maxWidth: 520, margin: "0 auto", padding: "40px 20px" }}>
          <h2 style={{ fontSize: 26, marginBottom: 16, textAlign: "center" }}>
            {user.first_name}, !ברוך/ה הבא/ה ל-MatchMe
          </h2>
          <div style={{ background: "#f8f9fa", borderRadius: 12, padding: 24, marginBottom: 20, lineHeight: 1.8, fontSize: 15, color: "#333" }}>
            <p style={{ marginTop: 0 }}>
              <strong>MatchMe</strong> הוא מערכת שידוכים חכמה שמתאימה בין אנשים ברמה עמוקה — בלי החלקות, בלי שיפוטיות חיצונית.
            </p>
            <p>
              המערכת תכיר אותך דרך שתי שיחות קצרות: <strong>מעבדת אישיות</strong> (סימולציות ודילמות) ו<strong>שיחת עומק</strong> (שיחה חופשית עם פסיכולוג AI).
            </p>
            <p>
              כל מה שתספר/י נשאר חסוי לחלוטין ולא מופיע בפרופיל. ככל שתהיה יותר כנ/ה ופתוח/ה, כך ההתאמה תהיה מדויקת יותר.
            </p>
            <p style={{ color: "#888", fontSize: 13 }}>
              המערכת בשלבי בנייה ובדיקות — ייתכנו באגים קטנים. נשמח לשמוע אם נתקלת בבעיה.
            </p>
          </div>

          {user.test_user_type === "Couple Tester" && (
            <div style={{ background: "#fff3cd", borderRadius: 10, padding: 16, marginBottom: 20, fontSize: 14, lineHeight: 1.7, border: "1px solid #ffc107" }}>
              <strong>הערה לזוגות:</strong> המטרה היא לבדוק אם המערכת מצליחה לזהות את ההתאמה בין בני זוג קיימים.
              אנא ענה/י בכנות, כאילו את/ה רווק/ה ומחפש/ת — בדיוק כפי שהיית עונה אילו היית באמת מחפש/ת מישהו חדש.
            </div>
          )}

          <button
            style={{ width: "100%", padding: 16, fontSize: 17, fontWeight: 600, background: "#6C63FF", color: "#fff", border: "none", borderRadius: 30, cursor: "pointer" }}
            onClick={() => setView("dashboard")}
          >
            להמשיך לאפליקציה
          </button>
        </div>
      )}

      {/* Dashboard */}
      {view === "dashboard" && user && (
        <>
          {/* Top bar: logout + bug report */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "8px 16px 0" }}>
            <button
              style={{ ...styles.logoutBtn, background: showBugReport ? "#fff3cd" : undefined, borderColor: showBugReport ? "#ffc107" : undefined }}
              onClick={() => { setShowBugReport(!showBugReport); setBugSent(false); }}
            >
              {showBugReport ? "סגור" : "דווח על באג"}
            </button>
            <button style={styles.logoutBtn} onClick={handleLogout}>
              Logout
            </button>
          </div>

          {/* Bug report form (inline, above dashboard) */}
          {showBugReport && (
            <div dir="rtl" style={{ maxWidth: 420, margin: "12px auto", padding: 16, background: "#fffde7", borderRadius: 10, border: "1px solid #ffe082" }}>
              <textarea
                style={{ width: "100%", minHeight: 80, padding: 10, fontSize: 14, borderRadius: 8, border: "1px solid #ddd", resize: "vertical", boxSizing: "border-box", direction: "rtl" }}
                placeholder="תאר/י את הבאג שנתקלת בו..."
                value={bugText}
                onChange={e => setBugText(e.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  style={{ padding: "8px 20px", fontSize: 14, fontWeight: 600, background: bugSent ? "#28a745" : "#6C63FF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
                  onClick={handleBugSubmit}
                  disabled={bugSent}
                >
                  {bugSent ? "נשלח בהצלחה!" : "שלח דיווח"}
                </button>
              </div>
            </div>
          )}

          <Dashboard
            userId={user.id}
            userName={user.first_name}
            onNavigate={(key) => {
              if (key === "identity") {
                setView("profile_edit");
              } else if (key === "personality_lab") {
                setChatSessionKey(k => k + 1);
                setView("chat");
              } else if (key === "deep_chat") {
                setView("psychologist_chat");
              }
            }}
          />
        </>
      )}

      {/* Profile edit */}
      {view === "profile_edit" && user && (
        <ProfileEdit
          user={user}
          onBack={() => setView("dashboard")}
          onUserUpdate={(u) => setUser(u)}
        />
      )}

      {/* Psychologist Chat */}
      {view === "psychologist_chat" && user && (
        <PsychologistChat
          user={{ id: user.id, name: user.first_name, email: user.email }}
          onBack={() => setView("dashboard")}
        />
      )}

      {/* AI Chat (Interviewer) */}
      {view === "chat" && user && (
        <Chat
          key={`chat-${chatSessionKey}`}
          user={{ id: user.id, name: user.first_name, email: user.email }}
          onComplete={() => {
            fetch("/api/conversation/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: user.id }),
            }).catch(() => {});
            setView("done");
          }}
          onPause={() => {
            setView("dashboard");
          }}
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
            onClick={() => setView("dashboard")}
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
            user ? setView("dashboard") : setView("landing");
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
            setView("dashboard");
          }}
        />
      )}
    </div>
  );
}
