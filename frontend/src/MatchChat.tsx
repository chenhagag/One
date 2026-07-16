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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    }, 50);
  }, []);

  // Initial load
  useEffect(() => {
    fetch(`/api/users/${user.id}/direct-messages`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages || []);
        setPartnerTyping(data.partner_typing || false);
        setLoaded(true);
        scrollToBottom(false);
        // Mark as read
        if (data.unread_count > 0) {
          fetch(`/api/users/${user.id}/mark-messages-read`, { method: "POST" });
        }
      })
      .catch(() => setLoaded(true));
  }, [user.id, scrollToBottom]);

  // Polling for new messages
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const lastMsg = messages.length > 0 ? messages[messages.length - 1].created_at : undefined;
        const url = lastMsg
          ? `/api/users/${user.id}/direct-messages?since=${encodeURIComponent(lastMsg)}`
          : `/api/users/${user.id}/direct-messages`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.messages && data.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = data.messages.filter((m: Message) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            const merged = [...prev, ...newMsgs];
            // Mark as read
            fetch(`/api/users/${user.id}/mark-messages-read`, { method: "POST" });
            return merged;
          });
          scrollToBottom();
        }
        setPartnerTyping(data.partner_typing || false);
      } catch {
        // ignore
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user.id, messages, scrollToBottom]);

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
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTypingStatus(false), 3000);
    } else {
      sendTypingStatus(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");
    sendTypingStatus(false);

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

  return (
    <div style={styles.container}>
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
        <div style={{ width: 36 }} />
      </div>

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
};
