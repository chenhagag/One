import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "./lib/api";

interface SurveyPageProps {
  userId: number;
  onBack: () => void;
}

// ── Survey question definitions ──

interface SurveyQuestion {
  id: number;
  title: string;
  subtitle?: string;
  type: "single" | "multi";
  options: string[];
  hasOther?: boolean; // Show "אחר" option with text field
  freeTextLabel?: string; // Optional free text below options
  conditionalTextOn?: number[]; // Show text field only when these option indices selected
  conditionalTextLabel?: string;
}

const QUESTIONS: SurveyQuestion[] = [
  {
    id: 1,
    title: "עד כמה הרגשתם ש-One הצליחה להבין אתכם ואת מה שאתם מחפשים?",
    type: "single",
    options: [
      "במידה רבה מאוד",
      "במידה רבה",
      "באופן חלקי",
      "לא כל כך",
      "בכלל לא",
    ],
    freeTextLabel: "היה משהו שהרגשתם שהמערכת לא הבינה מספיק טוב או לא נתנה לו מספיק משקל?",
  },
  {
    id: 2,
    title: "איך הרגיש לכם תהליך ההיכרות הראשוני והשיחות עד הכניסה למאגר?",
    type: "single",
    options: [
      "נהניתי מהתהליך והאורך הרגיש לי נכון",
      "היה קצת ארוך, אבל הרגשתי שיש לזה ערך",
      "היה ארוך ומייגע מדי",
      "דווקא הייתי מוכן/ה להעמיק ולספר יותר",
      "משהו אחר",
    ],
    freeTextLabel: "אם יש משהו שהייתם משנים בתהליך ההיכרות, נשמח לשמוע.",
  },
  {
    id: 3,
    title: "מה הייתם רוצים שיקרה בזמן שמחכים להתאמה?",
    subtitle: "One ממשיכה לעבוד גם כשלא רואים שינוי במסך — לבדוק התאמות, לפסול כאלה שלא מספיק מתאימות ולחפש מועמדים רלוונטיים. כרגע אנחנו עדיין בגרסת בטא והמאגר מוגבל יחסית, ולכן לפעמים עובר זמן עד שנמצאת התאמה שאנחנו באמת חושבים שכדאי להציג.\n\nבזמן הזה החוויה יכולה להרגיש די שקטה. מה היה הופך אותה לטובה יותר עבורכם?",
    type: "multi",
    options: [
      "הייתי רוצה לקבל יותר התאמות, גם אם הן לא לגמרי מדויקות",
      "הייתי רוצה לקבל מדי פעם עדכון קצר שהחיפוש שלי פעיל ושדברים קורים",
      "הייתי רוצה לראות קצת יותר ממה שקורה מאחורי הקלעים — למשל כמה מועמדים נבדקו או סיבות כלליות לכך שהתאמות נפסלו",
      "הייתי רוצה לקבל בינתיים עוד תובנות על עצמי ועל מה שהמערכת למדה עליי",
      "דווקא מתאים לי שהמערכת תהיה שקטה ותפנה אליי רק כשיש התאמה שנראית באמת טובה",
    ],
    hasOther: true,
    freeTextLabel: "נשמח אם תספרו לנו למה הכי התחברתם ומה היה גורם לכם להרגיש שהחיפוש באמת מתקדם.",
  },
  {
    id: 4,
    title: "האם נתקלתם בבעיה כלשהי בשיחה עם הצ'אט?",
    subtitle: "למשל תשובה לא נכונה, משהו שלא היה רלוונטי לשאלה, חזרתיות, חוסר הבנה, שיחה שנתקעה או משהו שפשוט הרגיש מוזר.",
    type: "single",
    options: [
      "לא",
      "כן, פעם אחת",
      "כן, כמה פעמים",
      "לא בטוח/ה",
    ],
    conditionalTextOn: [1, 2], // "כן" options
    conditionalTextLabel: "נשמח מאוד אם תספרו לנו מה קרה. גם דוגמה אחת יכולה לעזור לנו לשפר את הצ'אט.",
  },
  {
    id: 5,
    title: "מה עוד הייתם רוצים שתוכלו לעשות דרך הצ'אט של One?",
    type: "multi",
    options: [
      "לשאול מה הסטטוס שלי ומה קורה כרגע עם החיפוש שלי",
      "לקבל הסבר על מה המערכת מחפשת עבורי כרגע",
      "להתייעץ עם הצ'אט על התאמה שקיבלתי",
      "לשאול למה התאמה מסוימת נראתה מתאימה לי",
      "לקבל דרך הצ'אט עוד תובנות על עצמי ועל דפוסי ההתאמה שלי",
      "לא חסר לי משהו נוסף בצ'אט כרגע",
    ],
    hasOther: true,
    freeTextLabel: "יש משהו נוסף שהייתם רוצים שהצ'אט יוכל לעזור לכם בו?",
  },
  {
    id: 6,
    title: "אם כבר קיבלתם התאמה דרך One — עד כמה היא הרגישה לכם רלוונטית?",
    type: "single",
    options: [
      "מאוד — הבנתי היטב למה המערכת חיברה בינינו",
      "די רלוונטית, גם אם לא הרגישה בול",
      "היו בה דברים נכונים, אבל גם פערים משמעותיים",
      "לא הרגישה לי מתאימה",
      "עוד לא קיבלתי התאמה",
    ],
    freeTextLabel: "אם תרצו, נשמח לשמוע מה הרגיש מדויק בהתאמה ומה פחות.",
  },
  {
    id: 7,
    title: "האם נתקלתם בתקלה טכנית או באג במהלך השימוש ב-One?",
    type: "single",
    options: [
      "לא",
      "כן",
      "לא בטוח/ה",
    ],
    conditionalTextOn: [1, 2], // "כן" or "לא בטוח/ה"
    conditionalTextLabel: "מה קרה ובאיזה שלב? כל פרט שתזכרו יכול לעזור לנו לאתר את הבעיה.",
  },
  {
    id: 8,
    title: "מה אתם הכי אוהבים ברעיון ובחוויה של One?",
    type: "multi",
    options: [
      "שהמערכת מחפשת עבורי — אני לא צריך/ה לגלול בין אנשים או לשלוח הרבה הודעות בעצמי",
      "שאני מקבל/ת רק התאמות שהמערכת באמת חושבת שיש בהן פוטנציאל, ולא מבזבז/ת זמן על המון אפשרויות לא רלוונטיות",
      "של-One אין אינטרס להשאיר אותי באפליקציה כמה שיותר זמן — המטרה שלה היא למצוא לי התאמה טובה ולעזור לי לצאת מהמערכת",
      "שההיכרות עם המערכת נעשית דרך שיחה טבעית עם הצ'אט, בלי להסתבך עם בניית פרופיל ארוך",
      "התובנות שאני מקבל/ת על עצמי ועל מה שמתאים לי",
      "התחושה שהמערכת באמת מנסה להכיר אותי לעומק, ולא להתבסס רק על כמה פרטים ותמונות",
      "כשאני מקבל/ת התאמה, אני מקבל/ת גם הסבר מפורט על נקודות החיבור והאתגרים האפשריים — וזה נותן לי בסיס טוב יותר להתחיל ממנו את ההיכרות",
    ],
    freeTextLabel: "נשמח שתפרטו לנו",
  },
];

// Question 9 is special — two open text fields
const Q9_ID = 9;

interface QuestionResponse {
  selected?: number[];
  text?: string;
  otherText?: string;
}

type Responses = Record<string, QuestionResponse>;

export default function SurveyPage({ userId, onBack }: SurveyPageProps) {
  const [responses, setResponses] = useState<Responses>({});
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q9text, setQ9text] = useState("");
  const [q9extra, setQ9extra] = useState("");
  // Q6 gap sub-question
  const [q6gaps, setQ6gaps] = useState<number[]>([]);
  const [q6gapOther, setQ6gapOther] = useState("");

  // Load existing responses
  useEffect(() => {
    apiFetch("/survey/my-response")
      .then(r => r.json())
      .then(data => {
        if (data.completed) {
          setCompleted(true);
        }
        if (data.responses && Object.keys(data.responses).length > 0) {
          setResponses(data.responses);
          if (data.responses["9"]) {
            setQ9text(data.responses["9"].text || "");
            setQ9extra(data.responses["9"].otherText || "");
          }
          if (data.responses["6_gaps"]) {
            setQ6gaps(data.responses["6_gaps"].selected || []);
            setQ6gapOther(data.responses["6_gaps"].otherText || "");
          }
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
      await apiFetch("/survey/response", {
        method: "POST",
        body: JSON.stringify({ responses: allResponses, completed: false }),
      });
    } catch {}
  }, []);

  // Auto-save on response changes (debounced)
  useEffect(() => {
    if (loading || completed) return;
    const timeout = setTimeout(() => {
      const allResponses = {
        ...responses,
        "9": { text: q9text, otherText: q9extra },
        "6_gaps": { selected: q6gaps, otherText: q6gapOther },
      };
      autoSave(allResponses);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [responses, q9text, q9extra, q6gaps, q6gapOther, loading, completed, autoSave]);

  const handleSubmit = async () => {
    setSaving(true);
    const allResponses = {
      ...responses,
      "9": { text: q9text, otherText: q9extra },
      "6_gaps": { selected: q6gaps, otherText: q6gapOther },
    };
    try {
      const res = await apiFetch("/survey/response", {
        method: "POST",
        body: JSON.stringify({ responses: allResponses, completed: true }),
      });
      const data = await res.json();
      console.log("[survey submit] status:", res.status, "data:", data);
      if (data.ok || data.already_completed) {
        setCompleted(true);
      }
    } catch (err) {
      console.error("[survey submit] error:", err);
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
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤍</div>
            <h2 style={{ color: "#1B1464", fontSize: 22, marginBottom: 12 }}>תודה רבה!</h2>
            <p style={{ color: "#555", fontSize: 15, lineHeight: 1.8 }}>
              התשובות שלכם עזרו לנו מאוד לשפר ולדייק את המערכת שלנו.
            </p>
            <button onClick={onBack} style={backBtnStyle}>
              חזרה למסך הראשי
            </button>
          </div>
        </div>
      </div>
    );
  }

  const Q6_GAP_OPTIONS = [
    "אופי או דינמיקה",
    "סגנון כללי / וייב",
    "אורח חיים",
    "משיכה או טעם חיצוני",
    "ערכים או תפיסת עולם",
    "בקשה ספציפית שהייתה חשובה לי ולא קיבלה מספיק משקל",
    "נתונים בסיסיים כמו גיל, מרחק וכדומה",
  ];

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/iconOnly.png" alt="One" style={{ width: 48, height: 48, marginBottom: 12 }} />
          <h1 style={{ color: "#1B1464", fontSize: 22, margin: "0 0 16px", fontWeight: 700 }}>
            סקר משתמשי בטא
          </h1>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: 0 }}>
            המערכת שלנו גדלה מיום ליום ואנחנו מתקרבים למעבר מגרסת הבטא לגרסה הרשמית ולהתחיל בקמפיין רחב שיכניס משתמשים חדשים למערכת — מה שצפוי להגדיל משמעותית גם את מגוון ההתאמות האפשריות.
          </p>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "8px 0 0" }}>
            לפני שאנחנו גדלים, חשוב לנו לשמוע מכם, משתמשי הבטא הראשונים — מה עובד, מה פחות, ומה כדאי לשפר, להוסיף או לשנות.
          </p>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "8px 0 0" }}>
            כל פידבק יעזור לנו לשפר ולדייק את המערכת 🤍
          </p>
          <p style={{ color: "#888", fontSize: 13, lineHeight: 1.7, margin: "12px 0 0" }}>
            נשמח אם תענו על כל השאלות, אבל שום שאלה היא לא חובה — כל תשובה, גם חלקית, תעזור לנו.
          </p>
        </div>

        {/* Questions 1-8 */}
        {QUESTIONS.map((q) => {
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
              {q.subtitle && (
                <p style={subtitleStyle}>{q.subtitle}</p>
              )}
              {q.type === "multi" && (
                <p style={{ fontSize: 12, color: "#999", margin: "0 0 10px" }}>אפשר לבחור כמה תשובות</p>
              )}

              {/* Options */}
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
                          {isSelected && "✓"}
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
                  const otherIdx = q.options.length;
                  const isSelected = selected.includes(otherIdx);
                  return (
                    <>
                      <button
                        onClick={() => toggleOption(q.id, otherIdx, true)}
                        style={{
                          ...optionBtnStyle,
                          background: isSelected ? "#f0eef8" : "#fff",
                          borderColor: isSelected ? "#7b5fa3" : "#e5e7eb",
                          color: isSelected ? "#5b4a8a" : "#333",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? "#7b5fa3" : "#ccc"}`,
                          marginLeft: 8, flexShrink: 0, background: isSelected ? "#7b5fa3" : "transparent",
                          color: "#fff", fontSize: 12,
                        }}>
                          {isSelected && "✓"}
                        </span>
                        אחר
                      </button>
                      {isSelected && (
                        <textarea
                          value={resp.otherText || ""}
                          onChange={(e) => updateResponse(q.id, { otherText: e.target.value })}
                          placeholder="פרטו..."
                          style={textareaStyle}
                          rows={2}
                        />
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Conditional text field (Q4, Q7) */}
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

              {/* Free text field (always visible) */}
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

              {/* Q6 follow-up: gap sub-question */}
              {q.id === 6 && selected.length > 0 && !selected.includes(4) && (
                <div style={{ marginTop: 16, padding: "14px 16px", background: "#fafafa", borderRadius: 10, border: "1px solid #eee" }}>
                  <p style={{ fontSize: 14, color: "#333", fontWeight: 600, margin: "0 0 8px" }}>
                    אם היה פער, במה בעיקר הרגשתם אותו?
                  </p>
                  <p style={{ fontSize: 12, color: "#999", margin: "0 0 10px" }}>אפשר לבחור כמה תשובות</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Q6_GAP_OPTIONS.map((opt, idx) => {
                      const isSelected = q6gaps.includes(idx);
                      return (
                        <button
                          key={idx}
                          onClick={() => setQ6gaps(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                          style={{
                            ...optionBtnStyle,
                            fontSize: 13,
                            padding: "8px 14px",
                            background: isSelected ? "#f0eef8" : "#fff",
                            borderColor: isSelected ? "#7b5fa3" : "#e5e7eb",
                            color: isSelected ? "#5b4a8a" : "#333",
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSelected ? "#7b5fa3" : "#ccc"}`,
                            marginLeft: 8, flexShrink: 0, background: isSelected ? "#7b5fa3" : "transparent",
                            color: "#fff", fontSize: 11,
                          }}>
                            {isSelected && "✓"}
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                    {/* Other for gaps */}
                    {(() => {
                      const otherIdx = Q6_GAP_OPTIONS.length;
                      const isSelected = q6gaps.includes(otherIdx);
                      return (
                        <>
                          <button
                            onClick={() => setQ6gaps(prev => prev.includes(otherIdx) ? prev.filter(i => i !== otherIdx) : [...prev, otherIdx])}
                            style={{
                              ...optionBtnStyle,
                              fontSize: 13,
                              padding: "8px 14px",
                              background: isSelected ? "#f0eef8" : "#fff",
                              borderColor: isSelected ? "#7b5fa3" : "#e5e7eb",
                              color: isSelected ? "#5b4a8a" : "#333",
                              fontWeight: isSelected ? 600 : 400,
                            }}
                          >
                            <span style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSelected ? "#7b5fa3" : "#ccc"}`,
                              marginLeft: 8, flexShrink: 0, background: isSelected ? "#7b5fa3" : "transparent",
                              color: "#fff", fontSize: 11,
                            }}>
                              {isSelected && "✓"}
                            </span>
                            אחר
                          </button>
                          {isSelected && (
                            <textarea
                              value={q6gapOther}
                              onChange={(e) => setQ6gapOther(e.target.value)}
                              placeholder="פרטו..."
                              style={{ ...textareaStyle, fontSize: 13 }}
                              rows={2}
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Question 9 — open text */}
        <div style={questionBlockStyle}>
          <h3 style={questionTitleStyle}>
            <span style={questionNumberStyle}>9</span>
            ולסיום — אם הייתם יכולים לשנות או להוסיף עכשיו דבר אחד ב-One, מה זה היה?
          </h3>
          <textarea
            value={q9text}
            onChange={(e) => setQ9text(e.target.value)}
            style={textareaStyle}
            rows={4}
            placeholder="שתפו אותנו..."
          />
          <div style={{ marginTop: 12 }}>
            <label style={freeTextLabelStyle}>
              יש עוד משהו שחשוב לכם להגיד לנו? פידבק חיובי, ביקורת, רעיון או משהו שפשוט הפריע לכם — הכול יעזור לנו לבנות את הגרסה הבאה של One טוב יותר.
            </label>
            <textarea
              value={q9extra}
              onChange={(e) => setQ9extra(e.target.value)}
              style={textareaStyle}
              rows={4}
            />
          </div>
        </div>

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
            {saving ? "שולח..." : "שליחת הסקר"}
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
