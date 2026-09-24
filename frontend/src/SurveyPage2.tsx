import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "./lib/api";

interface SurveyPage2Props {
  userId: number;
  onBack: () => void;
}

// ── Survey 2 question definitions ──

type QuestionType = "single" | "multi" | "open";

interface SurveyQuestion {
  id: number;
  title: string;
  subtitle?: string;
  smallSubtitle?: string; // rendered smaller than subtitle
  introText?: string; // longer intro paragraph before the question area
  type: QuestionType;
  options?: string[];
  hasOther?: boolean;
  freeTextLabel?: string;
  conditionalTextOn?: number[];
  conditionalTextLabel?: string;
  belowTextareaNote?: string;
  belowTextareaHint?: string;
}

const QUESTIONS_PART1: SurveyQuestion[] = [
  {
    id: 1,
    title: "איפה את מחפשת היום היכרויות, אם בכלל?",
    subtitle: "אפשר לבחור כמה תשובות",
    type: "multi",
    options: [
      "אפליקציות היכרויות",
      "קבוצות / קהילות בפייסבוק או ברשתות אחרות",
      "אינסטגרם / רשתות חברתיות",
      "אירועים ומפגשים בקהילה",
      "דרך חברות / היכרויות מהחיים",
      "כרגע אני לא מחפשת במקומות אחרים",
    ],
    hasOther: true,
    conditionalTextOn: [0],
    conditionalTextLabel: "באילו אפליקציות את משתמשת היום או השתמשת לאחרונה?",
  },
  {
    id: 2,
    title: "מה הכי חסר לך או מתסכל אותך בדרכים שבהן את מכירה היום?",
    smallSubtitle: "יכול להיות משהו באפליקציות עצמן, בכמות או בסוג הנשים שאת פוגשת, בשיחות, במאצ'ים, בפרטיות, בתחושת הקהילה — או כל דבר אחר.",
    type: "open",
  },
  {
    id: 3,
    title: "עד כמה הרגשת ש-One הצליחה להבין אותך ואת מה שאת מחפשת?",
    type: "single",
    options: [
      "מאוד",
      "די הרבה",
      "באופן חלקי",
      "לא כל כך",
      "בכלל לא",
    ],
    freeTextLabel: "מה הרגשת שהיא הבינה טוב במיוחד, ומה היא עדיין לא קלטה מספיק?",
  },
  {
    id: 4,
    title: "האם היה משהו בשיחה עם One שהרגשת שחסר דווקא כאישה שמחפשת אישה?",
    smallSubtitle: "נושא שלא שאלנו עליו, ניואנס שלא קיבל מספיק מקום, משהו שחשוב בהיכרויות בין נשים או משהו שפשוט גרם לחוויה להרגיש כללית מדי.",
    type: "open",
  },
  {
    id: 5,
    title: "האם יש משהו שהיה גורם לך להרגיש יותר בבית בתוך One?",
    smallSubtitle: "זה יכול להיות קשור לשפה, לעיצוב, לפרטיות, לאופן שבו ההתאמות מוצגות, לתחושת קהילה, לפיצ'רים — או למשהו אחר לגמרי.",
    type: "open",
  },
];

const QUESTIONS_PART2: SurveyQuestion[] = [
  {
    id: 6,
    title: "עזרה גם אחרי שכבר נמצאה התאמה",
    introText: "חלק מהמשתמשות שכבר קיבלו התאמה סיפרו שהשלב שאחריה מרגיש לפעמים קצת תקוע: מקבלות כרטיס שמסביר למה ההתאמה נראית מעניינת, מתחילות לדבר - ואז השיחה מתקדמת לאט או נעצרת.\n\nאנחנו חושבות על האפשרות ש-One תמשיך לעזור גם בשלב הזה.",
    type: "open",
    freeTextLabel: "האם זה משהו שהיית רוצה? ואם כן — איך היית רוצה ש-One תוכל לעזור?",
    belowTextareaNote: "גם אם עוד לא קיבלת התאמה, נשמח לשמוע מה היית רוצה שיקרה כשזה יגיע",
    belowTextareaHint: "למשל דברים כשכבר התחלנו ליישם- סיוע מOne לעבור לשיחת טלפון, לקבוע דייט, להעביר מספרים אם שתיכן רוצות, לעזור להניע שיחה שנתקעה - או משהו אחר.",
  },
  {
    id: 7,
    title: "התאמה עיוורת",
    subtitle: "שמנו לב שלא מעט משתמשות בוחרות לא להעלות תמונה, וחלקן גם אמרו שהיו פתוחות לרעיון של התאמה עיוורת - התאמה שמבוססת על החיבור האישיותי, בלי לבדוק תמונות מראש.\n\nהאם זו אפשרות שהיית רוצה שתהיה ב-One?",
    type: "single",
    options: [
      "כן, הייתי רוצה לקבל התאמות כאלה, מעדיפה לא להעלות תמונה",
      "אולי - אם יש התאמה טובה עם מישהי שלא העלתה תמונה",
      "לא, חשוב לי לראות תמונה לפני התאמה",
      "לא בטוחה",
    ],
    freeTextLabel: "נשמח לשמוע קצת במילים מה את חושבת על זה",
  },
  {
    id: 8,
    title: "להימנע מאקסיות ומנשים שאת כבר מכירה",
    subtitle: "כמה משתמשות העלו חשש להיתקל כאן באקסית או במישהי אחרת שהן לא רוצות לקבל כהתאמה.\n\nכבר היום One לא חושפת פרופילים סתם כך, ולפני התאמה אפשר לפסול אם את מזהה מישהי שאת מכירה. אבל אנחנו יכולות גם לחשוב על דרך לסנן מראש - למשל לאפשר לך לספר ל-One על מישהי שאת לא רוצה לקבל, כדי שהמערכת תדע לזהות אותה אם היא עולה כמועמדת.\n\nעד כמה אפשרות כזאת חשובה לך?",
    type: "single",
    options: [
      "מאוד חשובה",
      "די חשובה",
      "נחמד שתהיה, אבל לא קריטית",
      "לא חשובה לי",
      "בכלל לא רלוונטית עבורי",
    ],
    freeTextLabel: "מוזמנת גם לפרט על הנושא",
  },
  {
    id: 9,
    title: "אם היית יכולה לשנות או להוסיף עכשיו דבר אחד ב-One - מה זה היה?",
    subtitle: "מוזמנות להתפרע כאן ברעיונות :) גם אם זה נשמע לכן לא אפשרי - מוזמנות להעלות ואנחנו כבר נחשוב על איך ליישם..",
    type: "open",
  },
  {
    id: 10,
    title: "אם כבר קיבלת התאמה דרך One - איך היא הרגישה לך?",
    type: "single",
    options: [
      "הרגישה מאוד רלוונטית",
      "הרגישה די רלוונטית",
      "היו בה דברים מדויקים וגם פערים משמעותיים",
      "לא הרגישה לי מתאימה",
      "עוד לא קיבלתי התאמה",
    ],
    conditionalTextOn: [0, 1, 2, 3],
    conditionalTextLabel: "נשמח לשמוע קצת יותר — מה הרגיש מדויק, ומה פחות? מה חשבת על כרטיס ההתאמה?",
  },
  {
    id: 11,
    title: "מה את הכי אוהבת ברעיון או בחוויה של One?",
    smallSubtitle: "מה גורם לך לחשוב שיש פה משהו ששווה להמשיך איתו? החיפוש שעובד בשבילך, הסינון, השיחה עם One, התובנות, צורת ההתאמה, ההסבר שמגיע איתה — או אולי משהו אחר שלא חשבנו עליו.",
    type: "open",
  },
];

const QUESTIONS_PART3: SurveyQuestion[] = [
  {
    id: 12,
    title: "יש לך רעיונות למקומות, נשים, קהילות או דרכים שיכולות לעזור לנו להגיע לעוד נשים שמחפשות נשים?",
    type: "open",
  },
  {
    id: 13,
    title: "והאם היית רוצה לעזור לנו להפיץ את One?",
    type: "single",
    options: [
      "כן, בשמחה",
      "אולי - אפשר לפנות אליי כשיהיה משהו קונקרטי",
      "כרגע לא",
    ],
    conditionalTextOn: [0, 1],
    conditionalTextLabel: "איך היית מרגישה בנוח לעזור? נשמח לכל סיוע :)",
  },
];

const ALL_QUESTIONS = [...QUESTIONS_PART1, ...QUESTIONS_PART2, ...QUESTIONS_PART3];

interface QuestionResponse {
  selected?: number[];
  text?: string;
  otherText?: string;
}

type Responses = Record<string, QuestionResponse>;

export default function SurveyPage2({ userId, onBack }: SurveyPage2Props) {
  const [responses, setResponses] = useState<Responses>({});
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing responses
  useEffect(() => {
    apiFetch("/survey2/my-response")
      .then(r => r.json())
      .then(data => {
        if (data.completed) {
          setCompleted(true);
        }
        if (data.responses && Object.keys(data.responses).length > 0) {
          setResponses(data.responses);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateResponse = useCallback((qId: number, update: Partial<QuestionResponse>) => {
    setResponses(prev => {
      const key = String(qId);
      const current = prev[key] || {};
      return { ...prev, [key]: { ...current, ...update } };
    });
  }, []);

  const toggleOption = useCallback((qId: number, optionIdx: number, isMulti: boolean) => {
    setResponses(prev => {
      const key = String(qId);
      const current = prev[key] || {};
      const selected = current.selected || [];

      let newSelected: number[];
      if (isMulti) {
        newSelected = selected.includes(optionIdx)
          ? selected.filter(i => i !== optionIdx)
          : [...selected, optionIdx];
      } else {
        newSelected = [optionIdx];
      }
      return { ...prev, [key]: { ...current, selected: newSelected } };
    });
  }, []);

  const autoSave = useCallback(async (allResponses: Responses) => {
    try {
      await apiFetch("/survey2/response", {
        method: "POST",
        body: JSON.stringify({ responses: allResponses, completed: false }),
      });
    } catch {}
  }, []);

  // Auto-save on response changes (debounced)
  useEffect(() => {
    if (loading || completed) return;
    const timeout = setTimeout(() => {
      autoSave(responses);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [responses, loading, completed, autoSave]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/survey2/response", {
        method: "POST",
        body: JSON.stringify({ responses, completed: true }),
      });
      const data = await res.json();
      console.log("[survey2 submit] status:", res.status, "data:", data);
      if (data.ok || data.already_completed) {
        setCompleted(true);
      }
    } catch (err) {
      console.error("[survey2 submit] error:", err);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <p style={{ textAlign: "center", color: "#999" }}>טוען...</p>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🩶</div>
            <h2 style={{ color: "#1B1464", fontSize: 22, marginBottom: 12 }}>תודה רבה!</h2>
            <p style={{ color: "#555", fontSize: 15, lineHeight: 1.8, marginBottom: 8 }}>
              תודה רבה על הפידבק!
            </p>
            <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
              נשמח מאוד שתעקבו אחרינו בפייסבוק ובאינסטגרם - זה עוזר מאוד בהפצה לנשים רלוונטיות ויעזור לנו לצבור קהילה ולתת לכן התאמות מדויקות וטובות יותר
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 24 }}>
              <a
                href="https://www.facebook.com/profile.php?id=61594271867980"
                target="_blank"
                rel="noopener noreferrer"
                style={socialLinkStyle}
              >
                Facebook
              </a>
              <a
                href="https://www.instagram.com/joinone.oneapp"
                target="_blank"
                rel="noopener noreferrer"
                style={socialLinkStyle}
              >
                Instagram
              </a>
            </div>
            <button onClick={onBack} style={backBtnStyle}>
              חזרה למסך הראשי
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderQuestion = (q: SurveyQuestion) => {
    const resp = responses[String(q.id)] || {};
    const selected = resp.selected || [];
    const showConditionalText = q.conditionalTextOn
      ? q.conditionalTextOn.some(idx => selected.includes(idx))
      : false;

    return (
      <div key={q.id} style={questionBlockStyle}>
        <h3 style={questionTitleStyle}>
          <span style={questionNumberStyle}>{q.id}</span>
          {q.title}
        </h3>
        {q.introText && (
          <p style={subtitleStyle}>{q.introText}</p>
        )}
        {q.subtitle && (
          <p style={subtitleStyle}>{q.subtitle}</p>
        )}
        {q.smallSubtitle && (
          <p style={smallSubtitleStyle}>{q.smallSubtitle}</p>
        )}

        {/* Open text only questions */}
        {q.type === "open" && !q.freeTextLabel && (
          <textarea
            value={resp.text || ""}
            onChange={(e) => updateResponse(q.id, { text: e.target.value })}
            style={textareaStyle}
            rows={4}
            placeholder="שתפו אותנו..."
          />
        )}

        {/* Open text with label (e.g. Q6) */}
        {q.type === "open" && q.freeTextLabel && (
          <div>
            <label style={freeTextLabelStyle}>{q.freeTextLabel}</label>
            <textarea
              value={resp.text || ""}
              onChange={(e) => updateResponse(q.id, { text: e.target.value })}
              style={textareaStyle}
              rows={4}
              placeholder="שתפו אותנו..."
            />
          </div>
        )}

        {q.belowTextareaNote && (
          <p style={{ fontSize: 12, color: "#888", lineHeight: 1.6, margin: "8px 0 4px" }}>
            {q.belowTextareaNote}
          </p>
        )}
        {q.belowTextareaHint && (
          <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.6, margin: "4px 0 0" }}>
            {q.belowTextareaHint}
          </p>
        )}

        {/* Options for single/multi */}
        {(q.type === "single" || q.type === "multi") && q.options && (
          <>
            {q.type === "multi" && !q.subtitle && (
              <p style={{ fontSize: 12, color: "#999", margin: "0 0 10px" }}>אפשר לבחור כמה תשובות</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {q.options.map((opt, idx) => {
                const isSelected = selected.includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => toggleOption(q.id, idx, q.type === "multi")}
                    style={{
                      ...optionBtnStyle,
                      background: isSelected ? "#f0eef8" : "#fff",
                      borderColor: isSelected ? "#7b5fa3" : "#e5e7eb",
                      color: isSelected ? "#5b4a8a" : "#333",
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {q.type === "multi" && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? "#7b5fa3" : "#ccc"}`,
                        marginLeft: 8, flexShrink: 0, background: isSelected ? "#7b5fa3" : "transparent",
                        color: "#fff", fontSize: 12,
                      }}>
                        {isSelected && "\u2713"}
                      </span>
                    )}
                    {q.type === "single" && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 18, height: 18, borderRadius: "50%", border: `2px solid ${isSelected ? "#7b5fa3" : "#ccc"}`,
                        marginLeft: 8, flexShrink: 0,
                      }}>
                        {isSelected && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#7b5fa3" }} />}
                      </span>
                    )}
                    {opt}
                  </button>
                );
              })}

              {/* "Other" option for multi-select */}
              {q.hasOther && (() => {
                const otherIdx = q.options!.length;
                const isOtherSelected = selected.includes(otherIdx);
                return (
                  <>
                    <button
                      onClick={() => toggleOption(q.id, otherIdx, true)}
                      style={{
                        ...optionBtnStyle,
                        background: isOtherSelected ? "#f0eef8" : "#fff",
                        borderColor: isOtherSelected ? "#7b5fa3" : "#e5e7eb",
                        color: isOtherSelected ? "#5b4a8a" : "#333",
                        fontWeight: isOtherSelected ? 600 : 400,
                      }}
                    >
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 18, height: 18, borderRadius: 4, border: `2px solid ${isOtherSelected ? "#7b5fa3" : "#ccc"}`,
                        marginLeft: 8, flexShrink: 0, background: isOtherSelected ? "#7b5fa3" : "transparent",
                        color: "#fff", fontSize: 12,
                      }}>
                        {isOtherSelected && "\u2713"}
                      </span>
                      אחר
                    </button>
                    {isOtherSelected && (
                      <textarea
                        value={resp.otherText || ""}
                        onChange={(e) => updateResponse(q.id, { otherText: e.target.value })}
                        placeholder="פרטי..."
                        style={textareaStyle}
                        rows={2}
                      />
                    )}
                  </>
                );
              })()}
            </div>

            {/* Conditional text field */}
            {q.conditionalTextOn && showConditionalText && q.conditionalTextLabel && (
              <div style={{ marginTop: 12 }}>
                <label style={freeTextLabelStyle}>{q.conditionalTextLabel}</label>
                <textarea
                  value={resp.text || ""}
                  onChange={(e) => updateResponse(q.id, { text: e.target.value })}
                  style={textareaStyle}
                  rows={3}
                />
              </div>
            )}

            {/* Free text field (always visible, non-conditional) */}
            {q.freeTextLabel && !q.conditionalTextOn && (
              <div style={{ marginTop: 12 }}>
                <label style={freeTextLabelStyle}>{q.freeTextLabel}</label>
                <textarea
                  value={resp.text || ""}
                  onChange={(e) => updateResponse(q.id, { text: e.target.value })}
                  style={textareaStyle}
                  rows={3}
                />
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/iconOnly.png" alt="One" style={{ width: 48, height: 48, marginBottom: 12 }} />
          <h1 style={{ color: "#1B1464", fontSize: 22, margin: "0 0 16px", fontWeight: 700 }}>
            סקר משתמשות One
          </h1>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "0 0 8px" }}>
            לפני שאנחנו משיקות ומרחיבות משמעותית את המאגר, אנחנו רוצות להבין מה עובד לכן כבר היום ובעיקר מה צריך להיות שונה כדי ש-One תרגיש באמת מותאמת לקהילה.
          </p>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "0 0 8px" }}>
            חלק מהשאלות כבר הופיעו בסקר הקודם. אנחנו שואלות אותן שוב כי עכשיו הן יעזרו לנו לקבל החלטות על המוצר והשיווק של One לקראת ההשקה, כמובן מוזמנות לדלג למי שענתה :)
          </p>
          <p style={{ color: "#888", fontSize: 13, lineHeight: 1.7, margin: "12px 0 0" }}>
            נשמח אם תענו על כל השאלות, אבל שום שאלה היא לא חובה — כל תשובה, גם חלקית, תעזור לנו.
          </p>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "12px 0 0" }}>
            תודה מראש לכל המשתתפות 🩶
          </p>
        </div>

        {/* Questions 1-5 */}
        {QUESTIONS_PART1.map(renderQuestion)}

        {/* Section divider */}
        <div style={sectionDividerStyle}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#1B1464", margin: "0 0 8px" }}>
            כמה דברים שעלו ממשתמשות הבטא שלנו
          </p>
          <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.7 }}>
            עלו לנו כמה רעיונות וצרכים ממשתמשות, ואנחנו רוצות להבין אם גם אתן מתחברות אליהם
          </p>
        </div>

        {/* Questions 6-11 */}
        {QUESTIONS_PART2.map(renderQuestion)}

        {/* Section divider 2 */}
        <div style={sectionDividerStyle}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#1B1464", margin: "0 0 8px" }}>
            ובקשה מאיתנו 🩶
          </p>
          <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.7 }}>
            אנחנו עומדות להתחיל להפיץ את One בצורה רחבה יותר בתוך הקהילה, ונשמח מאוד לעזרה שלכן.
          </p>
        </div>

        {/* Questions 12-13 */}
        {QUESTIONS_PART3.map(renderQuestion)}

        {/* Submit */}
        <div style={{ textAlign: "center", padding: "24px 0 40px" }}>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              background: "#7b5fa3", color: "#fff", border: "none", borderRadius: 10,
              padding: "14px 48px", fontSize: 16, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "שולחת..." : "שליחת הסקר"}
          </button>
          <p style={{ fontSize: 12, color: "#aaa", marginTop: 8 }}>
            התשובות נשמרות אוטומטית, אפשר לחזור ולהשלים מאוחר יותר.
          </p>
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", paddingBottom: 32 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#999", fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
            חזרה למסך הראשי
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "#f8f7fc",
  direction: "rtl",
  overflowY: "auto",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 600,
  margin: "0 auto",
  padding: "32px 20px",
};

const questionBlockStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "20px 20px 18px",
  marginBottom: 16,
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  border: "1px solid #f0eef5",
};

const questionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#1a1a2e",
  fontWeight: 600,
  lineHeight: 1.7,
  margin: "0 0 12px",
  display: "flex",
  gap: 8,
};

const questionNumberStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "#7b5fa3",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  flexShrink: 0,
  marginTop: 1,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#777",
  lineHeight: 1.7,
  margin: "0 0 12px",
  whiteSpace: "pre-line",
};

const smallSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  lineHeight: 1.7,
  margin: "0 0 12px",
  whiteSpace: "pre-line",
};

const optionBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  textAlign: "right",
  padding: "10px 16px",
  borderRadius: 10,
  border: "1.5px solid #e5e7eb",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: "inherit",
  transition: "all 0.15s",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #e5e7eb",
  fontSize: 14,
  fontFamily: "inherit",
  resize: "vertical",
  lineHeight: 1.6,
  outline: "none",
  boxSizing: "border-box",
  direction: "rtl",
};

const freeTextLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#666",
  fontWeight: 500,
  marginBottom: 6,
  lineHeight: 1.6,
};

const backBtnStyle: React.CSSProperties = {
  marginTop: 24,
  background: "none",
  border: "1.5px solid #7b5fa3",
  color: "#7b5fa3",
  borderRadius: 10,
  padding: "10px 32px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const sectionDividerStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "24px 20px",
  marginBottom: 16,
  background: "#f0edf6",
  borderRadius: 14,
  border: "1px solid #e5e0f0",
};

const socialLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "10px 24px",
  borderRadius: 10,
  border: "1.5px solid #7b5fa3",
  color: "#7b5fa3",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  fontFamily: "inherit",
  transition: "all 0.15s",
};
