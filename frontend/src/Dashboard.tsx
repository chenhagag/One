import { Fingerprint, MessageCircleHeart, FlaskConical, Compass, Lock, Check } from "lucide-react";

interface DashboardCard {
  key: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  progress: number; // 0-100
  status: "completed" | "available" | "locked";
  accentColor: string;
}

interface Props {
  userName: string;
  onNavigate: (cardKey: string) => void;
}

export default function Dashboard({ userName, onNavigate }: Props) {
  const cards: DashboardCard[] = [
    {
      key: "identity",
      title: "תעודת זהות",
      icon: <Fingerprint size={28} />,
      progress: 100,
      status: "completed",
      accentColor: "#A78BFA",
    },
    {
      key: "deep_chat",
      title: "שיחת עומק",
      description: "שיחה חופשית על מה שחשוב לך באמת, על ערכים ועל מה שבלב.",
      icon: <MessageCircleHeart size={28} />,
      progress: 0,
      status: "available",
      accentColor: "#818CF8",
    },
    {
      key: "personality_lab",
      title: "מעבדת האישיות",
      description: "מבדק אקטיבי של סימולציות ודילמות כדי להבין את ה-DNA שלך.",
      icon: <FlaskConical size={28} />,
      progress: 0,
      status: "available",
      accentColor: "#6366F1",
    },
    {
      key: "partner_compass",
      title: "המצפן הזוגי",
      description: "מה מושך אותך? בחירה מהירה של סגנונות, תמונות ואנרגיות.",
      icon: <Compass size={28} />,
      progress: 0,
      status: "locked",
      accentColor: "#C084FC",
    },
  ];

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>המסע שלך מתחיל כאן</h1>
        <p style={s.subtitle}>
          היי {userName}, כל שלב מקרב אותך להתאמה המושלמת
        </p>
      </div>

      {/* Cards */}
      <div style={s.cardsGrid}>
        {cards.map((card) => {
          const isClickable = card.status !== "locked";
          return (
            <button
              key={card.key}
              onClick={() => isClickable && onNavigate(card.key)}
              disabled={!isClickable}
              style={{
                ...s.card,
                cursor: isClickable ? "pointer" : "default",
                opacity: card.status === "locked" ? 0.5 : 1,
                borderColor: card.status === "completed" ? card.accentColor + "60" : "#2a2a3e",
              }}
            >
              {/* Icon + Status badge */}
              <div style={s.cardTop}>
                <div style={{
                  ...s.iconWrap,
                  background: card.accentColor + "18",
                  color: card.accentColor,
                }}>
                  {card.icon}
                </div>
                {card.status === "completed" && (
                  <div style={{ ...s.statusBadge, background: "#10B981" }}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
                {card.status === "locked" && (
                  <div style={{ ...s.statusBadge, background: "#4B5563" }}>
                    <Lock size={12} />
                  </div>
                )}
              </div>

              {/* Title */}
              <h3 style={s.cardTitle}>{card.title}</h3>

              {/* Description */}
              {card.description && (
                <p style={s.cardDesc}>{card.description}</p>
              )}

              {/* Progress bar */}
              <div style={s.progressTrack}>
                <div style={{
                  ...s.progressFill,
                  width: `${card.progress}%`,
                  background: card.progress === 100
                    ? "#10B981"
                    : `linear-gradient(90deg, ${card.accentColor}, ${card.accentColor}99)`,
                }} />
              </div>
              <span style={s.progressLabel}>
                {card.progress === 100 ? "הושלם" : card.status === "locked" ? "בקרוב" : "טרם הושלם"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Dark premium styles ──────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "80vh",
    background: "linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)",
    borderRadius: 20,
    padding: "40px 24px",
    color: "#e2e8f0",
    direction: "rtl",
  },
  header: {
    textAlign: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    background: "linear-gradient(135deg, #C084FC, #818CF8, #A78BFA)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: "0.5px",
  },
  subtitle: {
    fontSize: 15,
    color: "#94a3b8",
    marginTop: 10,
    marginBottom: 0,
  },
  cardsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 420,
    margin: "0 auto",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    padding: "20px",
    borderRadius: 16,
    border: "1px solid #2a2a3e",
    background: "rgba(26, 26, 46, 0.7)",
    backdropFilter: "blur(10px)",
    textAlign: "right",
    fontFamily: "inherit",
    outline: "none",
    transition: "all 0.25s ease",
    width: "100%",
    boxSizing: "border-box",
    color: "#e2e8f0",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 600,
    margin: "0 0 6px",
    color: "#f1f5f9",
  },
  cardDesc: {
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 1.6,
    margin: "0 0 14px",
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    background: "#2a2a3e",
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.5s ease",
  },
  progressLabel: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 6,
    display: "block",
  },
};
