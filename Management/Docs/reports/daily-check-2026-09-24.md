# בדיקה יומית — 24.09.2026

## מספרים כלליים
- סה"כ משתמשות: 172
- במאגר (pool): 98
- בתהליך: 55
- הושלמו אך לא matchable: 90
- הקפיאו עצמן: 1

## רישומים ב-7 ימים אחרונים
| שם | id | מגדר | הודעות (chat/cog/taste) | תמונות | סטטוס |
|---|---|---|---|---|---|
| בר זקן | 302 | W→W | 18/18/38 | 0 | pool (UX Tester) |
| חן טסט | 301 | W→W | 0/0/0 | 0 | בתהליך (UX Tester) |
| Lea | 300 | W→W | 2/0/0 | 0 | בתהליך (UX Tester) |

שלושתן UX Testers, אין רישומים אורגניים השבוע.

## פעילות ב-48 שעות
- מרגלית (288) — 1 הודעה
- שקד שכטר (269) — 31 הודעות (פעילות גבוהה)
- בר זקן (302) — 37 הודעות (UX Tester)
- אריאל גבע (202) — 2 הודעות
- רונה דייויס (213) — 25 הודעות

## התאמות
| סטטוס | כמות |
|---|---|
| waiting_for_photo | 62 |
| frozen | 60 |
| cancelled | 40 |
| rejected_by_users | 20 |
| potential_match | 16 |
| expanded_potential_match | 8 |
| in_match | 4 |
| waiting_first_rating | 3 |
| waiting_for_response | 1 |
| approved_by_both | 1 |

## נאדג'ים (48 שעות)
- rating_reminder_3: סיון (none), מילנה (email), נועה מיתל (email)
- nudge_incomplete_1: גיל (none), מושקא (none), לינוי (none)
- nudge_not_started_1: "Your other half" id:198 (none) — שם חשוד
- photo_request_2: שלו, יפה, סיוון, אולי, מאיה — כולן channel=none
- photo_blind_question: מרגלית, מירי, נעמה, ליאת, יעל, אורטל, דלית, אבי

הרבה נאדג'ים יוצאים ב-channel=none (לא נשלחו בפועל).

## pipeline jobs (7 ימים)
- מרגלית (288): 2x photo_analysis — completed
- בר זקן (302): completion — completed
- אריאל גבע (202): 2x photo_analysis — completed
- **מילנה (280): 14x photo_analysis — FAILED** (unsupported HEIC format, חוזר מ-22.09)

## בעיות שזוהו

### 1. מילנה (280) — לולאת כשלונות photo_analysis
- 2 תמונות HEIC (פורמט אייפון) מתוך 6 שהעלתה
- OpenAI Vision לא תומך ב-HEIC → כשלון בכל reconciliation
- **בעיה מערכתית**: אין מנגנון שעוצר ניסיונות חוזרים אחרי X כשלונות
- **סטטוס**: לא טופל עדיין

### 2. channel=none בנאדג'ים
- הרבה נאדג'ים לא נשלחים בפועל (אין push token ואין email?)
- לשקול fallback או התראה לאדמין

## פעולות שבוצעו

### תובנות שנכתבו ונשמרו
| שם | id | סוג |
|---|---|---|
| בר זקן | 302 | W→W (UX Tester) |
| שקד שכטר | 269 | W→W |
| ליאת | 270 | W→W |
| שלו | 291 | W→W |
| מירי | 285 | W→W |

### תובנות שלא נכתבו
| שם | id | סיבה |
|---|---|---|
| דורית | 286 | W→M, נדחתה לפי בקשת אדמין |
| חן | 8 | חשבון אדמין |

## פעולות פתוחות
- [ ] מילנה (280): לטפל ב-HEIC — המרה או מחיקה + תיקון מערכתי
- [x] נאדג'ים channel=none: 17 WW משתמשות עודכנו ל-email_updates=true (היה false כדיפולט ישן)
- [ ] דורית (286): לכתוב תובנות (W→M, נדחתה לעת עתה)
- [x] מילנה (280): HEIC תוקן — החלפת sharp ב-heic-convert, 4 תמונות הומרו
- [x] מורן יפה (200): תמונות HEIC הומרו ל-JPEG
- [x] Deal breakers: פיצ'ר חדש — חילוץ מניתוח + תצוגה באדמין
- [x] WW external scoring: נוסחה חדשה (70% fem match + 30% appeal)
