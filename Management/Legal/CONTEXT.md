# Legal Agent — Context

## Role
אחראי על כל ההיבטים המשפטיים של One: תנאי שימוש, מדיניות פרטיות, הסכמות, GDPR, חוק הגנת הפרטיות הישראלי, דרישות חנויות אפליקציות (Google Play, App Store), ועמידה ברגולציה.

**חשוב**: זה נושא רגיש מאוד. הסוכן לא מבצע שום פעולה בלי:
1. פירוט מלא של מה ישתנה
2. אישור מפורש מ-Chen
3. תיעוד של כל שינוי ב-WORKLOG

---

## Project Context
One (joinone.io) — פלטפורמת שידוכים מבוססת AI. משתמשות משוחחות בעברית עם צ'אט AI, המערכת מנתחת 60+ תכונות אישיות ומתאימה. כרגע WW בלבד (נשים מחפשות נשים). החברה ישראלית, פועלת תחת דין ישראלי, סמכות שיפוט: ת"א.

**Tech stack רלוונטי:**
- Auth: Supabase (Google OAuth + Magic Link + Apple Sign-In planned)
- AI: OpenAI GPT-4o — מקבל תוכן שיחות לעיבוד
- DB: PostgreSQL (Railway)
- Storage: Railway Volume (תמונות)
- Email: Resend API
- Push: Firebase Cloud Messaging (FCM)
- Domain: joinone.io
- Support email: one-support@googlegroups.com

---

## מצב נוכחי — מסמכים משפטיים

### דפים קיימים (HTML סטטי)
כל הדפים נגישים ב-`frontend/public/` ומוגשים ב-production:

| דף | URL | קובץ | עדכון אחרון |
|----|-----|-------|-------------|
| מדיניות פרטיות | `/privacy` | `frontend/public/privacy.html` | יוני 2026 |
| תנאי שימוש | `/terms` | `frontend/public/terms.html` | יוני 2026 |
| מחיקת חשבון | `/delete-account` | `frontend/public/delete-account.html` | יוני 2026 |
| CSAE Policy | `/csae-policy` | `frontend/public/csae-policy.html` | יולי 2026 |

**הערה**: הדפים נכתבו ע"י Claude בהתייעצות עם Chen, לא ע"י עו"ד. יש חומרים מהתייעצות עם עו"ד בתיקייה זו שצריך לקרוא ולהתאים בהתאם.

### Routes בשרת
```
GET /privacy  → frontend/dist/privacy.html
GET /terms    → frontend/dist/terms.html
```
(גם delete-account ו-csae-policy מוגשים כ-static files)

---

## מערכת הסכמות (Consent System)

### 1. הסכמה כללית — ConsentScreen
- **קובץ**: `frontend/src/ConsentScreen.tsx`
- **מתי**: מוצג אחרי הרשמה, לפני כניסה לאפליקציה
- **DB**: `consent_accepted BOOLEAN DEFAULT FALSE` — חוסם גישה עד אישור
- **טקסט מותאם מגדרית**: תשתפי/תשתף, מסכימה/מסכים
- **צ'קבוקס**: "קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות, ומסכים/ה ש-One תשתמש במידע שאשתף לצורך ניתוח באמצעות AI, יצירת תובנות והצעת התאמות"
- **לינקים**: מפנה ל-`/terms` ו-`/privacy` (נפתחים בטאב חדש)

### 2. הסכמת תמונות AI — Photo Upload Consent
- **קובץ**: `frontend/src/ProfileEdit.tsx` (מודאל)
- **מתי**: מוצג בהעלאת תמונה ראשונה
- **DB**: `photo_ai_consent BOOLEAN` על טבלת `users`
- **צ'קבוקס 1 (חובה)**: הסכמה להצגת תמונות בפרופיל
- **צ'קבוקס 2 (אופציונלי)**: הסכמה לניתוח AI של תמונות
- **ניתן לשנות**: דרך מסך הגדרות (toggle)

### 3. הסכמת כרטיס התאמה — Match Card Consent
- **DB**: `match_card_consent` ('approved' / 'declined' / null) + `match_card_restrictions` (free text) על טבלת `users`
- **מתי**: מסך הסכמה בסיידבר
- **אם declined**: כרטיס התאמה יכלול רק מידע בסיסי (שם, גיל, עיר, תמונה) — אסור תוכן מהשיחות
- **restrictions**: משתמש יכול לציין דברים שלא רוצה שיוצגו

### 4. הסכמות תקשורת
- **DB**: `email_updates BOOLEAN DEFAULT TRUE`, `whatsapp_updates BOOLEAN DEFAULT FALSE`, `whatsapp_phone TEXT`
- **קובץ**: `frontend/src/NewChat.tsx` (מסך הגדרות)
- **Auto-save**: כל toggle שומר מיד (לא כפתור שמירה)

---

## מחיקת חשבון

### אפשרויות במערכת (Settings screen)
- **מחיקת נתונים (התחלה מחדש)**: מוחק שיחות, תובנות, התאמות — שומר חשבון ופרטים
- **הקפאת חשבון**: (עתידי)
- **מחיקת חשבון מלאה**: מוחק הכל — פרטים, שיחות, תמונות, תובנות, התאמות
- **Flow**: choose → confirm → reason (optional) → final confirm → goodbye screen
- **בלי גישה לאפליקציה**: בקשה ידנית למייל one-support@googlegroups.com, טיפול תוך 7 ימי עסקים

### דף delete-account
- URL: `/delete-account` — דרישת Google Play (חובה לדף נגיש מחוץ לאפליקציה)
- מסביר את 3 האפשרויות: מחיקה מתוך האפליקציה, מחיקת נתונים בלבד, מחיקה ללא גישה

### Backend
- **Route**: מחיקה דרך PATCH + pipeline action (לא DELETE endpoint ישיר)
- **דיווח**: בקשת מחיקה נשמרת ב-`bug_reports` עם prefix `[delete_request]`

---

## מידע שנאסף על משתמשים

### מה נאסף
- **פרטי הרשמה**: שם, אימייל, גיל, עיר, מגדר, סטטוס זוגי
- **Auth**: supabase_uid, auth_provider (google/apple/magic_link)
- **תוכן שיחות**: כל ההודעות (conversation_messages) — כולל general, cognitive, taste
- **תמונות**: קבצים ב-Railway Volume + metadata ב-`user_photos`
- **העדפות**: טווח גיל, טווח מיקום, looking_for_gender
- **ניתוח AI**: user_traits (60+ ציונים), analysis_runs (raw output), user_chat_summaries
- **תובנות**: personal_insights_short, personal_insights_full
- **התאמות**: candidate_matches, matches (ציונים, סטטוס, כרטיסי התאמה)
- **הודעות ישירות**: direct_messages (בין matched users)
- **מעקב tokens**: token_usage (per user/action)
- **הסכמות**: consent_accepted, photo_ai_consent, match_card_consent, email_updates, whatsapp_updates
- **נתוני שימוש**: IP, user-agent (בלוגים בלבד, לא ב-DB)

### מה מועבר ל-OpenAI
- תוכן שיחות (להמשך שיחה)
- תוכן שיחות (לניתוח אישיות — 8 prompt groups)
- תמונות (אם photo_ai_consent = true — לניתוח look traits)
- **לפי OpenAI API terms**: data not used for training, deleted after 30 days

### מה מוצג למשתמשים אחרים
- **במצב רגיל**: לא מוצג שום דבר עד ל-match
- **ב-match**: שם פרטי, גיל, עיר, תמונות
- **בכרטיס התאמה**: תוכן שנכתב ע"י Claude (בכפוף ל-consent + restrictions)
- **בהודעות ישירות**: מה שהמשתמש כותב בעצמו

---

## דרישות חנויות אפליקציות

### Google Play (פעיל)
- **App ID**: io.joinone.app
- **Category**: Dating (18+)
- **Privacy Policy URL**: https://joinone.io/privacy (חובה)
- **Delete Account URL**: https://joinone.io/delete-account (חובה)
- **CSAE Policy**: https://joinone.io/csae-policy (חובה לאפליקציות dating)
- **Terms of Service URL**: https://joinone.io/terms
- **Block/Report**: קיים באפליקציה
- **Age verification**: 18+ (שדה גיל בהרשמה)

### App Store (עתידי)
- Apple Developer Account ($99/year) — עוד לא נרשמו
- Privacy Labels — צריך למלא (data collection disclosure)
- App Review מחמיר יותר מ-Google

---

## דין חל ורגולציה

### דין ישראלי
- **חוק הגנת הפרטיות, תשמ"א-1981** — חל על איסוף ושימוש במידע אישי
- **תקנות הגנת הפרטיות (אבטחת מידע), 2017** — דרישות אבטחה
- **סמכות שיפוט**: בתי המשפט בתל אביב-יפו
- **רשם מאגרי מידע**: צריך לבדוק אם חלה חובת רישום (מאגר עם מעל 10,000 רשומות + מידע רגיש)

### GDPR (אם יש משתמשים אירופיים)
- כרגע לא רלוונטי (WW ישראלי בלבד)
- בעתיד: צריך DPA עם OpenAI, Railway, Supabase

### Cookies
- האפליקציה היא PWA/native — לא אתר רגיל
- Supabase שומר session token ב-localStorage (לא cookies)
- **תמונות בתיקייה מציגות banner cookies** — ייתכן שצריך להטמיע באתר/landing pages

---

## קבצים בתיקייה
- `ONE_סיכום_משפטי_ותמלול (1).docx` — תמלול התייעצות עם עו"ד
- `הערות מהילה.docx` — הערות מעו"ד הילה
- `image001.jpg`, `image002.jpg` — דוגמאות banner cookies (אתר/אפליקציה)

**הערה**: עוה"ד אינה מתמחה בסטרטאפים/טכנולוגיה, אבל ההערות רלוונטיות ויש לבחון ולפעול לפיהן.

---

## נושאים פתוחים / לבדיקה

- [ ] **רישום מאגר מידע** — לבדוק חובת רישום אצל רשם מאגרי מידע
- [ ] **cookies banner** — צריך ב-landing pages? באפליקציה עצמה?
- [ ] **Data Retention Policy** — כתוב "30 יום אחרי מחיקה" — לוודא שזה מתבצע בפועל
- [ ] **עדכון מדיניות פרטיות** — לקרוא הערות עו"ד ולעדכן בהתאם
- [ ] **עדכון תנאי שימוש** — לקרוא הערות עו"ד ולעדכן בהתאם
- [ ] **DPA (Data Processing Agreement)** — עם OpenAI, Railway, Supabase, Resend
- [ ] **הסכמה מחודשת** — אם משתנים תנאים מהותיים, צריך לבקש הסכמה מחדש מכל המשתמשים
- [ ] **גיבוי הסכמות** — לוודא שיש log של מתי כל משתמש הסכים (timestamp)
- [ ] **Right to data portability** — האם צריך אפשרות לייצא את כל המידע?
- [ ] **Breach notification** — תהליך דיווח על דליפת מידע (72 שעות לפי GDPR, דרישות ישראליות)

---

## What to Read
1. קובץ זה (CONTEXT.md)
2. WORKLOG.md של סוכן זה
3. `CLAUDE.md` — project overview, consent system, match card system, DB tables
4. `Management/claude-working-guidelines.md` — general rules, concurrent work
5. `Management/Legal/ONE_סיכום_משפטי_ותמלול (1).docx` — תמלול התייעצות עו"ד
6. `Management/Legal/הערות מהילה.docx` — הערות עו"ד
7. `frontend/public/privacy.html` — מדיניות פרטיות נוכחית
8. `frontend/public/terms.html` — תנאי שימוש נוכחיים
9. `frontend/src/ConsentScreen.tsx` — מסך הסכמה נוכחי

## Rules
- **לא לשנות שום דבר בלי אישור מפורש מ-Chen** — לא קוד, לא טקסט, לא HTML
- **לפרט בדיוק מה ישתנה** — לפני כל שינוי, להציג diff/פירוט
- **לתעד כל שינוי** — ב-WORKLOG עם תאריך, מה השתנה, ולמה
- **לפעול בחכמה** — לא להבהיל עם רשימות ארוכות. לתעדף לפי סיכון ודחיפות
- **כשיש ספק משפטי** — לסמן כ"דורש ייעוץ משפטי" ולא להחליט לבד
