import { useState, useEffect } from "react";

interface InsightsProps {
  user: { id: number; first_name: string; email: string };
  onBack: () => void;
}

interface TraitData {
  internal_name: string;
  display_name_he: string;
  score: number | null;
  confidence: number | null;
  trait_group: string;
}

// MBTI type descriptions (Hebrew)
const MBTI_DESCRIPTIONS: Record<string, string> = {
  ISTJ: "אחראי, יסודי ומסודר. מעדיף מבנה ברור, עובד בשיטתיות ונאמן למחויבויותיו.",
  ISFJ: "אכפתי, מסור ושקט. מונע מרצון לעזור לאחרים, מעדיף יציבות והרמוניה.",
  INFJ: "אידיאליסט עם תובנות עמוקות. מחפש משמעות, מונע מערכים פנימיים חזקים.",
  INTJ: "אסטרטג עצמאי עם חזון. חושב לטווח ארוך, מעדיף יעילות ולוגיקה.",
  ISTP: "פרקטי ושקט, אוהב להבין איך דברים עובדים. גמיש, מגיב היטב ברגע.",
  ISFP: "רגיש ושקט, חי לפי ערכיו. מעריך אסתטיקה, חופש והרמוניה.",
  INFP: "אידיאליסט רגיש עם עולם פנימי עשיר. מחפש אותנטיות ומשמעות.",
  INTP: "חושב אנליטי וסקרן. אוהב לחקור רעיונות, מעדיף לוגיקה ודיוק.",
  ESTP: "אנרגטי ופרקטי, חי ברגע. אוהב פעולה, הרפתקאות ופתרון בעיות מהיר.",
  ESFP: "ספונטני, חברותי ומלא חיים. אוהב להיות במרכז, נהנה מחוויות חדשות.",
  ENFP: "נלהב, יצירתי ואופטימי. רואה אפשרויות בכל מקום, מחבר בין אנשים ורעיונות.",
  ENTP: "ממציא ודיאלקטיקן. אוהב אתגרים אינטלקטואליים, יצירתי ולא קונבנציונלי.",
  ESTJ: "מנהיג מעשי ומאורגן. מעדיף סדר, כללים ברורים ויעילות.",
  ESFJ: "חברותי ואכפתי, מתאמץ למען אחרים. מעריך הרמוניה וקשרים חברתיים.",
  ENFJ: "מנהיג כריזמטי ואמפתי. מעורר השראה, מתמקד באנשים ובפוטנציאל שלהם.",
  ENTJ: "מנהיג החלטי ואסטרטגי. מוביל בביטחון, ממוקד ביעילות ובהישגים.",
};

// Schwartz value descriptions
const VALUE_DESCRIPTIONS: Record<string, string> = {
  hedonism: "חיפוש הנאה, סיפוק חושים ותענוגות החיים",
  achievement: "שאיפה להצלחה אישית ומומחיות מקצועית",
  power: "חיפוש מעמד, השפעה ושליטה",
  self_direction: "עצמאות במחשבה ובפעולה, חקירה ויצירה",
  stimulation: "חיפוש התרגשות, חידוש ואתגרים",
  security: "חיפוש יציבות, ביטחון והרמוניה",
  conformity: "כיבוד כללים, נורמות וציפיות חברתיות",
  tradition: "כבוד למסורת, מנהגים וערכי העבר",
  benevolence: "דאגה לרווחת הקרובים, נאמנות ועזרה",
  universalism: "הבנה, סובלנות והגנה על כל האנשים והטבע",
  spirituality: "חיפוש משמעות רוחנית מעבר לחומרי",
};

// Big Five trait descriptions
const BIG_FIVE_DESCRIPTIONS: Record<string, { he: string; desc: string }> = {
  extraversion: { he: "מוחצנות", desc: "אנרגיה חברתית, חיפוש אינטראקציות, אסרטיביות וחיוניות" },
  conscientiousness: { he: "מצפוניות", desc: "סדר, משמעת עצמית, אחריות ותכנון קדימה" },
  agreeableness: { he: "נעימות", desc: "אמפתיה, שיתוף פעולה, אמון באנשים ונדיבות" },
  openness_to_experience: { he: "פתיחות לחוויות", desc: "סקרנות, יצירתיות, העדפת גיוון ופתיחות לרעיונות חדשים" },
};

// Schwartz value Hebrew labels
const VALUE_LABELS: Record<string, string> = {
  hedonism: "נהנתנות",
  achievement: "הישגיות",
  power: "כוח",
  self_direction: "עצמאות",
  stimulation: "גירוי",
  security: "ביטחון",
  conformity: "ציות",
  tradition: "מסורת",
  benevolence: "נדיבות",
  universalism: "אוניברסליות",
  spirituality: "רוחניות",
};

export default function Insights({ user, onBack }: InsightsProps) {
  const [traits, setTraits] = useState<TraitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [gender, setGender] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/traits`)
      .then(r => r.json())
      .then((data: any[]) => {
        setTraits(data.map(t => ({
          internal_name: t.internal_name,
          display_name_he: t.display_name_he,
          score: t.score,
          confidence: t.confidence,
          trait_group: t.trait_group || "",
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/users/${user.id}`)
      .then(r => r.json())
      .then(u => { if (u.gender) setGender(u.gender); })
      .catch(() => {});
  }, [user.id]);

  // Gendered text helper
  const isFemale = gender === "woman";
  const g = (male: string, female: string) => isFemale ? female : male;

  const getTrait = (name: string) => traits.find(t => t.internal_name === name);
  const getScore = (name: string) => getTrait(name)?.score ?? null;

  // MBTI type computation (same logic as AdminView)
  const mbtiType = (() => {
    const ext = getScore("extraversion");
    const sen = getScore("sensing");
    const int_ = getScore("intuition");
    const thi = getScore("thinking");
    const fee = getScore("feeling");
    const jud = getScore("judging");
    const per = getScore("perceiving");

    if (!sen && !int_ && !thi && !fee && !jud && !per) return null;

    const a1 = ext == null ? "X" : ext > 50 ? "E" : ext < 50 ? "I" : "E";
    const a2 = (!sen && !int_) ? "X" : !sen ? "N" : !int_ ? "S" :
      sen > int_ ? "S" : sen < int_ ? "N" : "S";
    const a3 = (!thi && !fee) ? "X" : !thi ? "F" : !fee ? "T" :
      (() => { const adjT = thi + 10; return adjT > fee ? "T" : adjT < fee ? "F" : "T"; })();
    const a4 = (!jud && !per) ? "X" : !jud ? "P" : !per ? "J" :
      jud > per ? "J" : jud < per ? "P" : "J";

    return a1 + a2 + a3 + a4;
  })();

  // Strong Schwartz values (score > 60)
  const schwartzNames = [
    "hedonism", "achievement", "power", "self_direction", "stimulation",
    "security", "conformity", "tradition", "benevolence", "universalism", "spirituality",
  ];
  const strongValues = schwartzNames
    .map(name => ({ name, score: getScore(name) }))
    .filter(v => v.score != null && v.score > 60)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Big Five highlights (score > 60, exclude neuroticism)
  const bigFiveNames = ["extraversion", "conscientiousness", "agreeableness", "openness_to_experience"];
  const bigFiveHighlights = bigFiveNames
    .map(name => ({ name, score: getScore(name) }))
    .filter(v => v.score != null && v.score > 60)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const hasData = mbtiType || strongValues.length > 0 || bigFiveHighlights.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <button onClick={onBack} style={styles.backBtn}>→ חזרה</button>
        <h2 style={styles.heading}>תובנות על עצמ{g("י", "י")}</h2>

        {loading ? (
          <p style={styles.loading}>טוען...</p>
        ) : !hasData ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>עדיין אין מספיק נתונים כדי להציג תובנות.</p>
            <p style={styles.emptyText}>{g("המשך", "המשיכי")} לשוחח ונוכל ללמוד {g("עליך", "עלייך")} יותר.</p>
          </div>
        ) : (
          <>
            {/* MBTI */}
            {mbtiType && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>טיפוס האישיות {g("שלך", "שלך")}</h3>
                <div style={styles.mbtiCard}>
                  <div style={styles.mbtiType}>{mbtiType}</div>
                  {MBTI_DESCRIPTIONS[mbtiType] && (
                    <p style={styles.mbtiDesc}>{MBTI_DESCRIPTIONS[mbtiType]}</p>
                  )}
                </div>
              </div>
            )}

            {/* Schwartz Values */}
            {strongValues.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>הערכים המרכזיים {g("שלך", "שלך")} (לפי מודל הערכים של Schwartz)</h3>
                <div style={styles.itemsList}>
                  {strongValues.map(v => (
                    <div key={v.name} style={styles.itemCard}>
                      <div style={styles.itemHeader}>
                        <span style={styles.itemName}>{VALUE_LABELS[v.name] || v.name}</span>
                        <span style={styles.itemScore}>{v.score}</span>
                      </div>
                      {VALUE_DESCRIPTIONS[v.name] && (
                        <p style={styles.itemDesc}>{VALUE_DESCRIPTIONS[v.name]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Big Five */}
            {bigFiveHighlights.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>תכונות אישיות בולטות (לפי מודל ה-Big Five)</h3>
                <div style={styles.itemsList}>
                  {bigFiveHighlights.map(v => {
                    const info = BIG_FIVE_DESCRIPTIONS[v.name];
                    return (
                      <div key={v.name} style={styles.itemCard}>
                        <div style={styles.itemHeader}>
                          <span style={styles.itemName}>{info?.he || v.name}</span>
                          <span style={styles.itemScore}>{v.score}</span>
                        </div>
                        {info && <p style={styles.itemDesc}>{info.desc}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    direction: "rtl",
    background: "#f9fafb",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', 'Arial', sans-serif",
  },
  content: {
    maxWidth: 600,
    margin: "0 auto",
    padding: "32px 24px",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#6366f1",
    fontSize: 14,
    cursor: "pointer",
    padding: "4px 0",
    marginBottom: 16,
    fontFamily: "inherit",
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1a1a2e",
    marginTop: 0,
    marginBottom: 24,
  },
  loading: { color: "#888", fontSize: 14 },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
  },
  emptyText: {
    fontSize: 15,
    color: "#888",
    lineHeight: 1.6,
    margin: "4px 0",
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#333",
    marginBottom: 12,
    marginTop: 0,
  },

  // MBTI
  mbtiCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "20px 24px",
    textAlign: "center",
  },
  mbtiType: {
    fontSize: 36,
    fontWeight: 800,
    color: "#6366f1",
    letterSpacing: 4,
    marginBottom: 10,
  },
  mbtiDesc: {
    fontSize: 14,
    color: "#555",
    lineHeight: 1.7,
    margin: 0,
  },

  // Item cards (values + big five)
  itemsList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  itemCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "14px 18px",
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1a1a2e",
  },
  itemScore: {
    fontSize: 14,
    fontWeight: 700,
    color: "#6366f1",
    background: "#f0f0ff",
    padding: "2px 10px",
    borderRadius: 12,
  },
  itemDesc: {
    fontSize: 13,
    color: "#777",
    lineHeight: 1.5,
    margin: 0,
  },
};
