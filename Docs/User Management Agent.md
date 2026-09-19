# User Management Agent — One

## מטרה
סוכן שמנהל את מחזור החיים של משתמשים — מרגע ההרשמה ועד הכניסה למאגר ההתאמות. הסוכן רץ דרך Claude Code בהפעלה ידנית, קורא את מצב המשתמשים מה-API/DB, מבצע פעולות, ומייצר דו"חות.

**הבחנה חשובה**: סוכן זה הוא לא לוגיקת מערכת קבועה. הוא Claude שאתה מריץ ידנית. לתיעוד של כל התהליכים האוטומטיים (jobRunner, nudges, auto-analysis וכו') — ראה `Docs/System Jobs.md`.

---

## סוגי ריצות

### 1. ריצה יומית — "בוא נעשה ניהול יומי"
פעולות שמתבצעות כל יום:

#### 1.1 כתיבת תובנות למי שחסר
- סורק משתמשים שסיימו לפחות צ'אט כללי (chat_closed) ואין להם `personal_insights_full`
- לכל אחד: קורא שיחות מלאות + traits מה-DB
- כותב תובנות לפי `Docs/insights-writing-guide.md`
- שומר ל-DB: `personal_insights_short`, `personal_insights_full`, `insights_pre_completion`
- **חשוב**: התובנות נכתבות ע"י Claude, לא ע"י GPT-4o (הפקה אוטומטית בוטלה)

#### 1.2 בדיקת תובנות אחרי reanalysis
- סורק משתמשים שה-`last_analysis_at` שלהם חדש יותר מה-`insights_updated_at`
- לכל אחד: קורא את ההתכתבות האחרונה (qa_about_me / qa_refine)
- מחליט אם התובנות צריכות עדכון בהתאם למידע החדש
- אם כן — כותב תובנות מעודכנות לפי `Docs/insights-writing-guide.md`
- אם לא — מדווח "תובנות עדכניות, לא צריך שינוי"

#### 1.3 סריקת תקלות בשיחות (TODO — עתידי)
- סריקת שיחות חדשות/שהשתנו
- זיהוי: הפניות לאפליקציות אחרות, "אני צ'אטבוט", שאלות חוזרות, תקיעות, שגיאות

#### 1.4 דיווח משתמשים לא פעילים (TODO — עתידי)
- 7+ ימים בלי כניסה + תהליך לא שלם

#### 1.5 סריקת דיווחי באגים (TODO — עתידי)
- bug_reports חדשים שלא טופלו

### 2. ריצה שבועית — "בוא נעשה ניהול שבועי"
פעולות שמתבצעות פעם בשבוע:

#### 2.1 בדיקת פספוסים
- עובר על כל המשתמשים ומוודא שאין מי שסיים תהליך ואין לו תובנות (safety net מעבר ליומי)

#### 2.2 סיכום שבועי (TODO — עתידי)
- כמה משתמשים חדשים הצטרפו
- כמה סיימו תהליך
- כמה נכנסו למאגר
- תקלות שנמצאו

---

## תהליך ריצה — חובה

כל ריצה (יומית או שבועית) חייבת לעבוד ב-2 שלבים:

### שלב א — סריקה ודו"ח מקדים
הסוכן סורק, מזהה מה צריך לעשות, ומציג לאדמין:
```
📋 דו"ח סוכן ניהול — [תאריך]

תובנות:
• X משתמשים ללא תובנות: [שמות + IDs]

[שאר פעולות]

ממתין לאישורך לפני ביצוע.
```

### שלב ב — ביצוע + סיכום
אחרי אישור האדמין, מבצע ומסכם:
```
✅ סיכום ביצוע — [תאריך]

תובנות:
• נכתבו תובנות ל-X: [שם — שורה ראשונה מה-short]
• אין משתמשים שדורשים תובנות

[שאר פעולות]
```

---

## פעולות אוטומטיות (לוגיקת מערכת קבועה)

תיעוד מלא: `Docs/System Jobs.md`

סיכום קצר:
| פעולה | תזמון | מה עושה |
|-------|--------|---------|
| jobRunner | כל 2 דק' | completion pipeline + photo analysis |
| Photo reconciliation | יומי | סורק מי צריך ניתוח תמונות |
| User nudges | יומי | welcome / not_started / incomplete |
| Auto-analysis | event | Run #1 בסיום צ'אט כללי, Run #2 בסיום הכל |
| Summarizer | event | כל 8 הודעות → שליפת מידע מובנה |
| Reanalysis scan | יומי | בדיקת qa_about_me + qa_refine → reanalysis |
| Photo match promotion | יומי + event | waiting_for_photo → potential_match כשיש תמונות |
| Match photo check | event (requalify) | potential_match → waiting_for_photo כשחסרה תמונה |
| System activity log | passive | לוג מאוחד לכל הפעולות האוטומטיות |

---

## פעולות נקודתיות (On-Demand)

| פעולה | פקודה | פירוט |
|-------|--------|-------|
| כתיבת תובנות ליוזר ספציפי | "תכתוב תובנות ליוזר X" | קריאת שיחות + traits, כתיבה לפי guide |
| כתיבת כרטיס התאמה | "תכתוב כרטיס ל-X ו-Y" | קריאת שתי שיחות, כתיבה לפי CLAUDE.md rules |
| ניתוח חיצוני (look traits) | ידני לעכשיו | צפייה בתמונות + מילוי ציונים |
| כניסה למאגר ידנית | ידני דרך admin | למי שמוכן בלי תמונות / דורש אישור |
| הרצת matching | ידני דרך admin | |

---

## איך לקרוא נתונים

### שליפת משתמשים לטיפול
```sql
-- משתמשים שסיימו צ'אט כללי ואין להם תובנות
SELECT u.id, u.first_name, u.email, u.gender, u.looking_for_gender
FROM users u
WHERE u.personal_insights_full IS NULL
  AND u.test_user_type IS NULL
  AND EXISTS (
    SELECT 1 FROM user_chat_summaries ucs
    WHERE ucs.user_id = u.id
    AND (ucs.topic_injection_counts->>'closing_stage')::int >= 1
  )
```

### שליפת שיחות
```sql
SELECT role, content, guide, created_at
FROM conversation_messages
WHERE user_id = $1
ORDER BY created_at ASC
```

### שליפת traits
```sql
SELECT td.internal_name, td.display_name_he, td.trait_group, ut.score
FROM user_traits ut
JOIN trait_definitions td ON ut.trait_definition_id = td.id
WHERE ut.user_id = $1
ORDER BY td.trait_group, td.internal_name
```

### שמירת תובנות
```sql
UPDATE users SET
  personal_insights_short = $1,
  personal_insights_full = $2,
  insights_pre_completion = $3,
  updated_at = NOW()
WHERE id = $4
```

`insights_pre_completion = true` אם cognitive user messages < 3 OR taste user messages < 3.

---

## תשתית קיימת

### מיילים
- Resend API (`RESEND_API_KEY`)
- שליחה: `POST /admin/users/:id/send-email`
- לוג: טבלת `email_log`

### Push Notifications
- Firebase Cloud Messaging (FCM) via Capacitor
- טוקנים: טבלת `fcm_tokens`
- שליחה: `notifyUser(userId, payload)` — push עם fallback למייל
- לוג: טבלת `notification_log`
- בדיקת token: `hasPushTokens(userId)`

### API Endpoints בשימוש
| Endpoint | שימוש |
|----------|-------|
| `GET /admin/user-management` | שליפת כל המשתמשים + סטטוס |
| `POST /admin/users/:id/send-email` | שליחת מייל |
| `POST /admin/users/:id/send-notification` | שליחת push/מייל |
| `GET /admin/users/:id/push-status` | בדיקת push tokens + לוג |
| `PATCH /admin/users/:id` | עדכון שדות |
| `POST /admin/users/:id/pipeline-action` | פעולות pipeline |
| `POST /admin/users/:id/update-checklist` | עדכון צ'קליסט |
| `POST /admin/users/:id/reanalyze` | הרצת ניתוח |
| `GET /admin/system-activity-log` | לוג מערכת (פעולות אוטומטיות) |

---

## תוכנית עבודה — שלבים

### הושלם
- [x] **תובנות ע"י Claude** — completion pipeline לא מפיק תובנות אוטומטית. Claude כותב בריצה יומית לפי `Docs/insights-writing-guide.md`
- [x] **Nudges אוטומטיים** — welcome + not_started (יום 2/5/10/20) + incomplete (יום 7/12/20/35), חוזר כל 14 יום. Push עם fallback למייל. מרווח מינימלי 3 ימים. מסנן זוגות, frozen, test users
- [x] **Admin pipeline** — מציג תזכורות אוטומטיות (כמה, מתי, איזה סוג)
- [x] **תיעוד** — insights-writing-guide.md, User Management Agent.md, System Jobs.md, CLAUDE.md מעודכן
- [x] **אפיון reanalysis** — לוגיקה מוגדרת, חלוקה ברורה בין לוגיקת מערכת לסוכן
- [x] **Reanalysis Scan** — `pipeline/reanalysisScan.ts`, cron יומי ב-jobRunner. qa_about_me (5-7→mbti, 8+→מלא), qa_refine (3-7→general, 8+→מלא). backfill + concurrency guard + last_analysis_at בכל endpoints
- [x] **System Activity Log** — טבלת `system_activity_log` + helper `activityLog.ts` + טאב "לוג מערכת" באדמין. nudges + reanalysis + photo promotion מתועדים
- [x] **Photo Match Management** — waiting_for_photo אוטומטי ביצירת match + reconcile. קידום ל-potential_match כשתמונות מועלות. סקשן "חסרים מאפיינים חיצוניים" ב-admin pipeline עם כפתור "טופל"

### הבא בתור
- [ ] **בדיקת תובנות אחרי reanalysis** — סוכן ניהול (Claude):
  - בריצה יומית: מזהה משתמשים ש-`last_analysis_at > insights_updated_at`
  - קורא התכתבות אחרונה, מחליט אם תובנות צריכות עדכון

### עתידי
- [ ] **AI intent detection** — להחליף את ה-regex בזיהוי AI לכל הודעה (~$0.001/הודעה). ייתן: דיוק בבחירת פרומפטים, סיווג מדויק לקבוצת traits, חיסכון בניתוחים מיותרים. **חסם**: latency של 200-500ms לכל הודעה (פתרון: סיווג post-hoc)
- [ ] **פרומפט "מידע והעדפות כלליות"** — כשייבנה, יחליף את קבוצת "general" בניתוח חוזר של qa_refine
- [ ] **סריקת תקלות בשיחות** — הפניות לאפליקציות, "אני צ'אטבוט", שאלות חוזרות, תקיעות
- [ ] **דיווח משתמשים לא פעילים** — 7+ ימים בלי כניסה + לא השלימו
- [ ] **סריקת דיווחי באגים** — bug_reports חדשים
- [ ] **סיכום שבועי** — כמה הצטרפו, סיימו, נכנסו למאגר
- [ ] **ניתוח חיצוני אוטומטי** — GPT-4o Vision על תמונות → look traits
- [ ] **מעבר אוטומטי ל"טופל"** — אחרי nudge + insights + pool entry

---

## כללי בטיחות

1. **לעולם לא למחוק משתמשים** — רק לדווח
2. **לא לשנות ציוני traits ידניים** — רק לקרוא
3. **לא לשלוח מייל/push למי שכבר קיבל** — לבדוק `email_log` + `notification_log` קודם
4. **לא להכניס למאגר בלי תמונה + ניתוח חיצוני** — לדווח ולהמתין
5. **לשמור לוג של כל פעולה** — בדו"ח הריצה
6. **בספק — לדווח ולא לפעול**
7. **תמיד דו"ח מקדים לפני ביצוע** — לא לבצע פעולות בלי אישור
8. **תובנות נכתבות לפי `Docs/insights-writing-guide.md`** — לא לפנות ל-generateInsights API
