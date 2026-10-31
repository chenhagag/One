# ניתוח חיצוני והתאמת נשיות/גבריות — מסמך מסכם

תאריך: 2026-10-31

## סקירת המערכת: מי מעדכן מה

שלושה מקורות נתונים מזינים את מערכת ההתאמה החיצונית:

| מקור | מה מעדכן | איפה נשמר | טריגר |
| --- | --- | --- | --- |
| ניתוח תמונה (photoAnalysis.ts) | appeal, fitness_aesthetic, femininity_masculinity | user_look_traits (source=ai) | העלאת תמונה (אוטומטי אם יש consent) או כפתור "ניתוח חיצוני" באדמין |
| הזנה ידנית (אדמין) | appeal, fitness_aesthetic, femininity_masculinity | user_look_traits (source=manual) | Chen מזינה ידנית, לעולם לא נדרס על ידי AI |
| ניתוח שיחה (analysis agent) | gender_conformity, femininity_preference | user_traits + user_look_traits (desired_value) | ניתוח רגיל / reanalyze |

הניתוח הטקסטואלי החיצוני (external-system.txt) **בוטל לחלוטין** — היה מנסה לחלץ traits ויזואליים מטקסט, דרס ערכים ידניים עם null, ובוזבז tokens.

## ניתוח תמונה (photoAnalysis.ts)

GPT-4o Vision מנתח עד 4 תמונות של המשתמשת ומחזיר 3 ציונים (0-100):

| Trait | מה מודד | כיול |
| --- | --- | --- |
| appeal | אטרקטיביות כללית | 50 = ממוצעת/רגילה, 65-75 = יפה, 80+ = בולטת |
| fitness_aesthetic | מראה כושר/גוף | רזה = 65+, רזה+חטובה = 75+, ספורטיבית = 85+ |
| femininity_masculinity | נשיות מול גבריות | baseline 75 לנשית רגילה, 50 = על התפר/אנדרוגינית, מתחת ל-30 = בוצ'ית מובהקת |

תנאים להרצה: photo_ai_consent = true + לפחות תמונה אחת. הגנות: לעולם לא דורס source=manual. Temperature 0.1 לעקביות. רזולוציה: detail=auto.

**בעיה פתוחה:** הציונים עדיין לא מדויקים לחלוטין — בעיקר בנשיות/גבריות, GPT נותן ציונים דומים מדי לנשים שונות.

## ניתוח טקסט: gender_conformity + femininity_preference

שני ציונים מופקים מהשיחה (לא מתמונה):

| ציון | פרומפט | סקאלה | שימוש |
| --- | --- | --- | --- |
| gender_conformity | personal-style-system.txt | 0 = הבעה גברית/בוצ'ית, 100 = הבעה נשית קלאסית. baseline לנשית רגילה = 70-100, על התפר = 40-60, בוצ'ית = 10-35 | חלק מקטגוריית femininity_match (40% מהציון) |
| femininity_preference | general-info-system.txt | 0 = נמשכת רק לגבריות, 50 = גמישה, 100 = נמשכת רק לנשיות | desired_value בהתאמה — מול הציון של הצד השני |

gender_conformity הוסר מקטגוריות style ו-vibe. הפרומפט עודכן להקשר WW/לסבי.

femininity_preference נשמר כ-desired_value בטבלת user_look_traits (trait id=13). רק למשתמשות WW.

## ציון התאמה חיצוני (external score)

ציון ההתאמה החיצוני מחושב ב-matchStage2.ts ומשולב בציון הסופי (30% external, 70% internal — או 35%/65% למשתמשות רגישות למראה).

### WW (נשים-נשים)

60% femininity_match (טקסט+תמונה משולב) + 40% appeal/fitness:

- **נשיות (60%):** ציון femininity_match המשולב (40% טקסט + 60% תמונה) מול desired של הצד השני, שני כיוונים, minimum (weakest link).
- **appeal + fitness (40%):** דמיון, appeal במשקל כפול מ-fitness.
- **Penalty:** אם femininity_match < 40, מכפיל penalty (femMatch/40) על כל ה-external score. femMatch=20 → external × 0.5.
- אין נתוני נשיות בכלל → fallback ל-appeal+fitness בלבד.

### Non-WW (הטרו)

דמיון פשוט: appeal (משקל ×2) + fitness (משקל ×1). אין התייחסות לנשיות/גבריות.

### אם אין נתונים חיצוניים

external = null → ציון סופי = 100% internal.

## קטגוריית femininity_match

קטגוריה ב-candidate_matches שמשלבת את שני מקורות הנשיות (טקסט + תמונה) מול ההעדפה של הצד השני.

### לוגיקת החישוב

לכל כיוון (A→B): כמה A מתאימה למה ש-B רוצה?

- **אם יש גם טקסט וגם תמונה:** 40% gender_conformity + 60% femininity_masculinity
- **רק תמונה:** 100% femininity_masculinity
- **רק טקסט:** 100% gender_conformity (רק אם confidence ≥ 0.2)
- **ציון כיוון:** 100 - |desired_Y - personal_X|

ציון סופי = minimum של שני הכיוונים (weakest link).

### משקל בפרופיל

score_femininity_match נכנס ל-profile score עם משקל ×2. נכנס גם ל-external score ב-WW (60%).

## קידום להתאמה (Promotion)

- **potential_match**: internal criteria (internal_score > 70 AND internal_profile_score > 70, OR avg > 70) + final_score > 70
- **optional**: internal criteria עוברים אבל final_score ≤ 70 (נפל בגלל external/femininity)
- **expanded_potential_match**: כמו potential_match אבל עם הרחבת גיל/מיקום

## שינויים שבוצעו (סשן 31/10/2026)

| קובץ | שינוי |
| --- | --- |
| photoAnalysis.ts | צומצם ל-3 traits, רזולוציה auto, פרומפט מכויל עם סקאלות מפורשות, temperature 0.1 |
| matchStage2.ts | external score חדש (WW: 60/40 fem/appeal), קטגוריית femininity_match, penalty, סטטוס optional, הסרת gender_conformity מ-style/vibe |
| schema.pg.ts | migration לעמודת score_femininity_match |
| loader.ts | ביטול external text analysis, הגנה על manual traits מדריסה |
| personal-style-system.txt | עדכון פרומפט gender_conformity להקשר WW |
| AdminView.tsx | הסרת כפתור External, טאב optional, הצגת score_femininity_match |

## בעיות פתוחות

- [ ] כיול ניתוח תמונה — נשיות/גבריות עדיין לא מבדיל מספיק
- [ ] Deal breakers — לא משולבים בהתאמה
- [ ] העדפות ספציפיות — עישון, ילדים, דת לא משפיעים על ציון
- [ ] ציון חיצוני למשתמשות בלי consent — תלויות בהזנה ידנית
- [ ] ריצה מחדש של ניתוח תמונה — להריץ על כל המשתמשות עם consent+תמונות
