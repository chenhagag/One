import { useState, useRef, useEffect } from "react";
import ProfileEdit from "./ProfileEdit";
import Insights from "./Insights";
import type { User } from "./App";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface NewChatProps {
  user: User;
  onBack: () => void;
  onNavigate?: (view: string) => void;
  onUserUpdate?: (u: User) => void;
}

const TOPIC_OPTIONS = [
  { icon: "🧠", text: "בוא נבין את סגנון החשיבה שלי", channel: "new_chat_cognitive" },
  { icon: "🔍", text: "נתח את הטעם שלי לעומק", channel: "new_chat_taste" },
  { icon: "🎯", text: "איך אתה מוצא לי התאמה מדויקת?" },
  { icon: "❓", text: "יש לי שאלה לגבי התהליך" },
  { icon: "📋", text: "מה למדת עליי עד עכשיו?" },
];

const SIDEBAR_ITEMS: { icon: string; label: string; action?: string }[] = [
  { icon: "📋", label: "הפרטים שלי", action: "profile_edit" },
  { icon: "👤", label: "פרופיל" },
  { icon: "💡", label: "תובנות על עצמי", action: "insights" },
  { icon: "🎯", label: "בדיקת טעם אישי", action: "taste_test" },
  { icon: "🐛", label: "דווח על באג", action: "bug_report" },
  { icon: "⚙️", label: "הגדרות", action: "settings" },
];

export default function NewChat({ user, onBack, onNavigate, onUserUpdate }: NewChatProps) {
  const [channelMessages, setChannelMessages] = useState<Record<string, Message[]>>({
    new_chat: [],
    new_chat_cognitive: [],
    new_chat_taste: [],
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [channel, setChannel] = useState<string>("new_chat");
  const [screen, setScreen] = useState<"home" | "chat" | "profile_edit" | "insights" | "bug_report" | "settings">("home");
  const [bugText, setBugText] = useState("");
  const [bugSent, setBugSent] = useState(false);
  const [recommendations, setRecommendations] = useState<{ has_cognitive: boolean; has_taste_info: boolean; chat_count: number; summary_fields: number }>({ has_cognitive: true, has_taste_info: true, chat_count: 0, summary_fields: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Current channel's messages
  const messages = channelMessages[channel] || [];

  // Helper to update a specific channel's messages
  function setMessagesForChannel(ch: string, updater: (prev: Message[]) => Message[]) {
    setChannelMessages(prev => ({ ...prev, [ch]: updater(prev[ch] || []) }));
  }

  // Any channel has messages (for sidebar visibility)
  const hasAnyMessages = Object.values(channelMessages).some(arr => arr.length > 0);

  // Load recommendations status
  useEffect(() => {
    fetch(`/api/new-chat/status/${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.has_cognitive !== undefined) {
          setRecommendations({
            has_cognitive: data.has_cognitive,
            has_taste_info: data.has_taste_info,
            chat_count: data.chat_count || 0,
            summary_fields: data.summary_fields || 0,
          });
        }
      })
      .catch(() => {});
  }, [user.id]);

  // Load existing conversation history on mount — split by channel
  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/full-transcript`)
      .then(r => r.json())
      .then(data => {
        if (!data.messages) return;
        const perChannel: Record<string, Message[]> = {
          new_chat: [],
          new_chat_cognitive: [],
          new_chat_taste: [],
        };
        for (const m of data.messages) {
          const ct = m.chat_type as string;
          if (ct && ct.startsWith("new_chat")) {
            const key = ct in perChannel ? ct : "new_chat";
            perChannel[key].push({ role: m.role, content: m.content });
          }
        }
        setChannelMessages(perChannel);
      })
      .catch(() => {});
  }, [user.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages, channel]);

  // Also scroll to bottom when switching back to chat screen
  useEffect(() => {
    if (screen === "chat") {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [screen]);

  async function sendMessage(text?: string, channelOverride?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    const effectiveChannel = channelOverride ?? channel;
    if (channelOverride) setChannel(channelOverride);

    setScreen("chat");
    setInput("");
    const userMsg: Message = { role: "user", content: msg };
    const channelMsgs = channelMessages[effectiveChannel] || [];
    const updatedMessages = [...channelMsgs, userMsg];
    setMessagesForChannel(effectiveChannel, () => updatedMessages);
    setSending(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const r = await fetch("/api/new-chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          message: msg,
          channel: effectiveChannel,
          history: updatedMessages.slice(-20),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      const data = await r.json();
      if (data.reply) {
        setMessagesForChannel(effectiveChannel, prev => [...prev, { role: "assistant", content: data.reply }]);
      } else if (data.error) {
        setMessagesForChannel(effectiveChannel, prev => [...prev, { role: "assistant", content: "מצטער, משהו השתבש. נסה שוב." }]);
      }
    } catch (err: any) {
      console.error("[NewChat] send error:", err);
      const errorMsg = err?.name === "AbortError" ? "הבקשה לקחה יותר מדי זמן. נסה שוב." : "שגיאה בתקשורת, נסה שוב.";
      setMessagesForChannel(effectiveChannel, prev => [...prev, { role: "assistant", content: errorMsg }]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div style={styles.container}>
      {/* Responsive CSS */}
      <style>{`
        .nc-sidebar { display: flex !important; }
        .nc-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .nc-sidebar {
            display: none !important;
            position: fixed;
            top: 0; right: 0;
            height: 100vh;
            z-index: 1000;
            box-shadow: -2px 0 12px rgba(0,0,0,0.15);
          }
          .nc-sidebar.open { display: flex !important; }
          .nc-menu-btn { display: flex !important; }
          .nc-chat-area { padding: 16px 16px !important; }
          .nc-input-area { padding: 10px 16px 12px !important; }
          .nc-suggestions { padding: 0 16px 8px !important; }
        }
      `}</style>

      {/* Mobile overlay */}
      {menuOpen && <div style={styles.overlay} onClick={() => setMenuOpen(false)} />}

      {/* Sidebar */}
      <div className={`nc-sidebar${menuOpen ? " open" : ""}`} style={styles.sidebar}>
        <div style={styles.logo}>
          <img src="/heartIcon.jpg" alt="" style={styles.logoIcon} />
          <span style={styles.logoText}>MatchMe</span>
        </div>

        <div style={styles.sidebarItems}>
          {/* Home screen */}
          <button
            style={screen === "home" ? styles.sidebarItemActive : styles.sidebarItem}
            onClick={() => { setScreen("home"); setMenuOpen(false); }}
          >
            <span style={{ fontSize: 16 }}>🏠</span>
            <span>מסך ראשי</span>
          </button>

          {/* Back to chat — only shown if any conversation has started */}
          {hasAnyMessages && (
            <button
              style={screen === "chat" && channel === "new_chat" ? styles.sidebarItemActive : styles.sidebarItem}
              onClick={() => { setChannel("new_chat"); setScreen("chat"); setMenuOpen(false); }}
            >
              <span style={{ fontSize: 16 }}>💬</span>
              <span>חזרה לשיחה</span>
            </button>
          )}

          {/* Other sidebar items */}
          {SIDEBAR_ITEMS.map((item, i) => (
            <button
              key={i}
              style={item.action ? (screen === item.action ? styles.sidebarItemActive : styles.sidebarItem) : { ...styles.sidebarItem, cursor: "default" }}
              disabled={!item.action}
              onClick={() => {
                if (!item.action) return;
                if (item.action === "taste_test") {
                  // Switch to taste test chat channel
                  sendMessage("נתח את הטעם שלי לעומק", "new_chat_taste");
                  setMenuOpen(false);
                  return;
                }
                setScreen(item.action as any);
                setMenuOpen(false);
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div style={styles.sidebarBottom}>
          <div style={styles.userArea}>
            <div style={styles.avatar}>{user.first_name.charAt(0)}</div>
            <span style={styles.userName}>{user.first_name}</span>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div style={styles.main}>
        {/* Header — mobile menu toggle */}
        <div style={styles.header}>
          <button className="nc-menu-btn" style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        </div>

        {/* Sub-screens: profile edit / insights */}
        {screen === "profile_edit" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <ProfileEdit user={user} onBack={() => setScreen("home")} onUserUpdate={onUserUpdate} />
          </div>
        )}

        {screen === "insights" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <Insights user={user} onBack={() => setScreen("home")} />
          </div>
        )}

        {screen === "bug_report" && (
          <div style={{ flex: 1, overflowY: "auto", direction: "rtl" }}>
            <div style={{ maxWidth: 500, margin: "0 auto", padding: "32px 24px" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginTop: 0, marginBottom: 8 }}>דווח על באג</h2>
              <p style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>נתקלת בבעיה? ספר/י לנו ונטפל בזה בהקדם.</p>
              <textarea
                style={{
                  width: "100%", minHeight: 120, padding: 14, fontSize: 14,
                  border: "1px solid #e0e0e8", borderRadius: 10, background: "#f5f5fa",
                  color: "#1a1a2e", resize: "vertical", outline: "none",
                  fontFamily: "inherit", direction: "rtl", boxSizing: "border-box",
                }}
                placeholder="תאר/י את הבאג שנתקלת בו..."
                value={bugText}
                onChange={e => setBugText(e.target.value)}
                disabled={bugSent}
              />
              <button
                style={{
                  marginTop: 12, padding: "12px 24px", fontSize: 15, fontWeight: 600,
                  background: bugSent ? "#28a745" : "#6366f1", color: "#fff",
                  border: "none", borderRadius: 10, cursor: bugText.trim() && !bugSent ? "pointer" : "default",
                  opacity: bugText.trim() && !bugSent ? 1 : 0.5,
                }}
                disabled={!bugText.trim() || bugSent}
                onClick={async () => {
                  if (!bugText.trim()) return;
                  try {
                    await fetch("/api/report-bug", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ user_id: user.id, report_text: bugText.trim() }),
                    });
                    setBugSent(true);
                    setBugText("");
                    setTimeout(() => { setBugSent(false); setScreen("home"); }, 2000);
                  } catch {}
                }}
              >
                {bugSent ? "נשלח בהצלחה ✓" : "שלח דיווח"}
              </button>
            </div>
          </div>
        )}

        {screen === "settings" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", direction: "rtl" }}>
            <div style={{ textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>הגדרות</h2>
              <p style={{ fontSize: 14, color: "#888" }}>המסך עוד בבנייה, בקרוב יהיה זמין!</p>
            </div>
          </div>
        )}

        {/* Chat Area — home + chat screens */}
        {(screen === "home" || screen === "chat") && (
          <>
            <div className="nc-chat-area" style={styles.chatArea}>
              {screen === "home" && (
                <div style={styles.welcomeBlock}>
                  <img src="/heartIcon.jpg" alt="" style={styles.welcomeIcon} />
                  <h2 style={styles.welcomeTitle}>ברוכים הבאים ל-MatchMe</h2>
                  <p style={styles.welcomeText}>
                    העוזר האישי שלך להכרויות מדויקות ומשמעותיות.
                  </p>
                  <p style={styles.welcomeText}>
                    אני כאן כדי להבין אותך לעומק ולסייע לך למצוא את ההתאמה המושלמת עבורך.
                  </p>
                </div>
              )}

              {screen === "chat" && (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} style={msg.role === "user" ? styles.userMsgRow : styles.assistantMsgRow}>
                      {msg.role === "assistant" && <img src="/heartIcon.jpg" alt="" style={styles.assistantIcon} />}
                      <div style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <div style={styles.assistantMsgRow}>
                      <div style={{ ...styles.assistantBubble, color: "#999" }}>...</div>
                    </div>
                  )}
                </>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Expert recommendation — one at a time, only when conversation is advanced enough */}
            {screen === "home" && (() => {
              const { has_cognitive, has_taste_info, summary_fields } = recommendations;
              const conversationAdvanced = summary_fields >= 4;
              // Show cognitive recommendation: only after enough general conversation
              if (!has_cognitive && conversationAdvanced) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>המלצת המומחה</span> היכנס ל"בוא נבין את סגנון החשיבה שלי" כדי שנוכל להכיר אותך יותר לעומק ולדייק את ההתאמה.
                    </p>
                  </div>
                );
              }
              // Show taste recommendation: only after cognitive is done
              if (has_cognitive && !has_taste_info) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>המלצת המומחה</span> לחץ על "נתח את הטעם שלי לעומק" כדי שנוכל להבין את העדפות הטעם שלך.
                    </p>
                  </div>
                );
              }
              return null;
            })()}

            {/* Suggestions — only on home screen */}
            {screen === "home" && (
              <div className="nc-suggestions" style={styles.suggestions}>
                <button style={{ ...styles.suggestionBtn, background: "#6366f1", color: "#fff", border: "1px solid #6366f1" }} onClick={() => {
                  setChannel("new_chat");
                  if (channelMessages["new_chat"].length === 0) {
                    const g = user.gender === "woman";
                    setMessagesForChannel("new_chat", () => [{ role: "assistant", content: `היי, אני מומחה ההתאמה שלך. אני כאן כדי למצוא ${g ? "לך" : "לך"} התאמה מדויקת על ידי היכרות מעמיקה.\nחשוב לי ש${g ? "תדעי" : "תדע"} שכל מה ש${g ? "את כותבת" : "אתה כותב"} לי כאן הוא לעיניי בלבד — שום דבר לא מופיע בפרופיל ${g ? "שלך" : "שלך"} ולא חשוף לאף משתמש אחר.\nככל ש${g ? "תשתפי" : "תשתף"} אותי יותר, נוכל לדייק את ההתאמה ${g ? "שלך" : "שלך"} יותר. ${g ? "מוכנה להתחיל?" : "מוכן להתחיל?"}` }]);
                  }
                  setScreen("chat");
                }}>
                  <span style={{ fontSize: 14 }}>💬</span> {channelMessages["new_chat"].length > 0 ? "בוא נמשיך" : "בוא נתחיל"}
                </button>
                {TOPIC_OPTIONS.map((s, i) => (
                  <button key={i} style={styles.suggestionBtn} onClick={() => {
                    sendMessage(s.text, s.channel);
                  }}>
                    <span style={{ fontSize: 14, opacity: 0.6 }}>{s.icon}</span> {s.text}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Input Area — only on home + chat screens */}
        {(screen === "home" || screen === "chat") && (
        <div className="nc-input-area" style={styles.inputArea}>
          <div style={styles.inputRow}>
            <textarea
              ref={inputRef}
              style={styles.textarea}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="כתוב הודעה..."
              rows={1}
              disabled={sending}
            />
            <button
              type="button"
              style={{ ...styles.sendBtn, opacity: input.trim() && !sending ? 1 : 0.4 }}
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
            >
              ←
            </button>
          </div>
          <div style={styles.disclaimer}>השיחה מנוהלת על ידי בינה מלאכותית לצורך הכרות והתאמה</div>
        </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    height: "100vh",
    direction: "rtl",
    fontFamily: "'Segoe UI', 'Arial', sans-serif",
    background: "#f9fafb",
  },

  overlay: {
    position: "fixed" as const,
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.3)",
    zIndex: 999,
  },

  // Sidebar
  sidebar: {
    width: 220,
    background: "#fff",
    borderLeft: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
    padding: "16px 0",
    flexShrink: 0,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 20px 20px",
    borderBottom: "1px solid #f0f0f0",
    marginBottom: 8,
  },
  logoIcon: { width: 28, height: 28, borderRadius: 6 },
  logoText: { fontSize: 18, fontWeight: 700, color: "#1a1a2e" },
  sidebarItems: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 10px",
    flex: 1,
  },
  sidebarItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    color: "#555",
    textAlign: "right",
    opacity: 0.7,
  },
  sidebarItemActive: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "none",
    background: "#f0f0ff",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    color: "#6366f1",
    textAlign: "right",
    fontWeight: 600,
    opacity: 1,
  },
  sidebarBottom: {
    padding: "12px 16px",
    borderTop: "1px solid #f0f0f0",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  userArea: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#6366f1",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 600,
  },
  userName: { fontSize: 13, fontWeight: 500, color: "#333" },

  // Main
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  header: {
    padding: "14px 24px",
    borderBottom: "1px solid #e5e7eb",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  menuBtn: {
    background: "none",
    border: "none",
    fontSize: 20,
    cursor: "pointer",
    color: "#555",
    padding: "0 4px",
    display: "flex",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#333",
  },

  // Chat
  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  welcomeBlock: {
    textAlign: "center",
    padding: "40px 20px 20px",
    maxWidth: 500,
    margin: "0 auto",
  },
  welcomeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: "#1a1a2e",
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 15,
    color: "#666",
    lineHeight: 1.6,
    margin: "4px 0",
  },

  // Recommendations
  recommendationBlock: {
    padding: "0 24px 12px",
    maxWidth: 500,
    margin: "0 auto",
  },
  recommendationText: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 1.5,
    margin: "8px 0",
    padding: "10px 14px",
    background: "#f0f4ff",
    borderRadius: 10,
    borderRight: "3px solid #6366f1",
  },
  recommendationBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#6366f1",
    marginLeft: 6,
  },

  // Messages
  userMsgRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  assistantMsgRow: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userBubble: {
    background: "#6366f1",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "16px 16px 4px 16px",
    maxWidth: "65%",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  assistantIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginLeft: 8,
    flexShrink: 0,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  assistantBubble: {
    background: "#f0f0f5",
    color: "#1a1a2e",
    padding: "10px 16px",
    borderRadius: "16px 16px 16px 4px",
    maxWidth: "65%",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },

  // Suggestions
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "0 40px 12px",
    justifyContent: "center",
  },
  suggestionBtn: {
    padding: "8px 16px",
    border: "1px solid #e0e0e8",
    borderRadius: 20,
    background: "#fff",
    fontSize: 13,
    color: "#555",
    cursor: "pointer",
  },

  // Input
  inputArea: {
    padding: "12px 40px 16px",
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#f5f5fa",
    borderRadius: 12,
    padding: "8px 14px",
    border: "1px solid #e0e0e8",
  },
  textarea: {
    flex: 1,
    border: "none",
    background: "transparent",
    fontSize: 14,
    resize: "none",
    outline: "none",
    direction: "rtl",
    fontFamily: "inherit",
    lineHeight: 1.5,
  },
  sendBtn: {
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: 32,
    height: 32,
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  disclaimer: {
    fontSize: 11,
    color: "#aaa",
    textAlign: "center",
    marginTop: 8,
  },
};
