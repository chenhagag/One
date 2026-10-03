# Google Play — תוכנית פרסום One

## מטרה
פרסום One כאפליקציית אנדרואיד בחנות Google Play באמצעות TWA (Trusted Web Activity) — עטיפה של ה-PWA הקיים, ללא קוד אנדרואיד.

## למה TWA?
- כפתור התקנת PWA רגיל (beforeinstallprompt) יוצר WebAPK עם targetSdkVersion ישן שגורם לאזהרות אבטחה באנדרואיד 14+
- Google שולטים ב-WebAPK — אין דרך לתקן את זה מצד המפתח
- TWA בחנות Play נותן שליטה מלאה על targetSdkVersion + מראה כאפליקציה אמיתית

## מצב נוכחי
- [x] חשבון Google Play Developer מאומת ($25)
- [x] PWA תקין: manifest.json, service worker, אייקונים (192x192, 512x512)
- [x] דף Privacy Policy: https://joinone.io/privacy
- [x] דף Terms of Service: https://joinone.io/terms
- [ ] יצירת AAB (שלב טכני)
- [ ] Digital Asset Links (assetlinks.json)
- [ ] Google Play Console — מילוי טפסים
- [ ] Closed testing (20 בודקים, 14 ימים)
- [ ] Production release

---

## שלב 1: יצירת AAB (צד טכני — Claude)

### 1.1 התקנת Bubblewrap CLI
```bash
npm install -g @anthropic-ai/anthropic-sdk@anthropic-ai/bubblewrap
```
Bubblewrap מתקין אוטומטית JDK + Android SDK אם חסרים.

### 1.2 אתחול פרויקט TWA
```bash
mkdir twa && cd twa
bubblewrap init --manifest https://joinone.io/manifest.json
```
Bubblewrap קורא את ה-manifest ויוצר פרויקט אנדרואיד מוכן.

### 1.3 בניית AAB
```bash
bubblewrap build
```
ייצור קובץ `.aab` מוכן להעלאה + signing key.

### 1.4 הוספת assetlinks.json לשרת
קובץ ב-`https://joinone.io/.well-known/assetlinks.json` שמוכיח ש-One בחנות ו-joinone.io שייכים לאותו בעלים.
- צריך SHA-256 fingerprint מה-signing key
- מוגש כ-static file מהשרת

---

## שלב 2: Google Play Console (צד ידני — חן)

### 2.1 יצירת אפליקציה
- שם: One
- שפה ברירת מחדל: עברית (או אנגלית)
- סוג: App (לא Game)
- קטגוריה: Dating

### 2.2 Store Listing
- **שם**: One — Find Your Perfect Match
- **תיאור קצר**: מערכת התאמה חכמה שמכירה אותך לעומק (עד 80 תווים)
- **תיאור מלא**: הסבר על האפליקציה (עד 4000 תווים)
- **צילומי מסך**: לפחות 2 (טלפון), מומלץ 4-8
- **אייקון**: 512x512 PNG (כבר יש)
- **Feature Graphic**: 1024x500 PNG (צריך ליצור)

### 2.3 Content Rating
- שאלון IARC — לסמן "Dating" + "User-generated content"
- צפוי לקבל: Teen / Mature בהתאם לתשובות

### 2.4 Privacy & Policies
- Privacy Policy URL: https://joinone.io/privacy
- Data Safety: למלא טופס על מה נאסף (email, name, photos, chat content)

### 2.5 Target Audience
- גיל מינימום: 18+
- לא מיועד לילדים (חשוב לסמן!)

---

## שלב 3: Closed Testing (חובה לחשבון חדש)

### דרישות Google
- מינימום **20 בודקים** (אימיילי Gmail)
- **14 ימים** של בדיקות פתוחות
- הבודקים צריכים להצטרף לתוכנית הבדיקה ולהתקין

### מה לעשות
1. ליצור Closed testing track ב-Play Console
2. להעלות את ה-AAB
3. להוסיף רשימת בודקים (Gmail addresses)
4. לשלוח לבודקים לינק הצטרפות
5. לחכות 14 ימים

### טיפים
- אפשר להוסיף את עצמך + חברים/משפחה
- הבודקים רק צריכים להתקין ולפתוח — לא חייבים להשתמש באמת
- אפשר להתחיל להכין store listing במקביל

---

## שלב 4: Production Release
- אחרי 14 ימים + 20 בודקים → נפתחת אפשרות production
- להגיש production release → Google review (כמה ימים עד שבוע)
- אחרי אישור → האפליקציה חיה בחנות

---

## קבצים רלוונטיים
| קובץ | מיקום | תפקיד |
|-------|--------|--------|
| manifest.json | frontend/public/manifest.json | הגדרות PWA |
| icon-192.png | frontend/public/icon-192.png | אייקון PWA |
| icon-512.png | frontend/public/icon-512.png | אייקון PWA + חנות |
| sw.js | frontend/public/sw.js | Service worker |
| privacy.html | frontend/public/privacy.html | מדיניות פרטיות |
| terms.html | frontend/public/terms.html | תנאי שימוש |
| assetlinks.json | עדיין לא נוצר | Digital Asset Links (TWA verification) |

## הערות
- ה-TWA לא דורש קוד אנדרואיד — הכל מבוסס על ה-PWA הקיים
- עדכוני אפליקציה = עדכוני האתר (לא צריך AAB חדש בכל פעם)
- AAB חדש נדרש רק אם משנים manifest, אייקונים, או targetSdkVersion
