# תכנית פעולה — החלפת Credentials בעקבות פריצת Railway
**תאריך**: 2026-10-22
**אירוע**: Railway Security Disclosure — גישה לא מורשית למשתני סביבה מוצפנים
**סטטוס**: בביצוע

---

## רקע
Railway הודיעו (22/10/2026) שתוקף חיצוני השיג גישה אפשרית למשתני סביבה מוצפנים של לקוחות. ההודעה נשלחה לכלל הלקוחות — לא אישית. Railway ממליצים על החלפה מיידית של כל הסודות.

**עקרון מוביל**: הגנה על מידע המשתמשות קודמת לכל שיקול אחר. החלפה מדורגת — סוד אחד בכל פעם, עם בדיקות אחרי כל שלב.

---

## מיפוי סודות — מה חשוף ומה לא

### צריך להחליף (6 סודות)
| # | סוד | קבצים שמשתמשים בו | סיכון למידע משתמשות | סיכון כספי |
|---|------|--------------------|---------------------|------------|
| 1 | **DATABASE_URL** | db.pg.ts, index.ts, scripts שונים | **קריטי** — גישה ישירה לכל הנתונים | נמוך |
| 2 | **SUPABASE_JWT_SECRET** | auth.ts (3 מקומות), index.ts, notifications.ts | **קריטי** — זיוף טוקנים, התחזות לכל משתמשת | נמוך |
| 3 | **SUPABASE_SERVICE_ROLE_KEY** | index.ts (2 מקומות) | **קריטי** — עוקף RLS, גישה מלאה ל-Supabase | נמוך |
| 4 | **OPENAI_API_KEY** | agent.ts, openai.ts, rag.ts, summarizer.ts, index.ts, generateInsights.ts, photoAnalysis.ts | בינוני | בינוני |
| 5 | **RESEND_API_KEY** | index.ts (2), notifications.ts, welcomeEmail.ts | בינוני — מיילים בשם joinone.io | נמוך |
| 6 | **FIREBASE_SERVICE_ACCOUNT** | notifications.ts | נמוך-בינוני | נמוך |

### לא צריך להחליף
| משתנה | סיבה |
|--------|-------|
| `PORT`, `NODE_ENV`, `STAGING_URL` | לא סודות — הגדרות תצורה |
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | כתובות ציבוריות |
| `VITE_SUPABASE_ANON_KEY` | מפתח ציבורי מעצם הגדרתו, מוטמע ב-client |

### Android (Capacitor)
האפליקציה מבוססת `server.url` → joinone.io. כל הסודות בצד השרת בלבד. `VITE_SUPABASE_ANON_KEY` מוטמע ב-client אבל ציבורי. **אין צורך בגרסה חדשה בחנות.**

---

## סדר ביצוע

### שלב 0: הכנה ✅ הושלם
- [x] גיבוי DB — בוצע דרך Railway Dashboard
- [x] בדיקת פעילות חשודה:
  - OpenAI usage — ✅ נקי
  - Supabase Auth logs — ✅ נקי (רק logins רגילים + token refreshes)
  - Resend logs — ✅ נקי
- [ ] הודעה למשתמשות (באנר + מסך login) — דורש deploy, ייכנס עם השינוי הראשון
- [ ] אישור שדיפלויים עובדים — staging הצליח לפני שעה, כרגע queued שוב. production queued.

---

### שלב 1: DATABASE_URL ⚡ קריטי ביותר
**הסיכון**: גישה ישירה לכל מסד הנתונים — שיחות, traits, פרטים אישיים, תמונות

**מה עושים:**
1. ב-Railway → Postgres service → Settings → Reset password
2. מעדכנים `DATABASE_URL` בשתי סביבות (production + staging)
3. Railway עושה redeploy — **לא להניח זמנים, ממתינים עד שעולה**

**⚠️ חשוב**: Production ו-Staging משתמשים ב-DB שונים (nozomi vs zephyr). צריך להחליף בשניהם.

**מה עלול להישבר:**
- כל חיבורי DB — המערכת למטה עד שה-deploy עולה
- חיבורים פתוחים עם סיסמה ישנה
- אם deploys תקועים — המערכת תישאר למטה עד שה-deploy יעבור

**בדיקות:**
- [ ] Web: refresh דף פתוח — נטען תקין
- [ ] Web: התחברות חדשה (incognito)
- [ ] Web: שליחת הודעה בצ'אט ← תגובת AI
- [ ] Web: טעינת פרופיל + שמירת שינוי
- [ ] Android: פתיחת אפליקציה (כבר מחוברת)
- [ ] Android: התחברות חדשה
- [ ] Admin: טעינת דאשבורד + רשימת משתמשות

**סטטוס**: ⬜ טרם בוצע
**בוצע בשעה**: ___
**תוצאה**: ___

---

### שלב 2: Supabase — JWT_SECRET + SERVICE_ROLE_KEY ⏸️ נדחה — מוניטור בלבד
**⚠️ חייבים לטפל ביחד** — ה-service_role key הוא JWT חתום עם ה-JWT secret. שינוי ה-JWT secret מבטל גם את ה-service_role וה-anon keys. (תיקון מ-GPT review)

**הסיכון**: זיוף טוקנים + גישה מלאה ל-Supabase Auth בעקיפת RLS

**הערכת סיכון מעודכנת (22/10 12:00)**:
- סיכון ריאלי **נמוך מאוד**: תוקף צריך JWT_SECRET + supabase_uid של משתמשת ספציפית + מוטיבציה לתקוף אפליקציית היכרויות קטנה בעברית
- Railway ציינו שהמוטיבציה של התוקפים היא גניבת AI API keys, לא נתוני משתמשים
- הלוגים ב-Supabase Auth נקיים — אין פעילות חשודה
- **עלות ההחלפה גבוהה**: מנתקת כל המשתמשות + deploys תקועים (~20 דקות queue)

**החלטה**: ממשיכים לעקוב על Supabase Auth logs. מחליפים רק אם:
- מתגלית פעילות חשודה בלוגים
- Railway מודיעים שהחשבון שלנו נפגע
- יש חלון שקט עם deploys מהירים

**כשמחליטים לבצע:**
1. Supabase Dashboard → Settings → API
2. **שלב 2א**: Generate new JWT secret — **⚠️ מנתק את כל המשתמשות המחוברות**
3. **שלב 2ב**: Copy new service_role key (נוצר אוטומטית עם ה-JWT החדש)
4. **שלב 2ג**: Copy new anon key (נוצר אוטומטית) — צריך לעדכן גם ב-frontend env
5. מעדכנים ב-Railway env vars: `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`
6. Deploy

**מה עלול להישבר:**
- **כל משתמשת מחוברת מנותקת** — redirect ל-login
- `auth.ts:56,62,69` — כל אימות JWT
- `index.ts:377,446` — פעולות admin (service_role)
- `notifications.ts:22` — אימות ב-notifications
- `index.ts:789` — OTP verification
- **⚠️ Android**: ה-anon key מוטמע ב-frontend build. אם משתנה, צריך rebuild + deploy. אבל האפליקציה טוענת מ-server.url→joinone.io, אז ה-build החדש יגיע אוטומטית אחרי deploy.

**בדיקות:**
- [ ] Web: משתמשת מחוברת מקבלת redirect ל-login (צפוי!)
- [ ] Web: התחברות חדשה עם Google OAuth
- [ ] Web: התחברות עם Magic Link
- [ ] Android: התחברות חדשה + חזרה מהדפדפן לאפליקציה
- [ ] טוקן ישן נדחה (401/403)
- [ ] Admin: פעולות service_role (מחיקת חשבון בדיקה)
- [ ] Refresh token flow עובד

**סטטוס**: ⬜ טרם בוצע
**בוצע בשעה**: ___
**תוצאה**: ___

---

### שלב 3: OPENAI_API_KEY (מספור עודכן אחרי מיזוג שלבי Supabase)
**הסיכון**: שימוש על חשבוננו, גישה אפשרית ל-assistants/files אם קיימים

**מה עושים:**
1. OpenAI Dashboard → API Keys → Create new key
2. מעדכנים ב-Railway env vars
3. Deploy
4. OpenAI Dashboard → Revoke old key (רק אחרי שהחדש עובד!)

**מה עלול להישבר:**
- צ'אט, ניתוח, summarizer, RAG, insights, photo analysis — הכל עוצר עד deploy

**בדיקות:**
- [x] שליחת הודעה בצ'אט ← תגובת AI תקינה
- [x] Staging — מפתח חדש עובד
- [x] Production — מפתח חדש עובד
- [x] Old key revoked ב-OpenAI — הכל תקין

**סטטוס**: ✅ הושלם
**בוצע בשעה**: ~13:30 22/10/2026
**תוצאה**: מפתח חדש פעיל ב-staging + production. מפתח ישן בוטל ב-OpenAI. אין השפעה על משתמשות.

---

### שלב 4: RESEND_API_KEY
**הסיכון**: שליחת מיילים בשם joinone.io לכל כתובת

**מה עושים:**
1. Resend Dashboard → API Keys → Create new
2. מעדכנים ב-Railway
3. Deploy
4. Resend → Revoke old key

**מה עלול להישבר:**
- שליחת מיילים: notifications, nudges, welcome emails
- **לא** Magic Link — זה עובר דרך Supabase, לא Resend

**בדיקות:**
- [ ] Admin: שליחת מייל בדיקה (או trigger של notification)
- [ ] Magic Link login עובד (לא מושפע)

**סטטוס**: ⬜ טרם בוצע
**בוצע בשעה**: ___
**תוצאה**: ___

---

### שלב 5: FIREBASE_SERVICE_ACCOUNT
**הסיכון**: שליחת push notifications, גישה לשירותי Google Cloud לפי הרשאות

**מה עושים:**
1. Google Cloud Console → IAM → Service Accounts → Create new key (JSON)
2. מעדכנים ב-Railway (base64 encoded JSON)
3. Deploy
4. Google Cloud → Delete old key

**מה עלול להישבר:**
- Push notifications בלבד

**בדיקות:**
- [ ] שליחת push notification לאנדרואיד

**סטטוס**: ⬜ טרם בוצע
**בוצע בשעה**: ___
**תוצאה**: ___

---

### שלב 6: סגירה ואימות
- [ ] כל 6 הסודות הוחלפו
- [ ] כל המפתחות הישנים בוטלו אצל הספקים
- [ ] בדיקה סופית מקיפה: login → chat → profile → photos → admin
- [ ] בדיקה שאין שגיאות חדשות בטאב "שגיאות" ב-admin
- [ ] הסרת באנר ההודעה למשתמשות
- [ ] עדכון WORKLOG.md של Security agent
- [ ] עדכון incident-response-playbook.md עם לקחים

---

## הודעה למשתמשות
**שני מיקומים:**
1. באנר בדף הבית (NewChat.tsx) — למשתמשות מחוברות
2. הודעה במסך התחברות (AuthScreen.tsx) — למי שלא מצליחה להתחבר

**תוכן ההודעה:**
> היי לכולן 💜
> אנחנו עושות שדרוגים במערכת ומעלות גרסה חדשה.
> בזמן השדרוג ייתכנו עיכובים קלים, בעיקר בהתחברות.
> אם נתקלתן בקושי — המתינו כמה דקות או נסו להתחבר מחדש.
>
> אם זה עדיין לא עוזר, אנחנו כאן:
> 📧 one.matchmaking@gmail.com
> 💬 WhatsApp: [link]

---

## הערות מ-GPT וג'מיני (סיכום)
- GPT: ייעוץ מדויק. הדגש נכון ש"ביטול מפתח ב-Railway לא מספיק — צריך לבטל אצל הספק"
- ג'מיני: הזהיר נכון לגבי ANON_KEY באנדרואיד, אבל אצלנו לא רלוונטי (מפתח ציבורי + server.url)
- שניהם: צדקו שצריך דבר-דבר ולא הכל ביחד

## GPT Review — תיקונים שהתקבלו (22/10)
1. ✅ **תלות Supabase keys**: service_role ו-anon הם JWTs חתומים עם JWT secret — חייבים לטפל ביחד. שלבים 2+3 מוזגו.
2. ✅ **JWT לא צריך לחכות ללילה אוטומטית**: הועבר להיות מיד אחרי DB. ההחלטה על תזמון נשארת פתוחה.
3. ✅ **לא להניח 2-3 דקות deploy**: הוסר. ממתינים עד שעולה.
4. ❌ **באנר לא מתאים**: לא מקובל. ההודעה הרכה ("שדרוגים") היא בדיוק הגישה הנכונה — אין סיבה להפחיד משתמשות. הנקודה שהבאנר דורש deploy כן נכונה — הועבר מ"הכנה" להיות חלק מה-deploy הראשון.
