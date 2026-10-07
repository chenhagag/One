# Claude Working Guidelines — One Project

הנחיות עבודה שנצברו מניסיון. כל סוכן שעובד על הפרויקט צריך לקרוא את הקובץ הזה.

---

## Deploy & Git

### לא לדחוף בלי אישור מפורש
**כלל ברזל**: לעולם לא לעשות git push ל-staging או production בלי לומר למשתמשת קודם ולקבל אישור. גם לא ל"תיקונים קריטיים". תמיד להגיד: "מוכן להעלאה ל-[staging/production]. לעלות?" — ולחכות ל-yes.

### לא לעשות commit בלי אישור
לא לעשות git add/commit/push אחרי כל שינוי. לחכות ש-Chen תגיד "תעלה לגיט" או "תעלה לסטייג'ינג".

### staging לפני production — תמיד
לעולם לא לדחוף ל-production (main) בלי הוראה מפורשת. תמיד staging קודם + בדיקה ידנית.
**למה**: תיקון token refresh נדחף ל-production בלי בדיקה ושבר OTP login — נדרש revert חירום.

### הפרדת branches
- "תעלה לסטייג'ינג" = push ל-staging בלבד, לא ל-main
- "תעלה לפרודקשן" = push ל-main בלבד, לא merge בין branches
- לעולם לא merge staging↔main בלי לפרט מה שונה ולקבל אישור
- אם יש commits שונים בין branches — להזהיר ולרשום מה שונה

---

## שינויי Prompts

### זהירות קיצונית בשינויי פרומפט
תקריות רבות בעבר שבהן תיקון פרומפט אחד שבר משהו אחר (ספירת הודעות, התקדמות נושאים, לוגיקת סגירה).
- לעולם לא לדחוף שינויי פרומפט ל-production בלי בדיקת staging + אישור
- שינויים מינימליים וממוקדים — לא לשכתב מה שעובד
- **להעדיף לוגיקת chatManager על משקל פרומפט** — לממש התנהגות דרך קוד ולא הוראות בטקסט. פרומפטים קלים = AI צפוי יותר

### בטיחות פרומפטים
כל פרומפט חייב לכלול: שם המערכת (One), לינק (joinone.io), סטטוס MVP, עמודי סושיאל, ואיסורים.
- **למה**: משתמשת קיבלה מהצ'אט הפנייה ל-Tinder/Bumble + אמירה שפרופילי טעם "לא אמיתיים". פגיעה חמורה באמון.
- פרופילי taste test = "כלי אבחוני" או "דוגמאות בסגנונות שונים", לא "פיקטיביים" או "בדויים"
- לעולם לא להפנות לאפליקציות מתחרות
- `SYSTEM_IDENTITY` constant ב-promptTemplates.ts משותף לכל templates A-E

---

## Staging Notifications
Railway staging רץ עם NODE_ENV=production. חייבים לבדוק גם `process.env.STAGING_URL` כדי לחסום notifications ב-staging. כל פונקציית notification חדשה חייבת לכלול את הבדיקה הזו.

---

## עדכון אפיון פונקציונלי
כשמבצעים שינוי מהותי במערכת (API חדש, שינוי DB, פיצ'ר חדש, שינוי flow), יש להוסיף שורה ל:
`Management/Functional Specification/CHANGES-QUEUE.md`

פורמט: `- [YYYY-MM-DD] [שם סוכן] — תיאור קצר. קבצים: file1.ts, file2.tsx`

סוכן האפיון (Functional Specification) יקרא את ה-queue ויעדכן את המסמך.

---

## כללי
- מידע חשוב שמור בקבצי ריפו (CLAUDE.md, Management/) — לא רק בזיכרון מקומי
- Taste test: 13 בנק, AI בוחר, ספירת פרופילים לפי שמות בהיסטוריה
