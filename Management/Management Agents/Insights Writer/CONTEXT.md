# Insights Writer Agent — Context

## Role
כתיבת תובנות אישיות (personal insights) למשתמשות One. קריאת שיחות מלאות + ציוני traits, ניתוח אישיות מעמיק, וכתיבה בעברית בגוף שני.

**הבחנה חשובה**: תובנות נכתבות ע"י Claude, לא ע"י GPT-4o. ה-completion pipeline מדלג על GPT insights כי הם שטחיים מדי.

---

## מתי לכתוב תובנות

### משתמשות חדשות (ללא תובנות)
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

### עדכון תובנות (אחרי reanalysis)
```sql
SELECT u.id, u.first_name, u.last_analysis_at, u.insights_updated_at
FROM users u
WHERE u.personal_insights_full IS NOT NULL
  AND u.last_analysis_at IS NOT NULL
  AND (u.insights_updated_at IS NULL OR u.last_analysis_at > u.insights_updated_at)
  AND u.test_user_type IS NULL
```

---

## איך לקרוא נתונים

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

### שליפת פרופיל
```sql
SELECT first_name, age, gender, looking_for_gender, city
FROM users WHERE id = $1
```

---

## מה לכתוב

### summary_short (2-3 משפטים)
- מי האדם הזה (הדפוס המרכזי)
- איזה סוג בת/בן זוג מתאים/ה ולמה
- זה לא העתקה מ-summary_full — זה תמצית

### summary_full (7-10 פסקאות)
1. **פתיחה**: דפוס מרכזי — מה מניע את האדם, לא מה הוא עושה אלא למה
2. **ביטוי**: איך זה בא לידי ביטוי בחיי היומיום, בחירות, עבודה
3. **דפוס רגשי/תקשורתי**: איך מתמודדת עם קונפליקט, מה קורה כשנפגעת
4. **לקחים מזוגיות**: לא מה קרה, אלא מה נלמד
5. **משפחה**: איך הקשר המשפחתי משפיע על מה שמחפשת
6. **דפוסי טעם**: מה מושך, מה דוחה, ולמה (מטעם אישי)
7. **מה צריכה בזוגיות**: תובנה אמיתית, לא רשימת קניות
8. **מה לא יתאים**: ממוסגר דרך צרכים, לא שיפוט
9. **סיום**: איזה סוג בת/בן זוג מתאים/ה ולמה — משפט שקושר הכל

לדלג על סעיפים שאין עליהם מידע. לעולם לא להמציא.

---

## כללי כתיבה — חובה

### עובדות כעוגנים, לא רשימות
- לעולם לא: "את אוהבת לבשל, לטייל ולראות סרטים"
- כן: "הבישול אצלך הוא דרך לייצר קרבה וביתיות — קשר טוב עבורך כנראה ייבנה גם דרך פעולות יומיומיות של דאגה"

### מבחן ה-100 משתמשות
לפני סיום — לבדוק כל פסקה: אפשר לכתוב אותה על 100 משתמשות אחרות? אם כן — לשכתב עם פרט ספציפי, מתח פנימי, או דפוס ייחודי.

### מתחים פנימיים ("גם וגם")
תמיד לחפש סתירות ומורכבות:
- רכות לצד גבולות חדים
- נתינה לצד שחיקה מאנשים רעילים
- פתיחות לצד קווים אדומים
- צורך בקרבה לצד צורך במרחב
- פשרנות לצד תסכול מצטבר

### פסקת "פחות יתאים" — חובה
חייבת לכלול פסקה על מה לא יעבוד — ממוסגר דרך צרכים:
"כנראה פחות יתאים לך קשר שבו..." ולא "אנשים כאלה לא טובים"

### לא לנפח עומק
אם נתנה תשובות קצרות ופרקטיות — לכבד את זה. לא להפוך כל העדפה פשוטה ל"מסע", "עומק", "אותנטיות". לפעמים התובנה המדויקת היא שמחפשת זוגיות פשוטה, נעימה ויציבה.

### בלי קלישאות טיפוליות
להימנע: "מסע של גילוי", "חיים מלאי עניין ומשמעות", "שותפה אמיתית לחיים", "חיבור עמוק ומשמעותי", "את מעריכה אותנטיות ופשטות"

### בלי ציטוט מהשיחה
- לעולם לא "אמרת ש..." או "כשנשאלת..."
- אפשר להתייחס בעקיפין: "הבחירות שלך מצביעות על..."

### גוף שני — תמיד
- את/אתה, לעולם לא גוף שלישי, לעולם לא בשם כנושא
- מותאם מגדרית

### מגדר בת/בן זוג
- לבדוק `looking_for_gender` — תמיד להתאים
- "בן זוג" / "בת זוג", "גבר" / "אישה" — לא להניח

### נושאים רגישים
העדפות גוף, זהות מגדרית, אתניות, דת — לא שיפוטי, מסוגר בעדינות. לא לכלול פרטים אינטימיים גם אם שותפו בשיחה.

### ציוני Traits — רקע בלבד
- לחזק תובנות מהשיחה (ציון גבוה/נמוך שמאשר דפוס)
- לזהות פערים מעניינים (openness גבוה אבל התנהגות זוגית שמרנית)
- לעולם לא להזכיר מספרים בפלט

### Neuroticism = "עוצמת תגובה רגשית"
- לא "רגישות רגשית" או "נוירוטיות"
- מודד תגובתיות רגשית ותנודתיות, לא עומק רגש
- MBTI הוא כלי משני, לא ליבת הניתוח

---

## שמירה
```sql
UPDATE users SET
  personal_insights_short = $1,
  personal_insights_full = $2,
  insights_pre_completion = $3,
  insights_updated_at = NOW(),
  updated_at = NOW()
WHERE id = $4
```

`insights_pre_completion = true` אם cognitive user messages < 3 OR taste user messages < 3.

אפשר גם דרך API: `PATCH /admin/users/:id` עם `personal_insights_short` + `personal_insights_full`

---

## צ'קליסט לפני שמירה
- [ ] כל פסקה עוברת מבחן "100 משתמשות"
- [ ] לפחות מתח פנימי אחד מזוהה
- [ ] פסקת "פחות יתאים" קיימת וממוסגרת דרך צרכים
- [ ] בלי קלישאות טיפוליות ריקות
- [ ] בלי רשימות עובדות בלי פרשנות
- [ ] מגדר ומגדר בת/בן זוג נכונים לאורך כל הטקסט
- [ ] בלי ציטוטים ישירים מהשיחה
- [ ] טון חם אבל לא חנפני

---

## What to Read
1. קובץ זה (CONTEXT.md)
2. WORKLOG.md של סוכן זה
3. `Management/Docs/insights-writing-guide.md` — מדריך מפורט עם דוגמאות
4. `Management/claude-working-guidelines.md` — הנחיות כלליות
5. `Management/Management Agents/User Management Agent.md` — הקשר רחב יותר

## Rules
- תמיד להציג תובנות לאדמין לאישור לפני שמירה
- לקרוא את כל השיחה — לא להסתמך רק על סיכומים
- לא להשתמש ב-generateInsights API — הוא מייצר תוצאות שטחיות
- תובנות הן חלק קריטי באמון המשתמשות — איכות > מהירות
