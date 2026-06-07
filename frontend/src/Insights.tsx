import { useState, useEffect } from "react";

interface InsightsProps {
  user: { id: number; first_name: string; email: string };
  onBack: () => void;
  onOpenChat?: (initialMessage: string, channel: string) => void;
}

// ── Detailed profile from API ──
interface DetailedProfile {
  mbti: {
    type: string | null;
    description: string | null;
    alternateType: string | null;
    alternateDescription: string | null;
    dimensions: {
      extraversion: number | null;
      sensing: number | null;
      intuition: number | null;
      thinking: number | null;
      feeling: number | null;
      judging: number | null;
      perceiving: number | null;
    };
  };
  allValues: { name: string; he: string; score: number; description: string; relationship: string }[];
  allBigFive: { name: string; he: string; score: number; description: string; relationship: string }[];
}

// ── Hebrew model explanations ──
const MBTI_EXPLANATION = "MBTI (Myers-Briggs Type Indicator) הוא מודל אישיות שמחלק אנשים ל-16 טיפוסים על פי 4 ממדים: האם אתה מופנה פנימה או החוצה, איך אתה קולט מידע, איך אתה מקבל החלטות, ואיך אתה מעדיף לתכנן את חייך.";

const SCHWARTZ_EXPLANATION = "מודל הערכים של Schwartz מזהה 11 ערכים אוניברסליים שמנחים את ההתנהגות של כל אדם. הערכים מסודרים במעגל — ערכים סמוכים משתלבים, ערכים מנוגדים עלולים ליצור מתח. בזוגיות, התאמה בערכים מרכזיים מנבאת שביעות רצון גבוהה יותר.";

const BIG_FIVE_EXPLANATION = "מודל חמש התכונות הגדולות (Big Five) הוא המודל המוביל בפסיכולוגיה לתיאור אישיות. כל אדם נמצא על ספקטרום בכל אחד מחמישה ממדים, והשילוב הייחודי שלהם מגדיר את סגנון ההתנהגות, התקשורת והחשיבה.";

const MBTI_RELATIONSHIP: Record<string, string> = {
  E: "מוחצנים מחפשים אינטראקציה ושיתוף, מופנמים זקוקים לזמן לעצמם — הבנה הדדית של הצורך הזה חיונית לזוגיות מוצלחת.",
  I: "מופנמים מעדיפים עומק ושקט, מוחצנים מחפשים גירוי חברתי — כשמכבדים את הצורך של כל אחד, השילוב עובד.",
  S: "חושנים מתמקדים בפרטים ובהווה — הם שמים לב לדברים הקטנים ומביאים יציבות לזוגיות.",
  N: "אינטואיטיביים מתמקדים בתמונה הגדולה ובאפשרויות — הם מביאים חזון והשראה לזוגיות.",
  T: "חושבים מקבלים החלטות לוגיות ואנליטיות — חשוב שבן/בת הזוג יבין שזו דרך לבטא אכפתיות.",
  F: "מרגישים מתחשבים ברגשות ובערכים — הם מביאים חום ורגישות לזוגיות.",
  J: "שופטים אוהבים תוכניות וסדר — זה מביא יציבות, אבל דורש גמישות עם בן/בת זוג ספונטני.",
  P: "תופסים אוהבים גמישות וספונטניות — זה מביא ריגוש, אבל דורש פשרה על ארגון החיים.",
};

function getTraitLevel(score: number): { label: string; color: string } {
  if (score >= 65) return { label: "גבוה", color: "#22c55e" };
  if (score >= 40) return { label: "בינוני", color: "#f59e0b" };
  return { label: "נמוך", color: "#94a3b8" };
}

export default function Insights({ user, onBack, onOpenChat }: InsightsProps) {
  const [profile, setProfile] = useState<DetailedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gender, setGender] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/users/${user.id}/detailed-traits`)
      .then(r => r.json())
      .then((data: DetailedProfile) => setProfile(data))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/users/${user.id}`)
      .then(r => r.json())
      .then(u => { if (u.gender) setGender(u.gender); })
      .catch(() => {});
  }, [user.id]);

  const isFemale = gender === "woman";
  const g = (male: string, female: string) => isFemale ? female : male;

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const hasData = profile && (
    profile.mbti.type ||
    profile.allValues.length > 0 ||
    profile.allBigFive.length > 0
  );

  const strongValues = profile?.allValues.filter(v => v.score > 60) || [];
  const weakValues = profile?.allValues.filter(v => v.score < 40) || [];
  const highBigFive = profile?.allBigFive.filter(v => v.score >= 65) || [];
  const midBigFive = profile?.allBigFive.filter(v => v.score >= 40 && v.score < 65) || [];
  const lowBigFive = profile?.allBigFive.filter(v => v.score < 40) || [];

  function renderDisagreeBubble(text: string) {
    if (!onOpenChat) return null;
    return (
      <button
        style={styles.disagreeBubble}
        onClick={() => onOpenChat(text, "qa_insights")}
      >
        💬 {text}
      </button>
    );
  }

  function renderScoreBar(score: number) {
    return (
      <div style={styles.scoreBarContainer}>
        <div style={{ ...styles.scoreBarFill, width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h2 style={styles.heading}>תובנות על עצמ{g("י", "י")}</h2>

        {loading ? (
          <p style={styles.loading}>טוען...</p>
        ) : !hasData ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>הנתונים {g("שלך", "שלך")} עדיין לא נותחו לעומק במערכת, ולכן עדיין אין תובנות מובנות להציג.</p>
            <p style={styles.emptyText}>בינתיים, {g("אתה יכול", "את יכולה")} לשאול את הצ'אט "מה למדת עליי עד עכשיו?" ולקבל ממנו רשמים ראשוניים על בסיס השיחה.</p>
            <p style={styles.emptySubtext}>{g("המשך", "המשיכי")} לשוחח וברגע שיהיה מספיק מידע, הניתוח ירוץ אוטומטית והתובנות יופיעו כאן.</p>
          </div>
        ) : (
          <>
            {/* ── MBTI Section ── */}
            {profile?.mbti.type && (
              <div style={styles.section}>
                <button style={styles.sectionHeader} onClick={() => toggleSection("mbti")}>
                  <h3 style={styles.sectionTitle}>🧠 טיפוס האישיות {g("שלך", "שלך")} (MBTI)</h3>
                  <span style={styles.chevron}>{expandedSection === "mbti" ? "▾" : "▸"}</span>
                </button>
                <div style={styles.mbtiCard}>
                  <div style={styles.mbtiType}>{profile.mbti.type}</div>
                  {profile.mbti.description && (
                    <p style={styles.mbtiDesc}>{profile.mbti.description}</p>
                  )}
                </div>

                {expandedSection === "mbti" && (
                  <div style={styles.expandedContent}>
                    <div style={styles.modelExplanation}>
                      <p style={styles.explanationTitle}>מהו MBTI?</p>
                      <p style={styles.explanationText}>{MBTI_EXPLANATION}</p>
                    </div>

                    {profile.mbti.alternateType && (
                      <div style={styles.alternateCard}>
                        <p style={styles.alternateTitle}>
                          ייתכן שהטיפוס {g("שלך", "שלך")} הוא גם <strong>{profile.mbti.alternateType}</strong>
                        </p>
                        <p style={styles.alternateText}>
                          המערכת זיהתה ש{g("אתה", "את")} על הגבול בין שני טיפוסים. זה לגמרי תקין — רוב האנשים לא "נופלים" בצורה חדה לקטגוריה אחת.
                        </p>
                        {profile.mbti.alternateDescription && (
                          <p style={styles.alternateDesc}><strong>{profile.mbti.alternateType}</strong>: {profile.mbti.alternateDescription}</p>
                        )}
                      </div>
                    )}

                    <div style={styles.relationshipBlock}>
                      <p style={styles.relationshipTitle}>מה זה אומר בזוגיות?</p>
                      {profile.mbti.type && profile.mbti.type.split("").map((letter, i) => (
                        MBTI_RELATIONSHIP[letter] ? (
                          <p key={i} style={styles.relationshipText}>
                            <strong>{letter}</strong> — {MBTI_RELATIONSHIP[letter]}
                          </p>
                        ) : null
                      ))}
                    </div>

                    {renderDisagreeBubble(`אני לא ${g("בטוח", "בטוחה")} שהניתוח של ה-MBTI ${g("שלי", "שלי")} מדויק`)}
                  </div>
                )}
              </div>
            )}

            {/* ── Schwartz Values Section ── */}
            {(strongValues.length > 0 || weakValues.length > 0) && (
              <div style={styles.section}>
                <button style={styles.sectionHeader} onClick={() => toggleSection("values")}>
                  <h3 style={styles.sectionTitle}>💎 הערכים {g("שלך", "שלך")} (מודל Schwartz)</h3>
                  <span style={styles.chevron}>{expandedSection === "values" ? "▾" : "▸"}</span>
                </button>

                {/* Always show strong values */}
                {strongValues.length > 0 && (
                  <div style={styles.itemsList}>
                    {strongValues.map(v => (
                      <div key={v.name} style={styles.itemCard}>
                        <div style={styles.itemHeader}>
                          <span style={styles.itemName}>{v.he}</span>
                          <span style={styles.itemScore}>{v.score}</span>
                        </div>
                        {renderScoreBar(v.score)}
                        <p style={styles.itemDesc}>{v.description}</p>
                      </div>
                    ))}
                  </div>
                )}

                {expandedSection === "values" && (
                  <div style={styles.expandedContent}>
                    <div style={styles.modelExplanation}>
                      <p style={styles.explanationTitle}>מהו מודל הערכים של Schwartz?</p>
                      <p style={styles.explanationText}>{SCHWARTZ_EXPLANATION}</p>
                    </div>

                    {strongValues.length > 0 && (
                      <div style={styles.relationshipBlock}>
                        <p style={styles.relationshipTitle}>מה הערכים {g("שלך", "שלך")} אומרים על זוגיות?</p>
                        {strongValues.slice(0, 3).map(v => (
                          <p key={v.name} style={styles.relationshipText}>
                            <strong>{v.he}</strong> — {v.relationship}
                          </p>
                        ))}
                      </div>
                    )}

                    {weakValues.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <p style={styles.weakTitle}>ערכים פחות בולטים אצל{g("ך", "ך")}:</p>
                        <div style={styles.weakList}>
                          {weakValues.map(v => (
                            <div key={v.name} style={styles.weakItem}>
                              <span style={styles.weakName}>{v.he}</span>
                              <span style={styles.weakScore}>{v.score}</span>
                            </div>
                          ))}
                        </div>
                        <p style={styles.weakExplanation}>
                          ערכים פחות בולטים לא אומרים שמשהו חסר — פשוט שערכים אחרים מנחים {g("אותך", "אותך")} יותר. במציאת התאמה, אנחנו מתמקדים בעיקר בערכים המובילים {g("שלך", "שלך")}.
                        </p>
                      </div>
                    )}

                    {renderDisagreeBubble(`אני לא ${g("בטוח", "בטוחה")} שניתוח הערכים ${g("שלי", "שלי")} מדויק`)}
                  </div>
                )}
              </div>
            )}

            {/* ── Big Five Section ── */}
            {profile && profile.allBigFive.length > 0 && (
              <div style={styles.section}>
                <button style={styles.sectionHeader} onClick={() => toggleSection("bigfive")}>
                  <h3 style={styles.sectionTitle}>🎭 תכונות אישיות (Big Five)</h3>
                  <span style={styles.chevron}>{expandedSection === "bigfive" ? "▾" : "▸"}</span>
                </button>

                {/* Always show highlights */}
                {highBigFive.length > 0 && (
                  <div style={styles.itemsList}>
                    {highBigFive.map(v => {
                      const level = getTraitLevel(v.score);
                      return (
                        <div key={v.name} style={styles.itemCard}>
                          <div style={styles.itemHeader}>
                            <span style={styles.itemName}>{v.he}</span>
                            <span style={{ ...styles.levelBadge, background: level.color + "22", color: level.color }}>{level.label}</span>
                          </div>
                          {renderScoreBar(v.score)}
                          <p style={styles.itemDesc}>{v.description}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {expandedSection === "bigfive" && (
                  <div style={styles.expandedContent}>
                    <div style={styles.modelExplanation}>
                      <p style={styles.explanationTitle}>מהו מודל Big Five?</p>
                      <p style={styles.explanationText}>{BIG_FIVE_EXPLANATION}</p>
                    </div>

                    {/* Show all traits with levels */}
                    <p style={{ ...styles.relationshipTitle, marginTop: 16 }}>כל התכונות {g("שלך", "שלך")}:</p>
                    <div style={styles.itemsList}>
                      {profile.allBigFive.map(v => {
                        const level = getTraitLevel(v.score);
                        return (
                          <div key={v.name} style={styles.itemCard}>
                            <div style={styles.itemHeader}>
                              <span style={styles.itemName}>{v.he}</span>
                              <span style={{ ...styles.levelBadge, background: level.color + "22", color: level.color }}>{level.label}</span>
                            </div>
                            {renderScoreBar(v.score)}
                            <p style={styles.itemDesc}>{v.description}</p>
                          </div>
                        );
                      })}
                    </div>

                    {(highBigFive.length > 0 || lowBigFive.length > 0) && (
                      <div style={styles.relationshipBlock}>
                        <p style={styles.relationshipTitle}>מה זה אומר בזוגיות?</p>
                        {highBigFive.slice(0, 2).map(v => (
                          <p key={v.name} style={styles.relationshipText}>
                            <strong>{v.he} ({getTraitLevel(v.score).label})</strong> — {v.relationship}
                          </p>
                        ))}
                        {lowBigFive.slice(0, 2).map(v => (
                          <p key={v.name} style={styles.relationshipText}>
                            <strong>{v.he} ({getTraitLevel(v.score).label})</strong> — {v.relationship}
                          </p>
                        ))}
                      </div>
                    )}

                    {renderDisagreeBubble(`אני לא ${g("בטוח", "בטוחה")} שניתוח תכונות האישיות ${g("שלי", "שלי")} מדויק`)}
                  </div>
                )}
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
    maxWidth: 720,
    margin: "0 auto",
    padding: "32px 24px",
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
  emptySubtext: {
    fontSize: 13,
    color: "#aaa",
    lineHeight: 1.5,
    marginTop: 16,
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px 0",
    fontFamily: "inherit",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#333",
    margin: 0,
  },
  chevron: {
    fontSize: 16,
    color: "#999",
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

  // Expanded content
  expandedContent: {
    marginTop: 12,
  },
  modelExplanation: {
    background: "#f0f0ff",
    borderRadius: 10,
    padding: "14px 18px",
    marginBottom: 12,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#4f46e5",
    margin: "0 0 6px 0",
  },
  explanationText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 1.6,
    margin: 0,
  },

  // Alternate MBTI
  alternateCard: {
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 10,
    padding: "14px 18px",
    marginBottom: 12,
  },
  alternateTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#92400e",
    margin: "0 0 6px 0",
  },
  alternateText: {
    fontSize: 13,
    color: "#78716c",
    lineHeight: 1.5,
    margin: "0 0 6px 0",
  },
  alternateDesc: {
    fontSize: 13,
    color: "#78716c",
    lineHeight: 1.5,
    margin: 0,
  },

  // Relationship context
  relationshipBlock: {
    background: "#f0fdf4",
    borderRadius: 10,
    padding: "14px 18px",
    marginTop: 12,
  },
  relationshipTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#166534",
    margin: "0 0 8px 0",
  },
  relationshipText: {
    fontSize: 13,
    color: "#3f6212",
    lineHeight: 1.6,
    margin: "0 0 6px 0",
  },

  // Item cards (values + big five)
  itemsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    marginTop: 8,
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
    marginBottom: 6,
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
    margin: "4px 0 0 0",
  },

  // Score bar
  scoreBarContainer: {
    height: 6,
    background: "#e5e7eb",
    borderRadius: 3,
    marginBottom: 4,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, #818cf8, #6366f1)",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },

  // Level badge
  levelBadge: {
    fontSize: 12,
    fontWeight: 600,
    padding: "2px 10px",
    borderRadius: 12,
  },

  // Weak values
  weakTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#64748b",
    marginBottom: 8,
  },
  weakList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  weakItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#f1f5f9",
    borderRadius: 8,
    padding: "6px 12px",
  },
  weakName: {
    fontSize: 13,
    color: "#64748b",
  },
  weakScore: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: 600,
  },
  weakExplanation: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 1.5,
    marginTop: 10,
  },

  // Disagree bubble
  disagreeBubble: {
    display: "block",
    width: "100%",
    marginTop: 16,
    padding: "12px 16px",
    background: "#fff",
    border: "1px dashed #c7d2fe",
    borderRadius: 12,
    color: "#6366f1",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "right" as const,
    fontFamily: "inherit",
    lineHeight: 1.5,
    transition: "background 0.15s",
  },
};
