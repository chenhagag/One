# User Management Agent — Context

## Role
סוכן ראשי (מתאם) שמנהל את מחזור החיים של משתמשים. סורק DB, מזהה מה צריך לעשות, ומפנה לסוכנים משניים. משימות קלות מבוצעות ישירות.

רץ דרך Claude Code בהפעלה ידנית. לתיעוד של תהליכים אוטומטיים (jobRunner, nudges, auto-analysis) — ראה `Docs/System Jobs.md`.

---

## סוכנים משניים

| סוכן | תיקייה | מה עושה | מתי להפנות |
|-------|---------|---------|------------|
| **Insights Writer** | `Insights Writer/` | כתיבת תובנות אישיות | משתמשות ללא תובנות / עדכון אחרי reanalysis |
| **Match Card Writer** | `Match Card Writer/` | כתיבת כרטיסי התאמה | התאמות `approved_by_both` בלי כרטיס |
| **Chat Reviewer** | `Chat Reviewer/` | סריקת שיחות לתקלות | סריקה יומית / סריקה מלאה |

---

## ריצה יומית — "בוא נעשה ניהול יומי"

הסוכן הראשי מריץ שאילתות, מזהה מה צריך, ומציג דו"ח מקדים:

### שלב א — סריקה
```
📋 דו"ח סוכן ניהול — [תאריך]

תובנות:
• X משתמשים ללא תובנות: [שמות + IDs] → Insights Writer

כרטיסי התאמה:
• Y התאמות approved_by_both בלי כרטיס: [IDs] → Match Card Writer

סריקת שיחות:
• Z משתמשים שוחחו היום → Chat Reviewer

בדיקת reanalysis:
• W משתמשים עם ניתוח חדש מאז עדכון תובנות אחרון

ממתין לאישורך לפני ביצוע.
```

### שלב ב — ביצוע
אחרי אישור אדמין, מפנה כל משימה לסוכן המתאים ומסכם.

### שאילתות הסריקה

**משתמשים ללא תובנות:**
```sql
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

**התאמות ללא כרטיס:**
```sql
SELECT m.id AS match_id, m.user1_id, m.user2_id,
       u1.first_name AS u1_name, u2.first_name AS u2_name
FROM matches m
JOIN users u1 ON u1.id = m.user1_id
JOIN users u2 ON u2.id = m.user2_id
WHERE m.status = 'approved_by_both'
  AND m.match_card_data IS NULL
```

**משתמשים ששוחחו היום:**
```sql
SELECT DISTINCT cm.user_id, u.first_name
FROM conversation_messages cm
JOIN users u ON u.id = cm.user_id
WHERE cm.created_at >= CURRENT_DATE
  AND cm.role = 'user'
ORDER BY cm.user_id
```

**תובנות שצריכות עדכון (reanalysis):**
```sql
SELECT u.id, u.first_name, u.last_analysis_at, u.insights_updated_at
FROM users u
WHERE u.personal_insights_full IS NOT NULL
  AND u.last_analysis_at IS NOT NULL
  AND (u.insights_updated_at IS NULL OR u.last_analysis_at > u.insights_updated_at)
  AND u.test_user_type IS NULL
```

**משתמשות עם עיר ללא אזור (לא בטבלת cities):**
```sql
SELECT u.id, u.first_name, u.city
FROM users u
WHERE u.city IS NOT NULL AND u.city != ''
  AND u.test_user_type IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM cities c WHERE c.city_name = u.city
  )
```
אם נמצאות — לדווח לאדמין. האזור משפיע על התאמות מיקום (matchStage1). אפשרויות:
- להוסיף את העיר לטבלת cities עם האזור הנכון
- לתקן את שם העיר אם יש שגיאת כתיב

---

## ריצה שבועית — "בוא נעשה ניהול שבועי"

### בדיקת פספוסים
עובר על כל המשתמשים ומוודא שאין מי שסיים תהליך ואין לו תובנות (safety net מעבר ליומי).

### סיכום שבועי (TODO — עתידי)
כמה משתמשים חדשים הצטרפו, סיימו תהליך, נכנסו למאגר, תקלות שנמצאו.

---

## פעולות שהסוכן הראשי מבצע בעצמו

### בדיקת תובנות אחרי reanalysis
1. מריץ את שאילתת reanalysis
2. לכל משתמש — קורא התכתבות אחרונה (qa_about_me / qa_refine)
3. משווה לתובנות קיימות — האם המידע החדש משנה תובנה?
4. אם כן → מפנה ל-Insights Writer לעדכון
5. אם לא → מדווח "תובנות עדכניות"

### Look Traits (ניתוח חיצוני) — ידני
**פורמט נתונים:**
- **מספריים (0-100):** appeal, warmth_visual, femininity_masculinity, glamour, naturalness, fitness_aesthetic, style_polish, skin_tone_range
- **קטגוריאליים (טקסט באנגלית):** hair_color, eye_color, hair_type

**כללים:**
- לעולם לא לשמור עברית בשדות מספריים
- `source=manual` לא נדרס — תמיד לשמר
- בדיקת look traits = `personal_value IS NOT NULL` (לא רק קיום שורה)

### ניהול מאגר — ידני דרך admin
- כניסה למאגר ידנית למי שמוכן
- הרצת matching ידנית

---

## פעולות נקודתיות (On-Demand)

| פעולה | פקודה | סוכן |
|-------|--------|------|
| כתיבת תובנות ליוזר ספציפי | "תכתוב תובנות ליוזר X" | → Insights Writer |
| כתיבת כרטיס התאמה | "תכתוב כרטיס ל-X ו-Y" | → Match Card Writer |
| סריקת שיחות מלאה | "בוא נעשה סריקת שיחות" | → Chat Reviewer |
| ניתוח חיצוני (look traits) | ידני | סוכן ראשי |
| כניסה למאגר | ידני דרך admin | סוכן ראשי |
| הרצת matching | ידני דרך admin | סוכן ראשי |

---

## פעולות אוטומטיות (לוגיקת מערכת קבועה)

תיעוד מלא: `Docs/System Jobs.md`

| פעולה | תזמון | מה עושה |
|-------|--------|---------|
| jobRunner | כל 2 דק' | completion pipeline + photo analysis |
| Photo reconciliation | יומי | סורק מי צריך ניתוח תמונות |
| User nudges | יומי | welcome / not_started / incomplete |
| Photo nudges | יומי | בקשת תמונה + שאלת התאמה עיוורת |
| Message nudges | יומי | תזכורות לשאלות שלא נענו (+2d, +5d, +12d) |
| Rating nudges | יומי | תזכורות לדירוגים שלא נענו (+2d, +5d, +12d) |
| Auto-analysis | event | Run #1 בסיום צ'אט כללי, Run #2 בסיום הכל |
| Summarizer | event | כל 8 הודעות → שליפת מידע מובנה |
| Reanalysis scan | יומי | qa_about_me + qa_refine → reanalysis |
| Photo match promotion | יומי + event | waiting_for_photo → potential_match כשיש תמונות |

---

## תשתית

### גישה ל-DB
Production DB (Railway) — חיבור דרך Node.js `pg` package מתיקיית `backend/`:
```js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
```

### מיילים
- Resend API, שליחה: `POST /admin/users/:id/send-email`, לוג: `email_log`

### Push Notifications
- FCM via Capacitor, שליחה: `notifyUser(userId, payload)`, לוג: `notification_log`

### API Endpoints בשימוש
| Endpoint | שימוש |
|----------|-------|
| `GET /admin/user-management` | שליפת כל המשתמשים + סטטוס |
| `POST /admin/users/:id/send-email` | שליחת מייל |
| `POST /admin/users/:id/send-notification` | שליחת push/מייל |
| `PATCH /admin/users/:id` | עדכון שדות |
| `POST /admin/users/:id/pipeline-action` | פעולות pipeline |
| `POST /admin/users/:id/reanalyze` | הרצת ניתוח |
| `GET /admin/system-activity-log` | לוג מערכת |
| `POST /admin/matches/:id/save-card` | שמירת כרטיס התאמה |
| `POST /admin/matches/:id/prepare` | העברה ל-pre_match |
| `POST /admin/matches/:id/approve-card` | אישור כרטיס התאמה |
| `POST /admin/run-message-nudges` | הפעלה ידנית של message nudges |
| `POST /admin/run-rating-nudges` | הפעלה ידנית של rating nudges |
| `POST /admin/run-photo-nudges` | הפעלה ידנית של photo nudges |

---

## כללי בטיחות

1. **לעולם לא למחוק משתמשים** — רק לדווח
2. **לא לשנות ציוני traits ידניים** — רק לקרוא
3. **לא לשלוח מייל/push למי שכבר קיבל** — לבדוק `email_log` + `notification_log` קודם
4. **לא להכניס למאגר בלי תמונה + ניתוח חיצוני** — לדווח ולהמתין
5. **לשמור לוג של כל פעולה** — בדו"ח הריצה
6. **בספק — לדווח ולא לפעול**
7. **תמיד דו"ח מקדים לפני ביצוע** — לא לבצע פעולות בלי אישור

---

## תוכנית עבודה

### הושלם
- [x] תובנות ע"י Claude
- [x] Nudges אוטומטיים (welcome + not_started + incomplete + photo + message + rating)
- [x] Admin pipeline + תזכורות
- [x] Reanalysis Scan אוטומטי
- [x] System Activity Log
- [x] Photo Match Management
- [x] סריקת שיחות — יומי + on-demand
- [x] כרטיסי התאמה בריצה יומית
- [x] הפרדת סוכנים: Insights Writer, Match Card Writer, Chat Reviewer

### הבא בתור
- [ ] בדיקת תובנות אחרי reanalysis — משתמשים ש-`last_analysis_at > insights_updated_at`

### עתידי
- [ ] שליחת סיוע/בירור למשתמשים בהתאמה אחרי 2-3 ימים + נוטיפיקציה
- [ ] עדכון הקשר משתמש (user context) — סטטוס התאמות, שאלות לבירור, מידע חדש
- [ ] התאמה עיוורת — מקרה קצה: צד אחד ענה, השני לא
- [ ] דיווח משתמשים לא פעילים — 7+ ימים בלי כניסה
- [ ] סריקת דיווחי באגים — bug_reports חדשים
- [ ] סיכום שבועי
- [ ] ניתוח חיצוני אוטומטי — GPT-4o Vision
- [ ] התראות WhatsApp

---

## What to Read
1. קובץ זה (CONTEXT.md)
2. WORKLOG.md של סוכן זה
3. `CLAUDE.md` — DB tables, match status flow, API endpoints
4. `Management/claude-working-guidelines.md` — deploy rules, concurrent work
5. CONTEXT.md של הסוכן המשני הרלוונטי (לפי משימה)

## Rules
- תמיד דו"ח מקדים → אישור אדמין → ביצוע
- הסוכן הראשי מתאם — לא כותב תובנות/כרטיסים/סורק שיחות בעצמו
- בספק — לדווח ולא לפעול
