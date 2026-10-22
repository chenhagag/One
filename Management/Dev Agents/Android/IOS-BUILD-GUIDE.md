# iOS Build Guide — One App

## מדריך מפורט ל-Claude על Mac: בניית אפליקציית iOS

### מה כבר מוכן
- Capacitor 8.4.0 מוגדר עם `iosScheme: 'https'`
- Push notifications plugin מותקן (`@capacitor/push-notifications` v8.1.2)
- קוד push כבר כתוב ועובד (frontend + backend)
- App ID: `io.joinone.app`
- הפרונטנד נטען מ-`https://joinone.io` (לא bundled) — עדכונים שוטפים לא דורשים build חדש
- קובץ `apple-app-site-association` מוכן ב-`frontend/public/.well-known/` (צריך להחליף TEAM_ID)

---

## שלב 0: דרישות מקדימות (לפני שמתחילים)

### חייב להיות מוכן לפני הישיבה על ה-Mac:
1. **Apple Developer Account** פעיל (https://developer.apple.com/account — נרשמים עם Apple ID, 99$/שנה, אישור תוך 48 שעות)
2. **Xcode** מותקן על ה-Mac (App Store, ~12GB — להתקין מראש!)
3. **Xcode Command Line Tools**: `xcode-select --install`
4. **Node.js 22**: `nvm use 22` (או להתקין nvm על ה-Mac)
5. **CocoaPods**: `sudo gem install cocoapods` (Capacitor iOS needs it)
6. **Git clone של הפרויקט**: `git clone https://github.com/chenhagag/One.git`

---

## שלב 1: הוספת פלטפורמת iOS (5 דקות)

```bash
cd frontend
npm install
npm install @capacitor/ios    # הוספת iOS platform package
npx cap add ios               # יוצר תיקיית ios/ עם Xcode project
npx cap sync ios              # מסנכרן web assets + plugins
```

**בדיקה**: תיקיית `frontend/ios/` נוצרה עם `App/` ו-`App.xcworkspace`.

---

## שלב 2: הגדרת Apple Developer Portal (20 דקות)

### ב-https://developer.apple.com/account:

#### 2a. רישום App ID
1. Certificates, Identifiers & Profiles → Identifiers → + (חדש)
2. App IDs → App
3. Bundle ID: **`io.joinone.app`** (Explicit)
4. Description: "One"
5. Capabilities — לסמן:
   - ✅ **Push Notifications**
   - ✅ **Associated Domains** (Universal Links)
   - ✅ **Sign In with Apple**

#### 2b. יצירת APNs Key (לפושים)
1. Keys → + (חדש)
2. שם: "One Push Key"
3. לסמן ✅ Apple Push Notifications service (APNs)
4. Continue → Register → **להוריד את ה-.p8 file** (אפשר להוריד פעם אחת בלבד!)
5. **לרשום את ה-Key ID** (10 תווים)
6. **לרשום את ה-Team ID** (מופיע בפינה ימנית עליונה בדף ה-Developer)

#### 2c. העלאת APNs Key ל-Firebase
1. Firebase Console → Project Settings → Cloud Messaging → iOS app
2. אם אין iOS app → Add app → Bundle ID: `io.joinone.app` → להוריד `GoogleService-Info.plist`
3. APNs Authentication Key → Upload → קובץ .p8 + Key ID + Team ID

#### 2d. יצירת Provisioning Profile
1. Profiles → + (חדש)
2. iOS App Development (לבדיקה) / App Store Distribution (להפצה)
3. App ID: `io.joinone.app`
4. Certificate: בוחרים את ה-development/distribution certificate
5. Devices: בוחרים מכשירי בדיקה (development בלבד)
6. Generate → Download

---

## שלב 3: הגדרת Xcode Project (30 דקות)

```bash
cd frontend/ios
open App.xcworkspace    # חייב xcworkspace, לא xcodeproj!
```

### ב-Xcode:

#### 3a. Signing & Capabilities
1. בוחרים target "App" → Signing & Capabilities
2. Team: בוחרים את ה-Apple Developer Team
3. Bundle Identifier: `io.joinone.app` (צריך להיות כבר מוגדר)
4. Signing Certificate: Automatic (Xcode ינהל)

#### 3b. הוספת Capabilities
לחיצה על + Capability:
1. **Push Notifications** — להוסיף
2. **Associated Domains** — להוסיף, ואז:
   - `applinks:joinone.io`
   - `webcredentials:joinone.io`
3. **Sign in with Apple** — להוסיף

#### 3c. GoogleService-Info.plist
1. הקובץ שהורדתם מ-Firebase (שלב 2c)
2. לגרור ל-Xcode → תיקיית `App/App/`
3. לוודא ש-"Copy items if needed" מסומן
4. לוודא ש-Target "App" מסומן

#### 3d. עדכון apple-app-site-association
הקובץ כבר קיים ב-`frontend/public/.well-known/apple-app-site-association`.
**חובה להחליף `TEAM_ID`** בקובץ ב-Team ID האמיתי מ-Apple Developer Portal.
```
"appIDs": ["ABC123XYZ.io.joinone.app"]
```
(ABC123XYZ = ה-Team ID שלכם)

#### 3e. Info.plist — הרשאות
לפתוח `App/App/Info.plist` ולוודא שיש:
```xml
<key>NSCameraUsageDescription</key>
<string>One needs camera access to take profile photos</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>One needs photo library access to upload profile photos</string>
```

---

## שלב 4: בדיקה על סימולטור (15 דקות)

1. ב-Xcode: בוחרים iPhone 15/16 Simulator למעלה
2. Cmd+R (Run)
3. לוודא:
   - האפליקציה נפתחת ועולה `joinone.io`
   - Google Login עובד
   - ניווט תקין
   - **פושים לא עובדים בסימולטור** — זה נורמלי, רק על מכשיר אמיתי

### בדיקה על מכשיר אמיתי (אופציונלי אבל מומלץ):
1. לחבר iPhone ל-Mac עם כבל
2. ב-Xcode: לבחור את המכשיר במקום Simulator
3. Cmd+R → לאשר "Trust Developer" על המכשיר
4. **פושים צריכים לעבוד על מכשיר אמיתי**

---

## שלב 5: Build להפצה (20 דקות)

```bash
# לפני build — לסנכרן
cd frontend
npx cap sync ios
```

ב-Xcode:
1. Product → Destination → Any iOS Device (arm64)
2. Product → Archive
3. ממתינים ל-build (2-5 דקות)
4. Organizer נפתח → Distribute App
5. App Store Connect → Upload
6. ממתינים ל-upload (5-10 דקות)

---

## שלב 6: App Store Connect (15 דקות)

### ב-https://appstoreconnect.apple.com:

1. My Apps → + (New App)
2. Platform: iOS
3. Name: **One — היכרויות חכמות** (או שם דומה, בעברית/אנגלית)
4. Bundle ID: `io.joinone.app`
5. SKU: `one-dating-app`
6. Primary Language: Hebrew

### מידע נדרש:
- **Screenshots**: צריך צילומי מסך עבור iPhone 6.7" + 6.1" (חובה)
- **Description**: תיאור האפליקציה (עברית, עד 4000 תווים)
- **Keywords**: היכרויות, דייטינג, שידוכים, WW, לסביות (עד 100 תווים)
- **Privacy Policy URL**: `https://joinone.io/privacy` (חייב להיות קיים)
- **Support URL**: `https://joinone.io`
- **Age Rating**: 17+ (Dating category)
- **Category**: Lifestyle / Social Networking

### הגשה:
1. בוחרים את ה-Build שהועלה
2. ממלאים את כל השדות
3. Submit for Review

---

## שלב 7: לאחר אישור Apple

1. Release manually (או auto-release)
2. לעדכן את הלינק באפליקציה / דף נחיתה
3. לעדכן CONTEXT.md של הסוכן

---

## פתרון בעיות נפוצות

### "No signing certificate found"
→ Xcode → Preferences → Accounts → הוסיפו Apple ID → Download Manual Profiles

### "Push notifications entitlement missing"
→ Signing & Capabilities → + Capability → Push Notifications

### CocoaPods errors
```bash
cd frontend/ios/App
pod install --repo-update
```

### "App could not be installed" on device
→ וודאו שה-Provisioning Profile כולל את ה-UDID של המכשיר

### Build fails on M1/M2 Mac
```bash
# אם cocoapods נכשל:
arch -x86_64 pod install
```

---

## מה לא צריך לעשות (כבר עובד)

- ❌ לא צריך לכתוב קוד push — כבר כתוב ב-`pushNotifications.ts`
- ❌ לא צריך לשנות את ה-backend — endpoints כבר קיימים
- ❌ לא צריך לשנות `capacitor.config.ts` — כבר מוגדר ל-iOS
- ❌ לא צריך לבנות את הפרונטנד מחדש — נטען מהשרת
- ❌ לא צריך להגדיר Firebase project חדש — משתמשים באותו project של Android

---

## קבצים סודיים (לא ב-git, צריך להעביר ידנית)

| קובץ | מקור | יעד |
|-------|-------|-----|
| `GoogleService-Info.plist` | Firebase Console → iOS app | `frontend/ios/App/App/` |
| APNs Key (.p8) | Apple Developer → Keys | Firebase Console → Cloud Messaging |

---

## עדכונים עתידיים

**רוב העדכונים לא דורשים Mac** — הפרונטנד נטען מ-`joinone.io`. רק שינויים ב:
- Capacitor plugins
- Native config (permissions, capabilities)
- App version / metadata
- Apple SDK requirements

דורשים build חדש על Mac + Apple Review.
