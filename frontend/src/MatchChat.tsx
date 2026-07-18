import { useState, useEffect, useRef, useCallback } from "react";

interface MatchChatProps {
  user: { id: number; first_name: string; gender?: string };
  matchId: number;
  partnerName: string;
  partnerPhoto: string | null;
  myPhoto: string | null;
  onBack: () => void;
}

interface Message {
  id: number;
  match_id: number;
  sender_id: number;
  content: string;
  read_at: string | null;
  created_at: string;
}

export default function MatchChat({ user, matchId, partnerName, partnerPhoto, myPhoto, onBack }: MatchChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState<number | null>(null); // user_id who blocked
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockAction, setBlockAction] = useState<"report_block" | "block_only">("report_block");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastServerTimestampRef = useRef<string | null>(null); // Only server-confirmed timestamps for polling
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    }, 50);
  }, []);

  // iOS virtual keyboard handling — use visualViewport to resize chat properly
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      setViewportHeight(vv.height);
      // Scroll to bottom when keyboard opens (viewport shrinks)
      scrollToBottom(false);
    };

    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);
    // Set initial height
    setViewportHeight(vv.height);

    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
    };
  }, [scrollToBottom]);

  // Initial load
  useEffect(() => {
    fetch(`/api/users/${user.id}/direct-messages`)
      .then((r) => r.json())
      .then((data) => {
        const msgs = data.messages || [];
        setMessages(msgs);
        // Track last server-confirmed timestamp for reliable polling
        if (msgs.length > 0) {
          lastServerTimestampRef.current = msgs[msgs.length - 1].created_at;
        }
        setPartnerTyping(data.partner_typing || false);
        setBlocked(data.blocked_by || null);
        setLoaded(true);
        scrollToBottom(false);
        // Mark as read
        if (data.unread_count > 0) {
          fetch(`/api/users/${user.id}/mark-messages-read`, { method: "POST" });
        }
      })
      .catch(() => setLoaded(true));
  }, [user.id, scrollToBottom]);

  // Polling for new messages — uses server-confirmed timestamps only
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const since = lastServerTimestampRef.current;
        const url = since
          ? `/api/users/${user.id}/direct-messages?since=${encodeURIComponent(since)}`
          : `/api/users/${user.id}/direct-messages`;
        const res = await fetch(url);
        const data = await res.json();

        // Always mark as read while chat is open
        fetch(`/api/users/${user.id}/mark-messages-read`, { method: "POST" });

        if (data.messages && data.messages.length > 0) {
          // Update last server timestamp from the newest server message
          const serverMsgs = data.messages as Message[];
          if (serverMsgs.length > 0) {
            lastServerTimestampRef.current = serverMsgs[serverMsgs.length - 1].created_at;
          }
          let hasNew = false;
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = serverMsgs.filter((m) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            hasNew = true;
            // Also replace any optimistic messages that now have server confirmation
            const updatedPrev = prev.map((existing) => {
              if (existing.id > 1700000000000) { // temp ID (Date.now())
                const match = serverMsgs.find((s) => s.sender_id === existing.sender_id && s.content === existing.content);
                if (match) return match;
              }
              return existing;
            });
            const updatedIds = new Set(updatedPrev.map((m) => m.id));
            const trulyNew = serverMsgs.filter((m) => !updatedIds.has(m.id));
            if (trulyNew.length === 0 && updatedPrev.every((m, i) => m.id === prev[i]?.id)) return prev;
            hasNew = trulyNew.length > 0;
            return [...updatedPrev, ...trulyNew];
          });
          if (hasNew) scrollToBottom();
        }
        setPartnerTyping(data.partner_typing || false);
        if (data.blocked_by) setBlocked(data.blocked_by);
      } catch {
        // ignore
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user.id, scrollToBottom]);

  // Scroll on new messages
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Send typing status
  const sendTypingStatus = useCallback(
    (isTyping: boolean) => {
      if (lastTypingSentRef.current === isTyping) return;
      lastTypingSentRef.current = isTyping;
      fetch(`/api/users/${user.id}/typing-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_typing: isTyping }),
      }).catch(() => {});
    },
    [user.id]
  );

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.trim().length > 0) {
      sendTypingStatus(true);
      // Clear existing stop-typing timeout
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
        // Stop the keep-alive interval when user stops typing
        if (typingIntervalRef.current) { clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
      }, 3000);
      // Start keep-alive: re-send typing=true every 3s so server doesn't expire it (6s window)
      if (!typingIntervalRef.current) {
        typingIntervalRef.current = setInterval(() => {
          lastTypingSentRef.current = false; // Force re-send
          sendTypingStatus(true);
        }, 3000);
      }
    } else {
      sendTypingStatus(false);
      if (typingIntervalRef.current) { clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");
    sendTypingStatus(false);
    if (typingIntervalRef.current) { clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }

    // Optimistic add
    const tempMsg: Message = {
      id: Date.now(),
      match_id: matchId,
      sender_id: user.id,
      content: text,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    scrollToBottom();

    try {
      const res = await fetch(`/api/users/${user.id}/direct-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const saved = await res.json();
      if (saved.id) {
        setMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? saved : m)));
        lastServerTimestampRef.current = saved.created_at;
      }
    } catch {
      // keep optimistic message
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Format time
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  };

  // Group messages by date
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "היום";
    if (d.toDateString() === yesterday.toDateString()) return "אתמול";
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  };

  const getDateKey = (dateStr: string) => new Date(dateStr).toDateString();

  const handleReport = async (withBlock: boolean) => {
    if (withBlock) {
      setBlockAction("report_block");
      setBlockConfirmOpen(true);
      return;
    }
    // Report only
    setReportSending(true);
    try {
      await fetch(`/api/users/${user.id}/report-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_text: reportText, block: false }),
      });
      setReportSent(true);
      setReportText("");
      setTimeout(() => { setReportOpen(false); setReportSent(false); }, 2000);
    } catch {}
    setReportSending(false);
  };

  const handleBlockOnly = () => {
    setBlockAction("block_only");
    setBlockConfirmOpen(true);
  };

  const confirmBlock = async () => {
    setReportSending(true);
    try {
      await fetch(`/api/users/${user.id}/report-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_text: blockAction === "report_block" ? reportText : "",
          block: true,
        }),
      });
      setBlocked(user.id);
      setReportOpen(false);
      setBlockConfirmOpen(false);
      setReportText("");
    } catch {}
    setReportSending(false);
  };

  const isBlocked = !!blocked;

  return (
    <div style={{ ...styles.container, ...(viewportHeight ? { height: viewportHeight } : {}) }}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div style={styles.headerCenter}>
          <div style={styles.headerAvatar}>
            {partnerPhoto ? (
              <img src={partnerPhoto} alt={partnerName} style={styles.headerAvatarImg} />
            ) : (
              <span style={styles.headerAvatarFallback}>{partnerName.charAt(0)}</span>
            )}
          </div>
          <span style={styles.headerName}>{partnerName}</span>
        </div>
        <button onClick={() => setReportOpen(!reportOpen)} style={styles.reportBtn} title="דיווח">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={reportOpen ? "#ef4444" : "#999"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </button>
      </div>

      {/* Report panel */}
      {reportOpen && !reportSent && (
        <div style={styles.reportPanel}>
          <p style={styles.reportTitle}>דיווח על {partnerName}</p>
          <p style={styles.reportDesc}>
            אם נתקלת בהתנהגות לא ראויה, תוכן פוגעני או כל בעיה אחרת — ספרו לנו ואנחנו נטפל בזה.
          </p>
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="תארו את הבעיה..."
            rows={3}
            style={styles.reportTextarea}
          />
          <div style={styles.reportActions}>
            <button
              onClick={() => handleReport(false)}
              disabled={!reportText.trim() || reportSending}
              style={{ ...styles.reportActionBtn, background: "#6366f1", color: "#fff", opacity: !reportText.trim() ? 0.4 : 1 }}
            >
              דיווח
            </button>
            <button
              onClick={() => handleReport(true)}
              disabled={!reportText.trim() || reportSending}
              style={{ ...styles.reportActionBtn, background: "#ef4444", color: "#fff", opacity: !reportText.trim() ? 0.4 : 1 }}
            >
              דיווח וחסימה
            </button>
            <button
              onClick={handleBlockOnly}
              disabled={reportSending}
              style={{ ...styles.reportActionBtn, background: "#fff", color: "#ef4444", border: "1.5px solid #fca5a5" }}
            >
              חסימה בלבד
            </button>
          </div>
          <button onClick={() => setReportOpen(false)} style={styles.reportCancel}>ביטול</button>
        </div>
      )}
      {reportOpen && reportSent && (
        <div style={styles.reportPanel}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#22c55e", textAlign: "center", margin: 0 }}>
            הדיווח נשלח בהצלחה. תודה!
          </p>
        </div>
      )}

      {/* Block confirmation modal */}
      {blockConfirmOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <p style={styles.modalTitle}>חסימת {partnerName}</p>
            <p style={styles.modalText}>
              לאחר החסימה, {partnerName} לא יוכל/תוכל לשלוח לך הודעות וגם אתה לא תוכל/י לשלוח.
              <br />פעולה זו אינה ניתנת לביטול עצמאי.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={confirmBlock}
                disabled={reportSending}
                style={{ ...styles.reportActionBtn, background: "#ef4444", color: "#fff" }}
              >
                {reportSending ? "מבצע..." : "אישור חסימה"}
              </button>
              <button
                onClick={() => setBlockConfirmOpen(false)}
                style={{ ...styles.reportActionBtn, background: "#f5f5f5", color: "#333" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={containerRef} style={styles.messagesArea}>
        {/* Welcome message */}
        {loaded && messages.length === 0 && (
          <div style={styles.welcomeContainer}>
            <div style={styles.welcomeIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p style={styles.welcomeTitle}>התחילו לשוחח!</p>
            <p style={styles.welcomeText}>
              שלחו הודעה ראשונה ל{partnerName} והתחילו להכיר
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.sender_id === user.id;
          const showDate = i === 0 || getDateKey(msg.created_at) !== getDateKey(messages[i - 1].created_at);
          const showAvatar = !isMe && (i === messages.length - 1 || messages[i + 1]?.sender_id === user.id);

          return (
            <div key={msg.id}>
              {showDate && (
                <div style={styles.dateSeparator}>
                  <span style={styles.dateLabel}>{formatDate(msg.created_at)}</span>
                </div>
              )}
              <div style={isMe ? styles.myMsgRow : styles.partnerMsgRow}>
                {!isMe && (
                  <div style={styles.avatarSlot}>
                    {showAvatar && (
                      <div style={styles.msgAvatar}>
                        {partnerPhoto ? (
                          <img src={partnerPhoto} alt="" style={styles.msgAvatarImg} />
                        ) : (
                          <span style={styles.msgAvatarFallback}>{partnerName.charAt(0)}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div style={styles.bubbleCol}>
                  <div style={isMe ? styles.myBubble : styles.partnerBubble}>
                    {msg.content}
                  </div>
                  <span style={{ ...styles.timestamp, textAlign: isMe ? "left" : "right" }}>
                    {formatTime(msg.created_at)}
                    {isMe && msg.read_at && " \u2713\u2713"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {partnerTyping && (
          <div style={styles.partnerMsgRow}>
            <div style={styles.avatarSlot}>
              <div style={styles.msgAvatar}>
                {partnerPhoto ? (
                  <img src={partnerPhoto} alt="" style={styles.msgAvatarImg} />
                ) : (
                  <span style={styles.msgAvatarFallback}>{partnerName.charAt(0)}</span>
                )}
              </div>
            </div>
            <div style={styles.typingBubble}>
              <span style={styles.typingDot} className="mc-typing-dot mc-dot-1" />
              <span style={styles.typingDot} className="mc-typing-dot mc-dot-2" />
              <span style={styles.typingDot} className="mc-typing-dot mc-dot-3" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {isBlocked ? (
        <div style={styles.inputArea}>
          <p style={{ fontSize: 13, color: "#999", textAlign: "center", margin: 0 }}>
            השיחה נחסמה. לא ניתן לשלוח הודעות.
          </p>
        </div>
      ) : (
      <div style={styles.inputArea}>
        <div style={styles.inputRow}>
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`כתבו הודעה ל${partnerName}...`}
            rows={1}
            style={styles.textarea}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 100) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              ...styles.sendBtn,
              opacity: !input.trim() || sending ? 0.4 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
      )}

      {/* Typing animation CSS */}
      <style>{`
        @keyframes mc-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        .mc-dot-1 { animation: mc-typing-bounce 1.4s ease-in-out infinite; }
        .mc-dot-2 { animation: mc-typing-bounce 1.4s ease-in-out 0.2s infinite; }
        .mc-dot-3 { animation: mc-typing-bounce 1.4s ease-in-out 0.4s infinite; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#f9fafb",
    direction: "rtl",
    overflow: "hidden",
    position: "relative" as const,
  },

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  backBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    overflow: "hidden",
    border: "2px solid #e0ddf5",
    flexShrink: 0,
  },
  headerAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  headerAvatarFallback: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#e0ddf5",
    color: "#6366f1",
    fontWeight: 700,
    fontSize: 15,
  },
  headerName: {
    fontSize: 16,
    fontWeight: 600,
    color: "#1a1a2e",
  },

  // Messages
  messagesArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 16px 8px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  myMsgRow: {
    display: "flex",
    justifyContent: "flex-start",
    marginBottom: 2,
  },
  partnerMsgRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: 2,
  },
  avatarSlot: {
    width: 30,
    marginLeft: 6,
    flexShrink: 0,
    alignSelf: "flex-end",
  },
  msgAvatar: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    overflow: "hidden",
    border: "1.5px solid #e0ddf5",
  },
  msgAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  msgAvatarFallback: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#e0ddf5",
    color: "#6366f1",
    fontWeight: 700,
    fontSize: 11,
  },
  bubbleCol: {
    display: "flex",
    flexDirection: "column" as const,
    maxWidth: "70%",
  },
  myBubble: {
    background: "#8b7ba8",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "16px 16px 4px 16px",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  partnerBubble: {
    background: "#f0f0f5",
    color: "#1a1a2e",
    padding: "10px 16px",
    borderRadius: "16px 16px 16px 4px",
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  timestamp: {
    fontSize: 11,
    color: "#bbb",
    marginTop: 2,
    paddingRight: 4,
    paddingLeft: 4,
  },

  // Date separator
  dateSeparator: {
    display: "flex",
    justifyContent: "center",
    margin: "12px 0",
  },
  dateLabel: {
    background: "#e8e6f0",
    color: "#6b6890",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 14px",
    borderRadius: 12,
  },

  // Typing indicator
  typingBubble: {
    background: "#f0f0f5",
    padding: "12px 18px",
    borderRadius: "16px 16px 16px 4px",
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#999",
    display: "inline-block",
  },

  // Welcome
  welcomeContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: 40,
    textAlign: "center" as const,
  },
  welcomeIcon: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "#f0eef8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 8px",
  },
  welcomeText: {
    fontSize: 14,
    color: "#888",
    margin: 0,
    lineHeight: 1.6,
  },

  // Input
  inputArea: {
    padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))",
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
    flexShrink: 0,
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
    resize: "none" as const,
    outline: "none",
    direction: "rtl" as const,
    fontFamily: "inherit",
    lineHeight: 1.5,
    maxHeight: 100,
  },
  sendBtn: {
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: 34,
    height: 34,
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "opacity 0.2s",
  },

  // Report / Block
  reportBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
  },
  reportPanel: {
    padding: "14px 20px",
    background: "#fef2f2",
    borderBottom: "1px solid #fecaca",
    flexShrink: 0,
    direction: "rtl" as const,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#991b1b",
    margin: "0 0 6px",
  },
  reportDesc: {
    fontSize: 13,
    color: "#7f1d1d",
    lineHeight: 1.6,
    margin: "0 0 10px",
  },
  reportTextarea: {
    width: "100%",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontFamily: "inherit",
    resize: "none" as const,
    outline: "none",
    direction: "rtl" as const,
    marginBottom: 10,
    boxSizing: "border-box" as const,
  },
  reportActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 8,
  },
  reportActionBtn: {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  reportCancel: {
    background: "none",
    border: "none",
    color: "#999",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },

  // Block confirmation modal
  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalBox: {
    background: "#fff",
    borderRadius: 16,
    padding: "28px 24px",
    maxWidth: 360,
    width: "90%",
    textAlign: "center" as const,
    direction: "rtl" as const,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 12px",
  },
  modalText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 1.7,
    margin: "0 0 20px",
  },
};
