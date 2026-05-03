import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface NewChatProps {
  user: { id: number; first_name: string; email: string };
  onBack: () => void;
  onNavigate?: (view: string) => void;
}

type Channel = "main" | "taste_analysis" | "matching_method" | "process_question" | "learned_about_me";

const CHANNEL_LABELS: Record<Channel, string> = {
  main: "שיחה ראשית",
  taste_analysis: "נתח את הטעם שלי לעומק",
  matching_method: "איך אתה מוצא לי התאמה מדויקת?",
  process_question: "יש לי שאלה לגבי התהליך",
  learned_about_me: "מה למדת עליי עד עכשיו?",
};

const SUGGESTIONS: { icon: string; text: string; channel: Channel }[] = [
  { icon: "🔍", text: "נתח את הטעם שלי לעומק", channel: "taste_analysis" },
  { icon: "🎯", text: "איך אתה מוצא לי התאמה מדויקת?", channel: "matching_method" },
  { icon: "❓", text: "יש לי שאלה לגבי התהליך", channel: "process_question" },
  { icon: "📋", text: "מה למדת עליי עד עכשיו?", channel: "learned_about_me" },
];

const SIDEBAR_ITEMS: { icon: string; label: string; action?: string }[] = [
  { icon: "📋", label: "הפרטים שלי", action: "profile_edit" },
  { icon: "👤", label: "פרופיל" },
  { icon: "💡", label: "תובנות על עצמי", action: "insights" },
  { icon: "🎯", label: "בדיקת טעם אישי" },
  { icon: "⚙️", label: "הגדרות" },
];

// DB guide values map to channels
const GUIDE_TO_CHANNEL: Record<string, Channel> = {
  new_chat: "main",
  new_chat_taste_analysis: "taste_analysis",
  new_chat_matching_method: "matching_method",
  new_chat_process_question: "process_question",
  new_chat_learned_about_me: "learned_about_me",
};

function channelToGuide(ch: Channel): string {
  return ch === "main" ? "new_chat" : `new_chat_${ch}`;
}

export default function NewChat({ user, onBack, onNavigate }: NewChatProps) {
  const [channel, setChannel] = useState<Channel>("main");
  const [messagesByChannel, setMessagesByChannel] = useState<Record<Channel, Message[]>>({
    main: [], taste_analysis: [], matching_method: [], process_question: [], learned_about_me: [],
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingSend, setPendingSend] = useState<{ channel: Channel; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = messagesByChannel[channel];
  const isMainWithNoMessages = channel === "main" && messages.length === 0;

  // Load existing conversation history on mount
  useEffect(() => {
    fetch(`/api/users/${user.id}/transcript`)
      .then(r => r.json())
      .then(data => {
        if (!data.messages) return;
        const loaded: Record<Channel, Message[]> = {
          main: [], taste_analysis: [], matching_method: [], process_question: [], learned_about_me: [],
        };
        for (const m of data.messages) {
          const ch = GUIDE_TO_CHANNEL[m.chat_type];
          if (ch) {
            loaded[ch].push({ role: m.role as "user" | "assistant", content: m.content });
          }
        }
        setMessagesByChannel(loaded);
      })
      .catch(() => {});
  }, [user.id]);

  // Send pending message after channel switch
  useEffect(() => {
    if (pendingSend && pendingSend.channel === channel) {
      setPendingSend(null);
      sendMessage(pendingSend.text);
    }
  }, [channel, pendingSend]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function switchChannel(ch: Channel) {
    setChannel(ch);
    setInput("");
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    setInput("");
    const userMsg: Message = { role: "user", content: msg };
    setMessagesByChannel(prev => ({ ...prev, [channel]: [...prev[channel], userMsg] }));
    setSending(true);

    try {
      const r = await fetch("/api/new-chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          message: msg,
          channel: channelToGuide(channel),
          history: [...messages, userMsg].slice(-20),
        }),
      });
      const data = await r.json();
      if (data.reply) {
        setMessagesByChannel(prev => ({
          ...prev,
          [channel]: [...prev[channel], { role: "assistant", content: data.reply }],
        }));
      }
    } catch {
      setMessagesByChannel(prev => ({
        ...prev,
        [channel]: [...prev[channel], { role: "assistant", content: "שגיאה בתקשורת, נסה שוב." }],
      }));
    } finally {
      setSending(false);
      inputRef.current?.focus();
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

      {/* Sidebar — always visible on desktop, toggled on mobile */}
      <div className={`nc-sidebar${menuOpen ? " open" : ""}`} style={styles.sidebar}>
        <div style={styles.logo}>
          <img src="/heartIcon.jpg" alt="" style={styles.logoIcon} />
          <span style={styles.logoText}>MatchMe</span>
        </div>

        <div style={styles.sidebarItems}>
          {/* Back to main chat */}
          <button
            style={channel === "main" ? styles.sidebarItemActive : styles.sidebarItem}
            onClick={() => { switchChannel("main"); setMenuOpen(false); }}
          >
            <span style={{ fontSize: 16 }}>💬</span>
            <span>חזרה לשיחה</span>
          </button>

          {/* Other sidebar items */}
          {SIDEBAR_ITEMS.map((item, i) => (
            <button
              key={i}
              style={item.action ? styles.sidebarItem : { ...styles.sidebarItem, cursor: "default" }}
              disabled={!item.action}
              onClick={() => { if (item.action) { onNavigate?.(item.action); setMenuOpen(false); } }}
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
        {/* Header */}
        <div style={styles.header}>
          <button className="nc-menu-btn" style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <span style={styles.headerTitle}>שיחה חדשה</span>
        </div>

        {/* Chat Area */}
        <div className="nc-chat-area" style={styles.chatArea}>
          {isMainWithNoMessages && (
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

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions — only on main channel with no messages */}
        {isMainWithNoMessages && (
          <div className="nc-suggestions" style={styles.suggestions}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} style={styles.suggestionBtn} onClick={() => {
                if (messagesByChannel[s.channel].length > 0) {
                  setChannel(s.channel);
                } else {
                  setChannel(s.channel);
                  setPendingSend({ channel: s.channel, text: s.text });
                }
              }}>
                <span style={{ fontSize: 14, opacity: 0.6 }}>{s.icon}</span> {s.text}
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
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
              style={{ ...styles.sendBtn, opacity: input.trim() && !sending ? 1 : 0.4 }}
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
            >
              ←
            </button>
          </div>
          <div style={styles.disclaimer}>השיחה מנוהלת על ידי בינה מלאכותית לצורך הכרות והתאמה</div>
        </div>
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
