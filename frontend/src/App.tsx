import { useState } from "react";
import Register from "./Register";
import Dashboard from "./Dashboard";
import ProfileEdit from "./ProfileEdit";
import Chat from "./Chat";
import PsychologistChat from "./PsychologistChat";
import Result from "./Result";
import AdminView from "./AdminView";

type View = "register" | "dashboard" | "profile_edit" | "chat" | "psychologist_chat" | "result" | "done" | "admin";

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
  adminLink: {
    fontSize: 13,
    color: "#888",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    textDecoration: "underline",
  },
  readyContainer: { textAlign: "center" as const, padding: "40px 0" },
};

export default function App() {
  const [view, setView] = useState<View>("register");
  const [user, setUser] = useState<User | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [chatSessionKey, setChatSessionKey] = useState(0);

  // Dashboard uses a dark theme — hide the default light header
  const showHeader = view !== "dashboard";

  return (
    <div style={view === "admin" ? { ...styles.app, maxWidth: "100%" } : view === "dashboard" ? { ...styles.app, padding: "20px" } : styles.app}>
      {showHeader && (
        <div style={styles.header}>
          <h1
            style={{ ...styles.title, cursor: "pointer" }}
            onClick={() => { if (user) setView("dashboard"); else { setView("register"); setUser(null); setAnalysis(null); } }}
          >
            MatchMe
          </h1>
          <button style={styles.adminLink} onClick={() => setView("admin")}>
            Admin
          </button>
        </div>
      )}

      {/* Step 1: Registration form */}
      {view === "register" && (
        <Register
          onSuccess={(u) => {
            setUser(u);
            setView("dashboard");
          }}
        />
      )}

      {/* Step 2: Dashboard */}
      {view === "dashboard" && user && (
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
            // partner_compass is locked — no action
          }}
        />
      )}

      {/* Profile edit */}
      {view === "profile_edit" && user && (
        <ProfileEdit
          user={user}
          onBack={() => setView("dashboard")}
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
            setUser(null);
            setAnalysis(null);
            setView("register");
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
        </div>
      )}

      {/* Admin view */}
      {view === "admin" && (
        <AdminView
          onBack={() => user ? setView("dashboard") : setView("register")}
          onStartChat={(u) => {
            setUser({ id: u.id, first_name: u.first_name, email: u.email } as User);
            setChatSessionKey(k => k + 1);
            setView("chat");
          }}
          onViewDashboard={(u) => {
            setUser({ id: u.id, first_name: u.first_name, email: u.email } as User);
            setView("dashboard");
          }}
        />
      )}
    </div>
  );
}
