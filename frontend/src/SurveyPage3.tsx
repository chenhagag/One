import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "./lib/api";

interface SurveyPage3Props {
  userId: number;
  onBack: () => void;
}

// ── Survey 3 question definitions ──

type QuestionType = "single" | "multi" | "open";

interface SurveyQuestion {
  id: number;
  title: string;
  subtitle?: string;
  smallSubtitle?: string;
  introText?: string;
  type: QuestionType;
  options?: string[];
  hasOther?: boolean;
  freeTextLabel?: string;
  conditionalTextOn?: number[];
  conditionalTextLabel?: string;
  belowTextareaNote?: string;
  belowTextareaHint?: string;
}

const QUESTIONS: SurveyQuestion[] = [
  {
    id: 1,
    title: "מה חשבת על ההתאמה או ההתאמות שקיבלת עד עכשיו? מה הרגיש מתאים ומה פחות?",
    type: "open",
  },
  {
    id: 2,
    title: "איך הרגיש לך הקונספט של כרטיס ההתאמה?",
    subtitle: "אפשר לבחור כמה תשובות.",
    type: "multi",
    options: [
      "עזר לי להניע את ההיכרות סביב מה שעלה שם",
      "היה מעניין ומסקרן",
      "הרגיש קצת חושפני או אישי מדי",
      "עשה קצת בילד אפ מוגזם",
      "לא תרם לי במיוחד",
    ],
    freeTextLabel: "מה דעתך? מוזמנת להרחיב:",
  },
  {
    id: 3,
    title: "איזה סוג של כרטיס התאמה היה מעניין או מועיל לך יותר?",
    type: "single",
    options: [
      "תיאור אישי במילים של החיבור האפשרי בינינו, כמו בכרטיס הקיים",
      "פירוט לפי תחומים: איפה יש בינינו התאמה גבוהה, איפה יש פערים ומה כדאי לברר",
      "שילוב של תיאור אישי ופירוט לפי תחומים",
      "כרטיס קצר יותר, עם פרטים בסיסיים בלבד",
      "אין לי העדפה",
    ],
    freeTextLabel: "מוזמנת לפרט:",
  },
  {
    id: 4,
    title: "איך התקדמו ההתאמות שקיבלת? הייתה שיחה? זרמה? המשכתן להכיר?",
    subtitle: "מוזמנת לשתף רק אם וכמה שבא לך כמובן.",
    type: "open",
  },
  {
    id: 5,
    title: "אם ביטלת התאמה, מה הייתה הסיבה לכך?",
    subtitle: "גם כאן כמובן מוזמנת לשתף רק אם מתאים לך.",
    type: "open",
  },
  {
    id: 6,
    title: "אנחנו שוקלות לאפשר ל-One לעזור באופן יותר פעיל בשלב השיחה, כדי להניע את ההיכרות. איך זה מרגיש לך?",
    introText: "למשל, להציע בתוך הצ׳אט שאלה שמתאימה לשתיכן, פעילות משותפת קצרה או דרך להמשיך כשהשיחה נתקעת. ההשתתפות תהיה לבחירתכן.",
    subtitle: "אפשר לבחור כמה תשובות.",
    type: "multi",
    options: [
      "זה מסקרן אותי והייתי רוצה לנסות",
      "מרגיש לי שזה יכול לעזור להתחיל או להתקדם בהיכרות",
      "זה תלוי במה שיוצע ובאופן שבו זה ישתלב בשיחה",
      "הייתי מעדיפה שעזרה כזו תופיע רק כשאני מבקשת אותה",
      "זה נשמע לי מביך / מאולץ",
      "הייתי מעדיפה שהשיחה תהיה רק בינינו, בלי הצעות של One",
      "לא יודעת, אצטרך להתנסות כדי להבין",
    ],
    freeTextLabel: "מה היה יכול להתאים לך, ומה פחות? מוזמנת להציע מה לדעתך היה עובד לך:",
  },
  {
    id: 7,
    title: "האם השתמשת באפשרויות הסיוע שכבר יש לנו ב-One?",
    subtitle: "אפשר לבחור כמה תשובות.",
    type: "multi",
    options: [
      "כן, עזרה בקביעת דייט",
      "כן, עזרה במעבר לווטסאפ",
      "כן, עזרה בקביעת זמן לשיחה",
      "לא ידעתי שיש אפשרויות כאלה",
      "הכרתי את האפשרויות, אבל לא היה לי ברור איך להשתמש בהן",
      "לא הרגשתי צורך בסיוע",
      "הרגשתי צורך בסיוע, אבל האפשרויות שהוצעו לא התאימו לי",
    ],
    freeTextLabel: "אם השתמשת, מה חשבת? ואם לא, מוזמנת להרחיב:",
  },
  {
    id: 8,
    title: "אנחנו שוקלות לאפשר לראות כמה התאמות פוטנציאליות ולבחור מתוכן, במקום לקבל רק הצעה אחת בכל פעם. מה דעתך?",
    introText: "One עדיין תחפש בשבילך ותציג רק נשים שהמערכת מצאה כרלוונטיות לך ועדיין ההתאמה תהיה אחת בכל פעם, אבל התהליך יהיה דינאמי יותר. מה את חושבת על זה?",
    type: "multi",
    options: [
      'אני אוהבת את קונספט ה"חתונמי" שבו אני מקבלת את האחת הכי רלוונטית',
      "אני אוהבת שמחפשים בשבילי ואני לא צריכה לעשות יותר מדי עד שיש התאמה",
      "הייתי רוצה קצת יותר להבין מה קורה מאחורי הקלעים",
      "הייתי רוצה להיות קצת חלק בתהליך ולראות יותר אופציות גם אם הן פחות מדויקות",
      "מרגיש לי קצת משעמם שאין כלום עד שיש משהו",
      "אוהבת את איך שזה ככה",
    ],
    hasOther: true,
  },
  {
    id: 9,
    title: "האם יש עוד רעיון/בקשה/הצעה שעולה לך שאולי יעשה את המערכת טובה יותר עבורך?",
    type: "open",
  },
];

interface QuestionResponse {
  selected?: number[];
  text?: string;
  otherText?: string;
}

type Responses = Record<string, QuestionResponse>;

export default function SurveyPage3({ userId, onBack }: SurveyPage3Props) {
  const [responses, setResponses] = useState<Responses>({});
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing responses
  useEffect(() => {
    apiFetch("/survey3/my-response")
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
      await apiFetch("/survey3/response", {
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
      const res = await apiFetch("/survey3/response", {
        method: "POST",
        body: JSON.stringify({ responses, completed: true }),
      });
      const data = await res.json();
      console.log("[survey3 submit] status:", res.status, "data:", data);
      if (data.ok || data.already_completed) {
        setCompleted(true);
      }
    } catch (err) {
      console.error("[survey3 submit] error:", err);
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
              תודה לכולן על ההשתתפות. מקוות שאתן נהנות מהאפליקציה שלנו ושתמצאו כאן היכרות טובה ומשמעותית בקרוב 💛
            </p>
            <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
              נשמח מאוד שתעקבו אחרינו בפייסבוק ובאינסטגרם, זה עוזר לנו מאוד בהפצה ובבניית הקהילה
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
            סקר חוויית התאמה
          </h1>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "0 0 8px" }}>
            היי,
          </p>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "0 0 8px" }}>
            יודעות שקצת חפרנו עם הסקרים :) אבל אנחנו עוד בבנייה של One ורוצות להגיע לאפליקציה שתהיה כמה שיותר טובה ומותאמת לקהילה שלנו ולצרכים שלכן, אז נשמח מאוד לשמוע את דעתכן.
          </p>
          <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, margin: "0 0 8px" }}>
            כל דעה ורעיון שיעלו אנחנו לוקחות ברצינות, אז תרגישו בנוח לבקש מה שבא לכן :)
          </p>
          <p style={{ color: "#555", fontSize: 13, lineHeight: 1.8, margin: "12px 0 4px" }}>
            חלק משמעותי מהרעיון של One היה לתת התאמה רלוונטית שתאפשר לא רק להגיע למישהי שמתאימה לך, אלא גם לעזור להניע את השיחה ולהתקדם יותר בקלות להיכרות. המטרה הייתה שכרטיס ההתאמה, שמציג לכן אחת את השנייה ומספר על קווי הדמיון, יוכל לעזור גם בזה.
          </p>
          <p style={{ color: "#555", fontSize: 13, lineHeight: 1.8, margin: "0 0 8px" }}>
            רצינו לשמוע מה דעתכן ואיך הייתה החוויה שלכן כדי לשפר בהמשך, גם את ההתאמות עצמן וגם את תהליך ההיכרות.
          </p>
          <p style={{ color: "#888", fontSize: 13, lineHeight: 1.7, margin: "12px 0 0" }}>
            מוזמנות לענות רק על מה שמתאים לכן, ולהרחיב כמה שבא לכן כמובן.
          </p>
        </div>

        {/* All questions */}
        {QUESTIONS.map(renderQuestion)}

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
