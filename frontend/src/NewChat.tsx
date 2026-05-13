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
  { icon: "👤", label: "פרופיל", action: "profile_view" },
  { icon: "💡", label: "תובנות על עצמי", action: "insights" },
  { icon: "🎯", label: "בדיקת טעם חיצוני", action: "taste_test" },
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
  const [screen, setScreen] = useState<"home" | "chat" | "profile_edit" | "profile_view" | "insights" | "bug_report" | "settings">("home");
  const [bugText, setBugText] = useState("");
  const [bugSent, setBugSent] = useState(false);
  const [recommendations, setRecommendations] = useState<{ has_cognitive: boolean; has_taste_info: boolean; chat_count: number; summary_fields: number; cognitive_count: number; photo_count: number; has_profile_details: boolean }>({ has_cognitive: true, has_taste_info: true, chat_count: 0, summary_fields: 0, cognitive_count: 0, photo_count: 0, has_profile_details: false });
  const [closedChannels, setClosedChannels] = useState<Record<string, boolean>>({});
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

  // Load recommendations status — on mount and whenever returning to home screen
  function loadRecommendations() {
    fetch(`/api/new-chat/status/${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.has_cognitive !== undefined) {
          setRecommendations({
            has_cognitive: data.has_cognitive,
            has_taste_info: data.has_taste_info,
            chat_count: data.chat_count || 0,
            summary_fields: data.summary_fields || 0,
            cognitive_count: data.cognitive_count || 0,
            photo_count: data.photo_count || 0,
            has_profile_details: data.has_profile_details || false,
          });
          if (data.chat_closed) setClosedChannels(prev => ({ ...prev, "new_chat": true }));
        }
      })
      .catch(() => {});
  }

  useEffect(() => { loadRecommendations(); }, [user.id]);
  useEffect(() => { if (screen === "home") loadRecommendations(); }, [screen]);

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
          if (!ct) continue;
          let key: string | null = null;
          if (ct.startsWith("new_chat")) {
            key = ct in perChannel ? ct : "new_chat";
          } else if (ct === "psychologist") {
            key = "new_chat";
          } else if (ct === "interviewer") {
            key = "new_chat_cognitive";
          }
          if (key) perChannel[key].push({ role: m.role, content: m.content });
        }
        setChannelMessages(prev => {
          // Don't overwrite channels that already have messages (e.g. greeting just added)
          const merged = { ...prev };
          for (const [ch, msgs] of Object.entries(perChannel)) {
            if (msgs.length > 0) merged[ch] = msgs;
          }
          return merged;
        });
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
        if (data.closing_stage >= 3) {
          setClosedChannels(prev => ({ ...prev, [effectiveChannel]: true }));
          // Refresh recommendations so bubbles reflect current state
          fetch(`/api/new-chat/status/${user.id}`).then(r => r.json()).then(d => {
            if (d.has_cognitive !== undefined) setRecommendations({ has_cognitive: d.has_cognitive, has_taste_info: d.has_taste_info, chat_count: d.chat_count || 0, summary_fields: d.summary_fields || 0, cognitive_count: d.cognitive_count || 0, photo_count: d.photo_count || 0, has_profile_details: d.has_profile_details || false });
          }).catch(() => {});
        }
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
          <span style={styles.logoText}>One</span>
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

          {/* Back to chat — only shown if general chat has started */}
          {(channelMessages["new_chat"]?.length > 0) && (
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
                  setScreen("taste_test" as any);
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

        {screen === ("taste_test" as any) && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", direction: "rtl" }}>
            <div style={{ textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🎯</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>בדיקת טעם חיצוני</h2>
              <p style={{ fontSize: 14, color: "#888" }}>המסך עוד בבנייה, בקרוב יהיה זמין!</p>
            </div>
          </div>
        )}

        {/* Profile View */}
        {screen === "profile_view" && <ProfileView user={user} />}

        {/* Chat Area — home + chat screens */}
        {(screen === "home" || screen === "chat") && (
          <>
            <div className="nc-chat-area" style={styles.chatArea}>
              {screen === "home" && (
                <div style={styles.welcomeBlock}>
                  <img src="/heartIcon.jpg" alt="" style={styles.welcomeIcon} />
                  <h2 style={styles.welcomeTitle}>ברוכים הבאים ל-One</h2>
                  <p style={styles.welcomeText}>
                    העוזר האישי שלך להכרויות מדויקות ומשמעותיות.
                  </p>
                  <p style={styles.welcomeText}>
                    אני כאן כדי להבין אותך לעומק ולסייע לך למצוא את ההתאמה המושלמת עבורך.
                  </p>
                  <p style={{ fontSize: 12, color: "#999", marginTop: 12, lineHeight: 1.5 }}>
                    המערכת בשלבי בנייה. הצ'אט עלול עדיין להרגיש קצת רובוטי או תקוע — תודה על ההבנה.
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

                  {/* Post-close channel bubbles */}
                  {closedChannels[channel] && !sending && (() => {
                    const { has_cognitive, has_taste_info } = recommendations;
                    const isCouple = (user as any).test_user_type === "Couple Tester";
                    const cogDone = isCouple ? recommendations.cognitive_count >= 3 : has_cognitive;
                    const tasteDone = isCouple ? has_taste_info : has_taste_info;
                    const bubbles: { icon: string; text: string; ch: string }[] = [];
                    if (!cogDone && channel !== "new_chat_cognitive") bubbles.push({ icon: "🧠", text: "בוא נבין את סגנון החשיבה שלי", ch: "new_chat_cognitive" });
                    if (!tasteDone && channel !== "new_chat_taste") bubbles.push({ icon: "🔍", text: "נתח את הטעם שלי לעומק", ch: "new_chat_taste" });
                    if (channel !== "new_chat" && !closedChannels["new_chat"] && (recommendations.summary_fields < 8)) bubbles.push({ icon: "💬", text: "בוא נמשיך להכיר", ch: "new_chat" });
                    if (bubbles.length === 0) return null;
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
                        {bubbles.map((b, i) => (
                          <button key={i} style={{ padding: "8px 16px", border: "1px solid #e0e0e8", borderRadius: 20, background: "#fff", fontSize: 13, color: "#6366f1", cursor: "pointer", fontWeight: 600 }} onClick={() => {
                            if (channelMessages[b.ch]?.length > 0) {
                              setChannel(b.ch);
                            } else {
                              sendMessage(b.text, b.ch);
                            }
                          }}>
                            <span style={{ fontSize: 14, marginLeft: 4 }}>{b.icon}</span> {b.text}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Expert recommendation — one at a time, prioritized */}
              {screen === "home" && (() => {
              const { has_cognitive, has_taste_info, summary_fields, chat_count } = recommendations;
              console.log('[REC] recommendations:', JSON.stringify(recommendations));
              const isCouple = (user as any).test_user_type === "Couple Tester";
              // Couples get recommendations earlier
              const conversationAdvanced = isCouple ? chat_count >= 5 : summary_fields >= 4;
              const cogDoneForCouple = isCouple ? recommendations.cognitive_count >= 3 : has_cognitive;
              const tasteDoneForCouple = isCouple ? recommendations.cognitive_count >= 3 && has_taste_info : has_taste_info;
              const chatClosed = closedChannels["new_chat"] || false;
              const chatNotEnough = summary_fields < 8 && chat_count > 0 && !chatClosed;

              console.log('[REC] chatNotEnough:', chatNotEnough, 'chatClosed:', chatClosed, 'conversationAdvanced:', conversationAdvanced, 'cogDone:', cogDoneForCouple, 'tasteDone:', tasteDoneForCouple);
              // Priority 1: General chat not complete — return to chat
              if (chatNotEnough) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>המלצת המומחה</span> עדיין לא הגענו להיכרות מספקת כדי למצוא לך התאמה ראויה. לחץ על "בוא נמשיך" כדי להתקדם.
                    </p>
                  </div>
                );
              }
              // Priority 2: Suggest cognitive after enough general conversation
              if (!cogDoneForCouple && conversationAdvanced) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>המלצת המומחה</span> היכנס ל"בוא נבין את סגנון החשיבה שלי" כדי שנוכל להכיר אותך יותר לעומק ולדייק את ההתאמה.
                    </p>
                  </div>
                );
              }
              // Priority 3: Suggest taste after cognitive is done
              if (cogDoneForCouple && !tasteDoneForCouple) {
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      <span style={styles.recommendationBadge}>המלצת המומחה</span> לחץ על "נתח את הטעם שלי לעומק" כדי שנוכל להבין את העדפות הטעם שלך.
                    </p>
                  </div>
                );
              }
              // All done — thank the user + prompt for photos/profile
              if (chatClosed && cogDoneForCouple && tasteDoneForCouple) {
                const hasPhotos = recommendations.photo_count > 0;
                const hasDetails = recommendations.has_profile_details;
                return (
                  <div style={styles.recommendationBlock}>
                    <p style={styles.recommendationText}>
                      סיימת את כל השלבים, תודה רבה, עזרת לי מאוד לשפר את עצמי! נחזור אליך בקרוב עם תובנות על הזוגיות שלך :)
                    </p>
                    {(!hasPhotos || !hasDetails) && (
                      <p style={{ ...styles.recommendationText, marginTop: 8 }}>
                        <span style={styles.recommendationBadge}>המלצת המומחה</span>
                        {isCouple
                          ? " אם אתם מעוניינים לעזור לי להתאמן ולבחון גם התאמה חיצונית ביניכם — העלו תמונות במסך הפרופיל. תודה רבה!"
                          : ` להשלמת הפרופיל ${!hasPhotos ? "יש להעלות תמונות" : ""}${!hasPhotos && !hasDetails ? " ו" : ""}${!hasDetails ? "להשלים פרטים אישיים" : ""} במסך הפרופיל.`
                        }
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            })()}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions — only on home screen */}
            {screen === "home" && (
              <div className="nc-suggestions" style={styles.suggestions}>
                <button style={{ ...styles.suggestionBtn, background: "#6366f1", color: "#fff", border: "1px solid #6366f1" }} onClick={() => {
                  setChannel("new_chat");
                  if (channelMessages["new_chat"].length === 0) {
                    const g = user.gender === "woman";
                    const isCouple = (user as any).test_user_type === "Couple Tester";
                    const greeting = isCouple
                      ? `היי ${user.first_name}, תודה רבה על ההשתתפות בתהליך האימון שלי.\nככל שאני נבדק על זוגות רבים יותר - אני לומד לדייק את ההתאמות למשתמשים שמחפשים זוגיות אמיתית, והשתתפות ${g ? "שלך" : "שלך"} מסייעת לי מאוד.\nאשאל ${g ? "אותך" : "אותך"} שאלות כמו שהייתי שואל רווקים-רווקות אמיתיים שנכנסים למערכת, ${g ? "אשמח אם תעני" : "אשמח אם תענה"} בכנות ובטבעיות כפי ש${g ? "היית עונה אם היית" : "היית עונה אם היית"} באמת ${g ? "מחפשת" : "מחפש"} שידוך.\nבסוף התהליך ${g ? "תוכלי" : "תוכל"} גם לקבל ממני קצת תובנות על ${g ? "עצמך" : "עצמך"} ועל הזוגיות ${g ? "שלך" : "שלך"} :)\nחשוב לי ש${g ? "תדעי" : "תדע"} שכל מה ש${g ? "את כותבת" : "אתה כותב"} לי כאן הוא לעיניי בלבד — שום דבר לא מופיע בפרופיל ${g ? "שלך" : "שלך"} ולא חשוף לאף משתמש אחר.\n${g ? "מוכנה להתחיל?" : "מוכן להתחיל?"}`
                      : `היי ${user.first_name}, אני מומחה ההתאמה שלך. אני כאן כדי למצוא ${g ? "לך" : "לך"} התאמה מדויקת על ידי היכרות מעמיקה.\nחשוב לי ש${g ? "תדעי" : "תדע"} שכל מה ש${g ? "את כותבת" : "אתה כותב"} לי כאן הוא לעיניי בלבד — שום דבר לא מופיע בפרופיל ${g ? "שלך" : "שלך"} ולא חשוף לאף משתמש אחר.\nככל ש${g ? "תשתפי" : "תשתף"} אותי יותר, נוכל לדייק את ההתאמה ${g ? "שלך" : "שלך"} יותר. ${g ? "מוכנה להתחיל?" : "מוכן להתחיל?"}`;
                    setMessagesForChannel("new_chat", () => [{ role: "assistant", content: greeting }]);
                  }
                  setScreen("chat");
                }}>
                  <span style={{ fontSize: 14 }}>💬</span> {channelMessages["new_chat"].length > 0 ? "בוא נמשיך" : "בוא נתחיל"}
                </button>
                {TOPIC_OPTIONS.map((s, i) => (
                  <button key={i} style={styles.suggestionBtn} onClick={() => {
                    if (s.channel && channelMessages[s.channel]?.length > 0) {
                      // Already has history — just switch to that channel
                      setChannel(s.channel);
                      setScreen("chat");
                    } else {
                      sendMessage(s.text, s.channel);
                    }
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
              style={{ ...styles.textarea, maxHeight: 120, overflowY: input.split("\n").length > 4 ? "auto" : "hidden" }}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                // Auto-grow textarea
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
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

// ── Profile View component ──────────────────────────────────────

function ProfileView({ user }: { user: User }) {
  const [photos, setPhotos] = useState<{ id: number; url: string }[]>([]);

  function loadPhotos() {
    fetch(`/api/users/${user.id}/photos`).then(r => r.json()).then(data => {
      if (data.photos) setPhotos(data.photos);
    }).catch(() => {});
  }

  useEffect(() => { loadPhotos(); }, [user.id]);

  return (
    <div style={{ flex: 1, overflowY: "auto", direction: "rtl" }}>
      <div style={{ maxWidth: 400, margin: "0 auto", padding: "32px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{user.first_name}</h2>
        {user.age && <p style={{ fontSize: 15, color: "#666", margin: "0 0 16px" }}>{user.age}</p>}

        {/* Photos grid */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
          {photos.map(p => (
            <div key={p.id} style={{ position: "relative", width: 100, height: 100, borderRadius: 10, overflow: "hidden", background: "#e0e0e8" }}>
              <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                style={{ position: "absolute", top: 2, left: 2, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={async () => {
                  await fetch(`/api/users/${user.id}/photos/${p.id}`, { method: "DELETE" });
                  loadPhotos();
                }}
              >✕</button>
            </div>
          ))}
          {photos.length === 0 && (
            <div style={{ width: 100, height: 100, borderRadius: 10, background: "#e0e0e8", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 36, color: "#aaa" }}>{user.first_name.charAt(0)}</span>
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#6366f1", marginBottom: 12 }}>רצוי להעלות 3 תמונות לפחות</p>
        <label style={{
          display: "inline-block", padding: "8px 20px", fontSize: 13, fontWeight: 600,
          background: "#6366f1", color: "#fff", borderRadius: 8, cursor: "pointer",
        }}>
          העלאת תמונה
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.append("photo", file);
            try {
              await fetch(`/api/users/${user.id}/photos`, { method: "POST", body: form });
              loadPhotos();
            } catch { alert("שגיאה בהעלאת התמונה"); }
          }} />
        </label>
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
