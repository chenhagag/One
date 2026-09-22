# User Management Agent — One

## מטרה
סוכן שמנהל את מחזור החיים של משתמשים — מרגע ההרשמה ועד הכניסה למאגר ההתאמות. הסוכן רץ דרך Claude Code בהפעלה ידנית, קורא את מצב המשתמשים מה-API/DB, מבצע פעולות, ומייצר דו"חות.

**הבחנה חשובה**: סוכן זה הוא לא לוגיקת מערכת קבועה. הוא Claude שאתה מריץ ידנית. לתיעוד של כל התהליכים האוטומטיים (jobRunner, nudges, auto-analysis וכו') — ראה `Docs/System Jobs.md`.

---

## סוגי ריצות

### 1. ריצה יומית — "בוא נעשה ניהול יומי"
פעולות שמתבצעות כל יום:

#### 1.1 כתיבת תובנות למי שחסר

**שאילתה:**
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

**לכל משתמש:**
1. שליפת שיחות: `SELECT role, content, guide, created_at FROM conversation_messages WHERE user_id = $1 ORDER BY created_at ASC`
2. שליפת traits: `SELECT td.internal_name, td.display_name_he, td.trait_group, ut.score FROM user_traits ut JOIN trait_definitions td ON ut.trait_definition_id = td.id WHERE ut.user_id = $1 ORDER BY td.trait_group, td.internal_name`
3. כתיבת תובנות לפי `Docs/insights-writing-guide.md`
4. שמירה:
```sql
UPDATE users SET
  personal_insights_short = $1,
  personal_insights_full = $2,
  insights_pre_completion = $3,
  insights_updated_at = NOW(),
  updated_at = NOW()
WHERE id = $4
```
(`insights_pre_completion = true` אם cognitive user messages < 3 OR taste user messages < 3)

- **חשוב**: התובנות נכתבות ע"י Claude, לא ע"י GPT-4o (הפקה אוטומטית בוטלה)

#### 1.2 בדיקת תובנות אחרי reanalysis

**שאילתה:**
```sql
SELECT u.id, u.first_name, u.last_analysis_at, u.insights_updated_at
FROM users u
WHERE u.personal_insights_full IS NOT NULL
  AND u.last_analysis_at IS NOT NULL
  AND (u.insights_updated_at IS NULL OR u.last_analysis_at > u.insights_updated_at)
  AND u.test_user_type IS NULL
```

**לכל משתמש:**
1. קריאת ההתכתבות האחרונה (qa_about_me / qa_refine) — `SELECT role, content, guide, created_at FROM conversation_messages WHERE user_id = $1 AND guide IN ('qa_about_me', 'qa_refine') ORDER BY created_at ASC`
2. השוואה לתובנות הקיימות — האם המידע החדש משנה תובנה?
3. אם כן — כתיבת תובנות מעודכנות לפי `Docs/insights-writing-guide.md` + שמירה (אותו UPDATE כמו 1.1)
4. אם לא — מדווח "תובנות עדכניות, לא צריך שינוי"

#### 1.3 סריקת שיחות יומית

**שאילתה — משתמשים ששוחחו היום:**
```sql
SELECT DISTINCT cm.user_id, u.first_name
FROM conversation_messages cm
JOIN users u ON u.id = cm.user_id
WHERE cm.created_at >= CURRENT_DATE
  AND cm.role = 'user'
ORDER BY cm.user_id
```

**לכל משתמש — שליפת הודעות היום:**
```sql
SELECT role, content, guide, created_at
FROM conversation_messages
WHERE user_id = $1 AND created_at >= CURRENT_DATE
ORDER BY created_at ASC
```

בודק את כל המשתמשים ששוחחו עם הצ'אט **היום** (כל סוגי השיחות), עובר על ההודעות החדשות ומחפש:

**מה לחפש:**
- **הפניות לאפליקציות מתחרות** — הצ'אט הפנה לטינדר/באמבל/אפליקציה אחרת
- **שבירת זהות** — "אני צ'אטבוט", "אני AI", "אני לא אדם אמיתי" או כל גילוי שהוא לא אישיות אמיתית
- **שאלות חוזרות** — הצ'אט שואל את אותה שאלה פעמיים באותו ערוץ
- **תקיעות** — משתמש מנסה להתקדם והצ'אט לא מגיב / חוזר על עצמו
- **תיאור פרופילי טעם כ"פיקטיביים"** — חייב להיות "כלי אבחוני" / "דוגמאות", לא "לא אמיתיים"
- **שגיאות תוכן** — מידע שגוי על המערכת, הבטחות לא ריאליות
- **תוכן לא הולם** — פגיעה, חוסר רגישות, תוכן מיני
- **בעיות closing** — שיחה שנסגרה מוקדם מדי או לא נסגרה כשצריך

**מה לא לסמן כבעיה:**
- טעם: משתמש לא נתן ציון מספרי לפרופיל — זה בסדר
- טעם: לא הוצגו כל 13 הפרופילים — זה בסדר
- טעם: סיכום ביניים מוקדם — זה בסדר

**פורמט דו"ח:**
הממצאים נכתבים לקובץ חודשי: `Docs/reports/chat-review-YYYY-MM.md`

```markdown
## סריקה יומית — [תאריך]

### ממצאים
| # | משתמש | ערוץ | סוג בעיה | פירוט |
|---|--------|------|----------|-------|
| 1 | #149 חן | new_chat | שאלה חוזרת | "מה את עושה בזמן הפנוי?" נשאל פעמיים |
| 2 | #87 נועה | qa_refine | הפניה למתחרה | "אפשר לנסות גם ב-Bumble" |

### ללא ממצאים
12 משתמשים נסרקו, 10 ללא בעיות.
```

אם אין ממצאים כלל — שורה אחת: "סריקה יומית [תאריך] — X משתמשים נסרקו, ללא ממצאים."

#### 1.4 כתיבת כרטיסי התאמה ל-approved_by_both
כשמשתמשים דירגו אחד את השנייה חיובית, ההתאמה עוברת ל-`approved_by_both`. צריך לכתוב כרטיס התאמה שמתאר את החיבור ביניהם.

**שלב א — מציאת התאמות:**
```sql
SELECT m.id AS match_id, m.user1_id, m.user2_id,
       u1.first_name AS u1_name, u1.gender AS u1_gender, u1.age AS u1_age, u1.city AS u1_city,
       u1.match_card_consent AS u1_consent, u1.match_card_restrictions AS u1_restrictions,
       u2.first_name AS u2_name, u2.gender AS u2_gender, u2.age AS u2_age, u2.city AS u2_city,
       u2.match_card_consent AS u2_consent, u2.match_card_restrictions AS u2_restrictions
FROM matches m
JOIN users u1 ON u1.id = m.user1_id
JOIN users u2 ON u2.id = m.user2_id
WHERE m.status = 'approved_by_both'
  AND m.match_card_data IS NULL
```

**שלב ב — לכל match, קריאה מעמיקה:**
1. שליפת שיחות של שני הצדדים (query בסעיף "איך לקרוא נתונים")
2. שליפת traits של שני הצדדים (query בסעיף "איך לקרוא נתונים")
3. בדיקת consent:
   - אם `match_card_consent = 'declined'` → כרטיס רק עם מידע בסיסי (שם, גיל, עיר, תמונה) — **אסור תוכן מהשיחות**
   - אם `match_card_restrictions` לא null → לכבד את ההגבלות (דברים שהמשתמש לא רוצה שיוצגו)

**שלב ג — כתיבת הכרטיס:**

מבנה JSON:
```json
{
  "introSummary": "הצגה אישית קצרה של כל אחד/ת בשמו/ה, ואז תיאור החיבור",
  "connectionPoints": [
    { "title": "כותרת נקודת חיבור", "text": "פירוט מעמיק" },
    { "title": "...", "text": "..." },
    { "title": "...", "text": "..." }
  ],
  "dateIdea": "הצעה לדייט ראשון מבוססת על תחומי עניין משותפים",
  "caveat": "הערה כנה ועדינה על אתגר אפשרי",
  "closing": "סיום ייחודי שקושר חזרה לזוג הספציפי"
}
```

**כללי סגנון (חובה!):**
- **שמות, לא הוא/היא** — לכתוב "נדב" ו"דנית", לא "הוא" ו"היא"
- **introSummary מתחיל בהצגה אישית** של כל אחד לפני שמתארים את החיבור
- **לעולם לא לחשוף פרטי עבר** — לא לגעת בפרידות, לקחים מאקסים, היסטוריה זוגית
- **כל closing חייב להיות ייחודי** — לא לשכפל מכרטיסים קודמים
- **דיוק** — לא לשלב שתי עובדות בצורה מעורפלת. לקרוא כל משפט ולוודא שאי אפשר להבין אותו לא נכון
- **לקרוא באמת את השיחות** — לא לסכם, לצלול לעומק ולהבין מי הם

**שלב ד — אישור ושמירה:**
1. להציג כל כרטיס לאדמין לאישור
2. אחרי אישור — לשמור:
   - `POST /admin/matches/:id/save-card` עם `{ match_card_data: <JSON> }`
   - `POST /admin/matches/:id/prepare` (מעביר ל-`pre_match`)
3. האדמין תבדוק ב-admin panel, תערוך אם צריך, ותאשר ידנית

#### 1.5 דיווח משתמשים לא פעילים (TODO — עתידי)
- 7+ ימים בלי כניסה + תהליך לא שלם

#### 1.6 סריקת דיווחי באגים (TODO — עתידי)
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
| Photo nudges | יומי | בקשת תמונה + שאלת התאמה עיוורת למשתמשים עם matches ב-waiting_for_photo |
| Message nudges | יומי | תזכורות לשאלות סגורות/פתוחות שלא נענו (+2d, +5d, +12d) |
| Rating nudges | יומי | תזכורות לדירוגי התאמה שלא נענו (+2d, +5d, +12d). אוטו-שליחה לצד שני אחרי דירוג חיובי |
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
| סריקת שיחות מלאה | "בוא נעשה סריקת שיחות" | ראה למטה |

### סריקת שיחות מלאה (On-Demand)
כשמבקשים "בוא נעשה סריקת שיחות":
1. בוחר משתמשים שעדיין **לא נסרקו** (לפי הדו"חות הקיימים ב-`Docs/reports/`)
2. עובר על **כל** ההודעות שלהם (לא רק חדשות)
3. מחפש את אותם סוגי בעיות כמו בסריקה היומית (ראה סעיף 1.3)
4. מדווח לפי אותו פורמט בקובץ החודשי
5. מציין בדו"ח אילו משתמשים נסרקו כדי לא לחזור עליהם

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
| `POST /admin/matches/:id/save-card` | שמירת כרטיס התאמה (match_card_data JSON) |
| `POST /admin/matches/:id/prepare` | העברה ל-pre_match (ממתין לאישור כרטיס) |
| `POST /admin/matches/:id/approve-card` | אישור כרטיס התאמה |
| `POST /admin/run-message-nudges` | הפעלה ידנית של message nudges |
| `POST /admin/run-rating-nudges` | הפעלה ידנית של rating nudges |
| `POST /admin/run-photo-nudges` | הפעלה ידנית של photo nudges |

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
- [x] **סריקת שיחות** — שני מצבים: יומי (הודעות חדשות של היום) + on-demand (סריקה מלאה למי שלא נסרק). דו"חות חודשיים ב-`Docs/reports/`
- [x] **Photo Nudges** — `pipeline/photoNudges.ts`, cron יומי. בקשת תמונה (4 שלבים) + שאלת התאמה עיוורת. Per-user flow, עצירה בהעלאת תמונה, הפעלה מחדש אחרי 14 יום. blind_match_consent אוטומטי מתשובה חיובית. badge סגול באדמין
- [x] **Message Nudges** — `pipeline/messageNudges.ts`, cron יומי. תזכורות לשאלות סגורות (system_questions) ופתוחות (admin_messages type=conversation) שלא נענו. +2d, +5d, +12d. שאלות מתוך match מציינות "בנוגע להתאמה אפשרית". notification בשליחת שאלה סגורה (לא היה), אופציות מותאמות, שליחה מפאנל match
- [x] **Rating Nudges** — `pipeline/ratingNudges.ts`, cron יומי. תזכורות לדירוגי התאמה שלא נענו. +2d, +5d, +12d. אוטו-שליחה לצד שני אחרי דירוג חיובי (לא דורש עוד שליחה ידנית מהאדמין)
- [x] **כרטיסי התאמה בריצה יומית** — Step 1.4 בסוכן. סריקת `approved_by_both` ללא כרטיס, כתיבה מעמיקה, שמירה ל-`pre_match` לאישור אדמין

### הבא בתור
- [ ] **בדיקת תובנות אחרי reanalysis** — סוכן ניהול (Claude):
  - בריצה יומית: מזהה משתמשים ש-`last_analysis_at > insights_updated_at`
  - קורא התכתבות אחרונה, מחליט אם תובנות צריכות עדכון

### עתידי
- [ ] **AI intent detection** — להחליף את ה-regex בזיהוי AI לכל הודעה (~$0.001/הודעה). ייתן: דיוק בבחירת פרומפטים, סיווג מדויק לקבוצת traits, חיסכון בניתוחים מיותרים. **חסם**: latency של 200-500ms לכל הודעה (פתרון: סיווג post-hoc)
- [ ] **פרומפט "מידע והעדפות כלליות"** — כשייבנה, יחליף את קבוצת "general" בניתוח חוזר של qa_refine
- [ ] **דיווח משתמשים לא פעילים** — 7+ ימים בלי כניסה + לא השלימו
- [ ] **סריקת דיווחי באגים** — bug_reports חדשים
- [ ] **סיכום שבועי** — כמה הצטרפו, סיימו, נכנסו למאגר
- [ ] **ניתוח חיצוני אוטומטי** — GPT-4o Vision על תמונות → look traits
- [ ] **מעבר אוטומטי ל"טופל"** — אחרי nudge + insights + pool entry
- [ ] **התאמה עיוורת — צד אחד ענה בלבד** — מקרה קצה: משתמשת אחת ענתה "כן" לעיוורת, השנייה לא ענתה לעולם. צריך החלטת מוצר (timeout? תזכורת? ביטול?)

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
