# User Management Agent — One

## מטרה
סוכן שמנהל את מחזור החיים של משתמשים — מרגע ההרשמה ועד הכניסה למאגר ההתאמות. הסוכן רץ דרך Claude Code, קורא את מצב המשתמשים מה-API/DB, מבצע פעולות, ומייצר דו"חות.

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

#### 1.2 סריקת תקלות בשיחות (TODO — עתידי)
- סריקת שיחות חדשות/שהשתנו
- זיהוי: הפניות לאפליקציות אחרות, "אני צ'אטבוט", שאלות חוזרות, תקיעות, שגיאות

#### 1.3 דיווח משתמשים לא פעילים (TODO — עתידי)
- 7+ ימים בלי כניסה + תהליך לא שלם

#### 1.4 סריקת דיווחי באגים (TODO — עתידי)
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

## פעולות אוטומטיות (רצות בלי סוכן)

| פעולה | איפה | מתי |
|-------|-------|------|
| Completion pipeline | jobRunner (כל 2 דק') | משתמש סיים הכל → כניסה למאגר (בלי תובנות) |
| Photo analysis | jobRunner + reconciliation יומית | ניתוח תמונות למי שנתן הסכמה |
| Auto-analysis (traits) | בסיום שיחה כללית | שתי ריצות ניתוח traits אוטומטיות |
| Welcome email + nudges | backend cron יומי | ברוכים הבאים / תזכורת 48 שעות / תזכורת שבוע |

### מיילים/התראות אוטומטיים — לוגיקה
| תנאי | פעולה | ערוץ |
|-------|--------|------|
| נרשם + לא קיבל welcome | ברוכים הבאים | push (אם יש token) / מייל (אם אין) |
| 48+ שעות, 0 הודעות | "בואי נתחיל" | push / מייל |
| 7+ ימים, לא השלים | "בואי נמשיך" | push / מייל |

בחירת ערוץ: בדיקה ב-`fcm_tokens` אם יש token פעיל + `push_notifications = TRUE` → push. אחרת → מייל (אם `email_updates = TRUE`). נרשם ב-`notification_log` + `email_log` למניעת כפילויות.

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
