# Marketing Agent — Context

## Role
ניהול שיווק ופרסום של One: דפי נחיתה, תוכן לסושיאל, דשבורד שיווק, קמפיינים, וניהול קשר עם משווקים. זה סוכן ניהול — לא קוד.

---

## מצב נוכחי — WW Only
האפליקציה פועלת כ-WW בלבד (נשים מחפשות נשים). כל השיווק מכוון לקהל הזה.

---

## דפי נחיתה

| URL | מטרה | entry_point |
|-----|-------|-------------|
| `/` | ברירת מחדל — forwomen (WW) | `forwomen` |
| `/forwomen` | זהה ל-/ (backwards compat) | `forwomen` |
| `/main` | דף כללי לכל הקהלים (לא בשימוש פעיל) | `main` |
| `/meme` | לינק של סאשה (משווקת) | `meme` |
| `/couples` | זוגות שרוצים לעזור לאמן את One | `couples` |

- `entry_point` נשמר ב-DB על המשתמשת — מאפשר מעקב מאיפה הגיעה
- Logout: WW → forwomen, non-WW → main (via localStorage)
- **דף נחיתה חדש** — עדיפות #1 בספרינט. אין הרשמות אורגניות כבר שבוע+. צריך דף משכנע עם הסבר ברור למה One שונה

---

## משווקת — סאשה (Sasha)

### פרטים
- **אימייל**: s.jo.design@gmail.com
- **לינק שלה**: `joinone.io/meme`
- **דשבורד**: `joinone.io/meme-dash-7x9k`

### דשבורד שיווק (`MemeDashboard.tsx`)
- 4 כרטיסי סטטיסטיקה + גרף 30 יום (ביקורים + הרשמות)
- גישה: JWT + email allowlist (chen.hagag@gmail.com + s.jo.design@gmail.com)
- כפתור "דשבורד שיווק" בסיידבר — רק לשני האימיילים
- טאב "דשבורד סאשה" באדמין
- מעקב ביקורים: `trackPage("landing_meme")` לביקורים אנונימיים

### מודל תשלום (מתוך כיוונים לשיווק)
- 40% מתשלום ראשון או 15% מתשלום חודשי
- מבוסס על הנחה: ~20% ממשתמשות pool ישלמו, אורח חיי ממוצע 3 חודשים
- עלות הרכשה צריכה להיות ~שליש מרווח כולל
- יתעדכן כשיהיו נתונים אמיתיים

### תגית באדמין
- "הגיעה דרך סאשה" — מוצגת ברשימת משתמשים + פרופיל
- מסנן: `entry_point = 'meme'`

---

## Instagram — פוסטי קרוסלה

### Brand Style Reference
קובץ: `Management/Marketing/Posts/square_html_package/carousel.html`

| אלמנט | ערך |
|--------|------|
| פונט כותרות | Cormorant Garamond |
| פונט גוף | Heebo |
| פונט footer | JetBrains Mono |
| צבע כותרות | `#15108B` (navy) |
| צבע גוף | `#3A3568` |
| רקע בהיר | `#F4F4FC` / `#ECEBFA` (alternating) |
| רקע כהה (CTA) | `#0E0A4D` |
| Footer | "One" ימין + "meet, as you are." שמאל |
| Elements | grain texture overlay, icon_only.png orb, anchor-line divider |
| Frame size | 1080×1080px |

### פוסטים קיימים
| קובץ | תוכן |
|-------|-------|
| `carousel.html` | נועה ואריאל — 12 slides (analysis) |
| `carousel-ff.html` | גרסת WW |
| `campaign-no-search.html` | קמפיין "בלי חיפוש" |
| `campaign-no-search-f.html` | גרסה נשית |
| `campaign-no-search-ff.html` | גרסת WW |
| `fb-cover-ff.html` | כיסוי פייסבוק WW |
| `womenCarosel/` | קרוסלה לנשים (slides + HTML) |
| `PostExample/` | 8 slides דוגמה |
| `couplesData/` | קרוסלת זוגות |

### מבנה slide
```
headline → explain (מתחת לכותרת) → anchor-line → match-tag → body-text → footer
```
- כותרת עם סיבוב קל
- Match tags: pill badges צבעוניים (ירוק/אדום/צהוב עם border)
- שמות בצבעים: נועה=`#8B2E6A`, אריאל=`#1B4FA0`
- Enneagram ו-MBTI כוללים disclaimer שהם לא מבוססי מחקר

### Slides של פוסט נועה ואריאל
1. Cover (רקע לבן + תמונה)
2. Cognitive style (good match)
3. Culture (good relative match)
4. Temperament (low match)
5. Emotional processing (low-medium match)
6. Attachment style (no rating)
7. Values / Schwartz (very good match)
8. Big Five (good-medium match)
9. Enneagram (both type 3)
10. MBTI (Noa=ESFJ, Ariel=ESFJ/ESTJ)
11. Verdict (medium-high score)
12. CTA (dark bg)

---

## LGBTQ+ Launch Plan

### מצב טכני
- מערכת מוכנה טכנית ל-WW (audit 2026-07-14)
- Gender filtering, profile routing, gender instructions — הכל עובד
- Hebrew text inclusive (בן/בת זוג, תאר/י)

### Content Gap — חסם להשקה
**`taste-profiles-female-ff.txt`** — פרופילי טעם לנשים שמחפשות נשים הם gender-swap שטחי של פרופילים הטרוסקסואליים. צריך שכתוב אותנטי עם פרספקטיבה לסבית אמיתית לפני השקה בקהילה.

### תוכנית
- קידום בקהילה לסבית (טרם התחיל)
- חייב להרגיש אותנטי — לא "pink-washing"

---

## חומרי שיווק נוספים
| קובץ | מיקום | תוכן |
|-------|--------|-------|
| coverDesigned.jpeg | `Management/Marketing/` | תמונת כיסוי מעוצבת |
| screenShots/ | `Management/Marketing/screenShots/` | 8 צילומי מסך לחנות |
| כיוונים לשיווק.txt | `Management/Marketing/` | הודעה לסאשה עם מודל תשלום |
| PostsNotes.txt | `Management/Marketing/Posts/` | הערות על פוסטים |

---

## תחרות
- אפליקציית שידוכים מתחרה פתחה להרשמות, משיקה **נובמבר 2026**
- צריך גרסה יציבה ומשכנעת מוכנה לפרסום לפני כן
- עדיפות #1: דף נחיתה משכנע — בלעדיו אין הרשמות

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `Management/Marketing/` — כל חומרי השיווק
4. `Management/Dev Agents/Design/CONTEXT.md` — brand identity + post style (שם הפירוט העיצובי)
5. `Management/claude-working-guidelines.md` — general rules

## Rules
- כל פוסט חדש מבוסס על brand template (`square_html_package/carousel.html`)
- WW-first — כל תוכן שיווקי צריך להתאים לנשים מחפשות נשים
- entry_point tracking — כל לינק שיווקי חדש צריך entry_point ייעודי
- female-ff profiles — לא להשתמש בפרופילים הנוכחיים בשיווק לקהילה, הם לא אותנטיים
