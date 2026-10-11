# Statistics & Reports Agent — Work Log

## Latest: 2026-10-11 — IP-Based Entry Point Attribution for Native App

### שיוך entry_point לפי IP למשתמשות אפליקציה נטיבית
- כשמשתמשת נכנסת מהאפליקציה הנטיבית (Android) בלי entry_point ספציפי, המערכת מחפשת ב-`page_views` ביקור מאותו IP ב-48 שעות האחרונות
- אם נמצא `landing_meme` / `landing_barazany` וכו' → המשתמשת מתויגת אוטומטית
- פותר מצב: משתמשת גולשת לדף נחיתה בדפדפן → מורידה אפליקציה → נרשמת → עדיין מתויגת נכון
- הלוגיקה רצה פעם אחת ב-`/auth/sync` — אחרי שתויגה, ה-entry_point קבוע
- **שינוי ב-**: `backend/src/index.ts` — פונקציית `resolveEntryPoint()` ב-`/auth/sync`
- **שינוי נלווה**: `/new-chat/status` מחזיר עכשיו גם `email_updates` + `whatsapp_updates` (לטובת push permission flow של סוכן Android)

---

## 2026-10-06 — Entry Point Fix + Landing Analytics Accuracy

### תיקון entry_point בהרשמה
- entry_point נשמר כעת ב-auth/sync (רגע ההרשמה), לא רק ב-ProfileSetup
- Backfill למשתמשות קיימות בלי entry_point (לא דורס ערך קיים)
- Badge ורוד "עדי" באדמין (טבלת משתמשים + דף משתמשת)

### תיקוני דפי נחיתה באדמין
- byPage + conversions מסוננים לפי תקופה נבחרת (היו all-time)
- הוספת `total_registered_all` — ספירת כל הרשמות בתקופה ללא תלות ב-entry_point
- available_months מציג רק חודשים עם ביקורים בפועל

### דשבורדי משפיעניות
- טבלת "פירוט הרשמות" (שם + תאריך + שעה) החליפה טבלת ביקורים אנונימיים

---

## 2026-10-05 — Adi Barazani Marketer Dashboard + Analytics Cleanup

### מערכת דשבורד משפיענית — עדי ברזני
- דף נחיתה: `joinone.io/barazany` → entry_point=`barazany`, tracking=`landing_barazany`
- דשבורד חיצוני: `joinone.io/adi-dash-3k7q` — URL סודי, דורש login
- Endpoint: `GET /api/adi-dashboard` — גישה רק ל-chen + adibar90@gmail.com
- `MarketerDashboard.tsx` — קומפוננטה גנרית (configurable endpoint/title/link) לשימוש חוזר
- Refactored: `getMarketerDashboard()` helper משותף ל-meme + adi endpoints
- אדמין: טאב "דשבורד עדי" (ערכת צבעים ורודה) תחת Analytics

### תפריט סיידבר — הפרדת גישות
- חן: "דשבורד סאשה" + "דשבורד עדי" (שני כפתורים)
- סאשה: "דשבורד כניסות" (meme בלבד)
- עדי: "דשבורד כניסות" (adi בלבד)
- אין cross-access בין משפיעניות, אין גישה לאדמין לאף אחת מהן

### סינון אדמין מאנליטיקות
- `ANALYTICS_EXCLUDED_USERS = [150]` — מסנן את חן מכל שאילתות page_views, landing stats, conversions, דשבורדי שיווק
- נמחקו page_views של user #150 (1,022 + 8 נוספים)

### שיפורי UI
- לינקים מלאים בדשבורדים (`joinone.io/barazany`, `joinone.io/meme`) לנוחות העתקה

---

## 2026-10-03 — Landing Page Analytics + IP Tracking
- New sub-tab **"דפי נחיתה"** under Analytics — dedicated landing page stats
  - Summary cards: total visits, unique IPs, registrations, conversion rate
  - Per-page table with drill-down to daily breakdown
  - 30-day chart: visits vs unique IPs
- Added `ip` column to `page_views` table (VARCHAR(45)) — saved on every track-page call
- Added `trackPage("landing_forwomen")` — forwomen landing now tracked (like meme was)
- New endpoint `GET /admin/landing-stats` — per-page stats, daily breakdown, conversions
- Added per-user page view lookup in "נתוני כניסה" tab — search by name/ID/email, view visit history
- Separated landing tracking: root `/` → `landing_home`, `/main` → `landing_main`, `/couples` → `landing_couples`
- Deleted 1,022 page_views for admin user #150 (Chen) — noise reduction

### TODO — Landing Analytics Improvements
- **הפרדת entry_point ל-root**: כרגע `/` שומר `entry_point = "forwomen"` — צריך לשנות ל-`"home"` כדי להפריד המרות root מ-`/forwomen`
- **fallback המרה לפי כניסות**: כשאין נתוני IP (נתונים היסטוריים לפני הוספת העמודה), לחשב המרה לפי סה"כ כניסות במקום unique IPs
- **נתוני IP היסטוריים**: כל הכניסות לפני 03.10.2026 נשמרו בלי IP — אחוזי המרה לפי unique IPs יהיו מדויקים רק מהתאריך הזה

## 2026-10-03 — Admin Analytics Tab Consolidation
- Consolidated 5 separate admin tabs (Analytics, גילאים, דשבורד סאשה, סקר, סקר WW) into single "Analytics" tab with sub-tabs
- Current "Analytics" page views renamed to "נתוני כניסה" as first sub-tab
- Updated CONTEXT.md with full admin dashboard structure, survey endpoints, cost tracking columns
- Sub-tabs: נתוני כניסה | דפי נחיתה | גילאים | דשבורד סאשה | סקר | סקר WW

## 2026-10-03 — Agent Created
- Statistics & Reports agent created
- Documented all data sources: 16 key DB tables, guide values, user lifecycle stages, match status flow
- Existing analytics infrastructure mapped: admin stats, age distribution, page views, meme dashboard, token tracking
- Common query patterns provided: user funnel, engagement, AI costs, retention
- WW-only filtering rules documented

---

## History

### Existing Analytics (pre-agent)
- **Admin Overview tab**: stat cards with total users, traits, matches, AI costs
- **Age Distribution tab**: WW users grouped by age with pool/matched counts
- **Analytics tab**: page view tracking (global + per-page detail)
- **Meme Dashboard**: Sasha's marketing stats (entry_point='meme')
- **System Log tab**: system_activity_log viewer
- **Token tracking**: per-user, per-action cost tracking since 2026-07
