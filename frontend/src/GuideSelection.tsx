import { useState } from "react";

export type GuideType = "psychologist" | "coach" | "spiritual_mentor";

interface GuideOption {
  value: GuideType;
  name: string;
  description: string;
  image: string;
  color: string; // accent color for the selected state
}

const GUIDES: GuideOption[] = [
  {
    value: "psychologist",
    name: "הפסיכולוג",
    description: "עמוק, קשוב ומדויק. יעזור לך להבין את עצמך ואת הדפוסים שלך.",
    image: "/pics/guide-psychologist.png",
    color: "#5B6ABF",
  },
  {
    value: "coach",
    name: "הקואצ'רית",
    description: "חדה, ממוקדת ומקדמת. תעזור לך להבין מה את/ה רוצה ואיך להגיע לשם.",
    image: "/pics/guide-coach.png",
    color: "#D4764E",
  },
  {
    value: "spiritual_mentor",
    name: "המנטור הרוחני",
    description: "רגוע, אינטואיטיבי ומלא משמעות. יוביל לשיחה עם עומק וחיבור פנימי.",
    image: "/pics/guide-spiritual-mentor.png",
    color: "#6BA08A",
  },
];

// Guide config registry — ready for future prompt-tone integration
export const GUIDE_CONFIG: Record<GuideType, { name: string; toneSummary: string; style: string }> = {
  psychologist: {
    name: "הפסיכולוג",
    toneSummary: "עמוק, קשוב, אנליטי",
    style: "reflective, empathetic, probing gently into patterns and motivations",
  },
  coach: {
    name: "הקואצ'רית",
    toneSummary: "חדה, ממוקדת, מעודדת",
    style: "direct, action-oriented, energetic, focused on clarity and goals",
  },
  spiritual_mentor: {
    name: "המנטור הרוחני",
    toneSummary: "רגוע, אינטואיטיבי, מלא משמעות",
    style: "calm, intuitive, meaning-focused, exploring deeper connections and purpose",
  },
};

interface Props {
  userName: string;
  onSelect: (guide: GuideType) => void;
  mode?: "first_time" | "returning";  // changes title/subtitle
  previousGuide?: GuideType | null;   // highlight previous guide for returning users
}

export default function GuideSelection({ userName, onSelect, mode = "first_time", previousGuide }: Props) {
  const [selected, setSelected] = useState<GuideType | null>(null);
  const [loading, setLoading] = useState(false);

  const isReturning = mode === "returning";

  return (
    <div style={s.container}>
      <h2 style={s.title}>
        {isReturning ? "עם מי תרצה לדבר הפעם?" : "בחירת מלווה לשיחה"}
      </h2>
      <p style={s.subtitle}>
        {isReturning
          ? `${userName}, אפשר להמשיך עם אותו מלווה או לבחור מלווה אחר לשיחה מזווית קצת שונה.`
          : <>לפני שמתחילים, {userName}, אפשר לבחור את הסגנון שילווה את השיחה.<br />כל מלווה מוביל את השיחה קצת אחרת — ואת/ה יכול/ה לבחור מה מרגיש לך הכי נכון.</>
        }
      </p>

      <div style={s.cardsContainer}>
        {GUIDES.map((g) => {
          const isSelected = selected === g.value;
          return (
            <button
              key={g.value}
              onClick={() => setSelected(g.value)}
              style={{
                ...s.card,
                borderColor: isSelected ? g.color : "#e8e8e8",
                boxShadow: isSelected
                  ? `0 4px 20px ${g.color}30`
                  : "0 2px 8px rgba(0,0,0,0.06)",
                transform: isSelected ? "scale(1.02)" : "scale(1)",
              }}
            >
              {/* Image */}
              <div style={{
                ...s.imageContainer,
                backgroundColor: isSelected ? `${g.color}12` : "#f8f8f8",
              }}>
                <img
                  src={g.image}
                  alt={g.name}
                  style={s.image}
                  onError={(e) => {
                    // Fallback: show emoji if image not found
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.textContent =
                      g.value === "psychologist" ? "🧠"
                      : g.value === "coach" ? "🎯"
                      : "🌿";
                    (e.target as HTMLImageElement).parentElement!.style.fontSize = "48px";
                  }}
                />
              </div>

              {/* Name */}
              <h3 style={{
                ...s.cardName,
                color: isSelected ? g.color : "#1a1a1a",
              }}>
                {g.name}
              </h3>

              {/* Description */}
              <p style={s.cardDesc}>{g.description}</p>

              {/* Selected indicator */}
              {isSelected && (
                <div style={{ ...s.selectedBadge, backgroundColor: g.color }}>
                  נבחר
                </div>
              )}

              {/* "Last used" indicator for returning users */}
              {!isSelected && isReturning && previousGuide === g.value && (
                <div style={{ ...s.selectedBadge, backgroundColor: "#aaa" }}>
                  פעם קודמת
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        disabled={!selected || loading}
        onClick={() => {
          if (!selected) return;
          setLoading(true);
          onSelect(selected);
        }}
        style={{
          ...s.ctaButton,
          opacity: selected ? 1 : 0.4,
          cursor: selected ? "pointer" : "not-allowed",
        }}
      >
        {loading ? "..." : "המשך לשיחה"}
      </button>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    textAlign: "center",
    padding: "20px 0 40px",
    direction: "rtl",
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 8,
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    lineHeight: 1.7,
    marginBottom: 32,
    maxWidth: 440,
    marginLeft: "auto",
    marginRight: "auto",
  },
  cardsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginBottom: 32,
    maxWidth: 400,
    marginLeft: "auto",
    marginRight: "auto",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 20px 20px",
    borderRadius: 16,
    border: "2px solid #e8e8e8",
    background: "#fff",
    cursor: "pointer",
    transition: "all 0.2s ease",
    position: "relative",
    textAlign: "center",
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    overflow: "hidden",
    transition: "background-color 0.2s ease",
  },
  image: {
    width: 60,
    height: 60,
    objectFit: "cover",
    borderRadius: "50%",
  },
  cardName: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 6,
    margin: 0,
    transition: "color 0.2s ease",
  },
  cardDesc: {
    fontSize: 14,
    color: "#666",
    lineHeight: 1.6,
    margin: 0,
  },
  selectedBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    fontSize: 11,
    fontWeight: 600,
    color: "#fff",
    padding: "3px 10px",
    borderRadius: 12,
  },
  ctaButton: {
    padding: "14px 48px",
    fontSize: 16,
    fontWeight: 600,
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    transition: "opacity 0.2s ease",
  },
};
