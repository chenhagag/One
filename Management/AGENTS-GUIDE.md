# Agent System Guide — One Project

## מבנה כללי

הפרויקט מחולק לסוכנים ייעודיים, כל אחד עם תיקייה משלו תחת Management/:

```
Management/
├── Dev Agents/          ← סוכני פיתוח
│   ├── Android/         ← Mobile (Capacitor): Android + iOS (עתידי)
│   ├── Analysis/        ← מערכת הניתוח: 8 prompt groups, traits, cognitiveScore, safeOutputLayer
│   ├── Backend/         ← Express, API, DB, RAG infra
│   ├── Conversation/    ← מערכת השיחה: chatManager, prompts, NewChat.tsx, ערוצים
│   ├── Frontend/        ← React, UI/UX, PWA, auth, admin, landing pages
│   ├── Automation/      ← Pipelines, cron, nudges, matching, reanalysis
│   ├── Design/          ← שפה עיצובית, brand, UX patterns
│   ├── Matching/        ← אלגוריתם התאמות, ציונים, ניתוח
│   └── Security/        ← אבטחה, הרשאות, validation
├── User Management Agents/ ← סוכני ניהול משתמשים
│   ├── CONTEXT.md + WORKLOG.md ← סוכן ראשי (מתאם): סריקה, דו"ח, הפניה
│   ├── Insights Writer/     ← כתיבת תובנות אישיות
│   ├── Match Card Writer/   ← כתיבת כרטיסי התאמה
│   └── Chat Reviewer/       ← סריקת שיחות לתקלות
├── Statistics & Reports/ ← שאילתות DB, דו"חות, KPIs, funnel, עלויות
├── Marketing/           ← דפי נחיתה, פוסטים, דשבורד סאשה
├── Functional Specification/ ← אפיון פונקציונלי, מסכי UI, דיאגרמות, תיעוד
```

---

## מבנה תיקיית סוכן

כל סוכן מכיל לפחות שני קבצים:

### CONTEXT.md (חובה)
הקובץ הראשי — כל מה שהסוכן צריך לדעת כדי לעבוד.

מבנה מומלץ:
```markdown
# [Agent Name] — Context

## Role
תיאור קצר של תפקיד ואחריות

## Current State
מצב נוכחי, מה עובד, מה שבור

## Key Files
טבלת קבצים רלוונטיים עם מיקום ותפקיד

## Architecture / How It Works
הסבר טכני של המערכת

## Known Issues
בעיות ידועות ופתוחות

## What to Read
רשימת קבצים שהסוכן צריך לקרוא כשמופעל:
1. CONTEXT.md שלו (ראשי)
2. WORKLOG.md שלו
3. CLAUDE.md (כללי — לדלג על חלקים לא רלוונטיים)
4. WORK_LOG.md (כללי — סשן אחרון)
5. Management/claude-working-guidelines.md
6. קבצים ספציפיים לסוכן

## Rules
כללים ספציפיים לסוכן (למשל "לעולם לא לשחזר keystore")
```

### WORKLOG.md (חובה)
יומן עבודה ייעודי לסוכן. מתעדכן בסוף כל סשן.

מבנה:
```markdown
# [Agent Name] — Work Log

## Latest: YYYY-MM-DD — [תיאור קצר]
- מה נעשה
- מה השתנה
- TODO לסשן הבא

---

## Previous: YYYY-MM-DD — [תיאור]
...
```

---

## כללי יצירת סוכן חדש

### מתי ליצור
- כשיש תחום עבודה מוגדר שחוזר על עצמו
- כשיש מספיק מידע ספציפי שמצדיק הפרדה
- לא ליצור סוכן "ריק" — רק כשיש תוכן אמיתי

### תהליך
1. **ליצור תיקייה** תחת Dev Agents/, User Management Agents/, או Marketing/
2. **לכתוב CONTEXT.md** עם כל המידע הרלוונטי — מקורות:
   - זיכרון מקומי (.claude/memory/) — להעביר תוכן רלוונטי
   - WORK_LOG.md — לחלץ היסטוריה רלוונטית
   - CLAUDE.md — לא להעתיק, רק להפנות לסעיפים ספציפיים
   - Management/project-status.md — לחלץ חלקים רלוונטיים
3. **לכתוב WORKLOG.md** עם היסטוריה רלוונטית
4. **לנקות** — להסיר מהזיכרון הראשי מה שהועבר לסוכן
5. **לעדכן WORK_LOG.md** הראשי — שורה כללית שמפנה לסוכן

### מה נשאר בראשי
- CLAUDE.md — ארכיטקטורה ו-API (לא זזים)
- WORK_LOG.md — סיכום כללי של כל סשן (כולל שורה על עבודת סוכנים)
- Management/claude-working-guidelines.md — הנחיות עבודה (רלוונטי לכולם)
- Management/project-status.md — סטטוס כללי, בעיות ידועות, מערכות

### מה עובר לסוכן
- פרטים טכניים ספציפיים (build commands, signing keys, API details)
- היסטוריית עבודה ייעודית
- בעיות ידועות בתחום שלו
- רשימת בודקים / אנשי קשר ספציפיים

### עדכון אפיון פונקציונלי
כשסוכן מבצע שינוי מהותי (API חדש, שינוי DB, פיצ'ר חדש, שינוי flow) —
להוסיף שורה ל-`Management/Functional Specification/CHANGES-QUEUE.md`:
```
- [YYYY-MM-DD] [שם סוכן] — תיאור קצר. קבצים: file1.ts, file2.tsx
```
סוכן האפיון יקרא את ה-queue ויעדכן את מסמך האפיון.

---

## איך מפעילים סוכן

כש-Chen אומרת משהו כמו "בוא נבנה AAB" או "צריך לתקן באג בפרונט":

1. **לזהות** איזה סוכן רלוונטי
2. **לקרוא** את CONTEXT.md + WORKLOG.md של הסוכן
3. **לקרוא** את CLAUDE.md + WORK_LOG.md (סשן אחרון) + claude-working-guidelines.md
4. **לעבוד** על המשימה
5. **לעדכן** את WORKLOG.md של הסוכן
6. **לעדכן** את WORK_LOG.md הראשי (שורה כללית)

---

## זיכרונות שממתינים להעברה לסוכנים

כל 61 קבצי הזיכרון המקוריים הועברו לקבצי הסוכנים בסשן 2026-10-03.
הרשימה שהייתה כאן כבר לא רלוונטית — כל המידע נמצא ב-CONTEXT.md של הסוכן המתאים.

אם יש זיכרון חדש שצריך להיכנס לסוכן — לעדכן ישירות את ה-CONTEXT.md או WORKLOG.md של הסוכן.
