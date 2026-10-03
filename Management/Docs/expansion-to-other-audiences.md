# הרחבה לאוכלוסיות נוספות — נקודות לעדכון

מסמך זה מפרט את כל הנקודות שיש לעדכן אם One תתרחב מעבר לקהילה הנוכחית (נשים שמחפשות נשים) לקהלים נוספים.

## פרומפטים (Backend)

### `context-system-info.txt`
- כל הטקסט כתוב כרגע בלשון נקבה כברירת מחדל
- "אפליקציית שידוכים שנבנתה עבור נשים שמחפשות נשים"
- "האישה בעלת אחוז ההלימה הגבוה ביותר"
- "משתמשות" במקום "משתמשים"
- כל ההנחיות ל-AI בלשון נקבה (שאלי, הסברי, ציני, דברי)
- סעיף "מה את מחפשת לי" — הדוגמה מדברת על "מישהי סקרנית"
- סעיף סיוע בהתאמה — "שתיהן יהיו פנויות"
- שדות נדרשים — הסרנו "גובה" ו"מגדר מבוקש" (כי WW auto-set)

### `buildGenderInstruction()` בchatManager.ts
- בלוק isWW מוזרק כשgender=woman ו-looking_for_gender !== "man"
- מתאר את האפליקציה כ"שידוכים לנשים שמחפשות נשים" + פתיחות לספקטרום הקוויארי
- צריך להוסיף בלוקים מקבילים לקהלים אחרים (MM, straight, etc.)

### פרומפטים נוספים שצריך לבדוק
- `cognitive-chat.txt` — שאלות כיול
- `taste-test-chat.txt` — הוראות טסט טעם
- `context-profile.txt` — הקשר פרופיל
- Prompt templates A/B/C/D/E ב-`promptTemplates.ts`

## Frontend — isWW flag

### הגדרת isWW (7 קבצים)
כרגע: `gender === "woman" && looking_for_gender !== "man"`
צריך להפוך למנגנון כללי יותר אם יש קהלים נוספים.

| קובץ | מה מותאם |
|-------|----------|
| `App.tsx` | entry point detection, logout redirect |
| `NewChat.tsx` | UI texts, channel names, status messages, match celebration |
| `ProfileEdit.tsx` | field labels, placeholders, hidden fields (gender, height) |
| `Insights.tsx` | MBTI/Big Five descriptions, wwRel() helper |
| `ConsentScreen.tsx` | consent text |
| `MatchCard.tsx` | demo card, pronoun handling |
| `MatchCardConsentScreen.tsx` | consent text |

### AdminView.tsx
- פילטר "ww" בודק `looking_for_gender === "woman"` — צריך עדכון אם יש both/any
- תצוגת looking_for_gender — כבר תומך ב-both/doesnt_matter

## Backend — סינון Nudges

### 4 מערכות nudge מסננות:
`COALESCE(gender, '') != 'man' AND COALESCE(looking_for_gender, '') != 'man'`

אם מתרחבים — להסיר את הסינון או להתאים לקהל.

| קובץ | סעיפים |
|-------|--------|
| `userNudges.ts` | 3 queries (welcome, not_started, incomplete) |
| `photoNudges.ts` | 1 query (candidates) |
| `messageNudges.ts` | 2 queries (system_questions, admin_messages) |
| `ratingNudges.ts` | 1 query (pending ratings) |

## Backend — Matching

### matchStage1.ts
- Gender filtering — כרגע בודק gender + looking_for_gender
- צריך להתאים ל-both/any/doesnt_matter

### Taste test profiles
- 4 קבצי פרופילים: female, male, female-ff, male-mm
- נבחר לפי gender + looking_for_gender

## Landing Pages

### `/forwomen` (AuthScreen.tsx)
- דף נחיתה ייעודי לנשים — כברירת מחדל
- `/main` — דף כללי ישן (עדיין קיים)
- ProfileSetup — auto woman/woman, שדות מוסתרים

## Database

### `looking_for_gender` column
- כרגע validation מקבל רק `man` | `woman`
- צריך להרחיב ל-`both` | `doesnt_matter` | `non_binary` וכו'
- validation ב-index.ts שורה ~782

### `entry_point` column
- כרגע "forwomen" — צריך entry points נוספים לקהלים אחרים

## Email Templates

### nudge emails
- לשון נקבה בכל templates
- "כנסי", "ברוכה הבאה", "שמחות שהצטרפת"

### welcome email (pipeline)
- לשון נקבה

## Insights Writing (Claude Agent)

### `insights-writing-guide.md`
- כללי כתיבה — לוודא שמתאימים לכל קהל
- את/אתה — לפי מגדר

## PWA / Mobile

### manifest.json
- תיאור האפליקציה

## SEO / OG / Preview

### כותרת ותיאור לתצוגה מקדימה
- `<title>` + `<meta og:title>` + `<meta twitter:title>` — כרגע "One - AI Matching"
- `<meta og:description>` + `<meta name="description">` — צריך להתאים לקהל
- תמונת preview (`og:image`) — כרגע כללית

### קישור ראשי (entry point)
- `/` כרגע מפנה ל-`/forwomen` — צריך לשנות אם יש קהלים נוספים או דף נחיתה כללי
- Logout redirect logic ב-App.tsx (isWW → forwomen, אחרת → main)

## App Stores

### Google Play
- כותרת האפליקציה ותיאור ב-Play Console
- מסכים לדוגמה (screenshots) — כרגע מותאמים לנשים
- Feature graphic
- קטגוריה (Dating)

### Apple App Store (עתידי)
- כותרת, subtitle, description
- מסכים לדוגמה (screenshots) — iPhone + iPad
- Preview video (אם יהיה)
- Keywords
