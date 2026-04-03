import { useState } from "react";
import Register from "./Register";
import Chat from "./Chat";
import Result from "./Result";
import AdminView from "./AdminView";

type View = "register" | "ready_for_chat" | "chat" | "result" | "admin";

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
  // "Start Chat" screen after registration
  readyContainer: { textAlign: "center" as const, padding: "40px 0" },
  readyHeading: { fontSize: 24, marginBottom: 12 },
  readySub: { color: "#666", marginBottom: 32 },
  startChatBtn: {
    padding: "14px 40px",
    fontSize: 16,
    fontWeight: 600,
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
};

export default function App() {
  const [view, setView] = useState<View>("register");
  const [user, setUser] = useState<User | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  return (
    <div style={view === "admin" ? { ...styles.app, maxWidth: "100%" } : styles.app}>
      <div style={styles.header}>
        <h1
          style={{ ...styles.title, cursor: "pointer" }}
          onClick={() => { setView("register"); setUser(null); setAnalysis(null); }}
        >
          MatchMe
        </h1>
        <button style={styles.adminLink} onClick={() => setView("admin")}>
          Admin
        </button>
      </div>

      {/* Step 1: Registration form */}
      {view === "register" && (
        <Register
          onSuccess={(u) => {
            setUser(u);
            setView("ready_for_chat");
          }}
        />
      )}

      {/* Step 2: Registration complete → navigate to chat */}
      {view === "ready_for_chat" && user && (
        <div style={styles.readyContainer}>
          <h2 style={styles.readyHeading}>!{user.first_name} ,נרשמת בהצלחה</h2>
          <p style={styles.readySub}>
            עכשיו נכיר אותך קצת יותר לעומק בשיחה קצרה
          </p>
          <button
            style={styles.startChatBtn}
            onClick={() => setView("chat")}
          >
            התחל שיחה
          </button>
        </div>
      )}

      {/* Step 3: AI Chat (existing) */}
      {view === "chat" && user && (
        <Chat
          user={{ id: user.id, name: user.first_name, email: user.email }}
          onSuccess={(a) => {
            setAnalysis(a);
            setView("result");
          }}
        />
      )}

      {/* Step 4: Result display */}
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

      {/* Admin view */}
      {view === "admin" && (
        <AdminView onBack={() => setView("register")} />
      )}
    </div>
  );
}
