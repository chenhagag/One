# Mobile (Capacitor) Agent — Context

## Role
Responsible for building, maintaining, and publishing the One mobile apps via Capacitor.
Covers both **Android** (active) and **iOS** (future — requires Mac).

## Architecture
- **Wrapper**: Capacitor — native shell loading web frontend
- **Frontend delivery**: `server.url: 'https://joinone.io'` — app loads live frontend from server, NOT bundled assets
- **Native detection**: Capacitor 8.4.0 injects `window.androidBridge` into WebView even with `server.url`, so `Capacitor.isNativePlatform()` returns `true`. `appendUserAgent: 'OneNativeApp'` is a secondary detection method used in `getDeviceInfo()`
- **Updates**: Frontend changes deploy via Railway without new build. Rebuild only for: native plugin changes, manifest changes, Capacitor config changes, icon changes, or store version bumps
- **Shared config**: `capacitor.config.ts` is shared between Android and iOS

---

## Android

### Current State (as of 2026-10-11)
- **Google Play**: App approved! Ready for production release
- **Latest AAB**: v1.3.0 (versionCode 5) — built 2026-10-03
- **Previous**: v1.1.0 (versionCode 3) was on internal testing
- **Testing track**: Internal testing completed, tester nudges disabled
- **OAuth**: Google login working on real device, Apple Sign-In NOT implemented
- **Push notifications**: FCM configured, `google-services.json` required (not in git — secret)
- **Push permission flow**: Custom One-branded prompt on first native login → native Android prompt → registers token + sets `push_notifications=true` in DB

### Signing
- **Keystore**: `frontend/android/release.keystore`
- **Password**: `oneapp2026`, **Alias**: `one-release`
- **SHA256**: `CB:B8:1F:6D:A0:27:D9:7B:21:CB:D3:13:30:C8:3A:DF:4E:B7:72:4E:7D:46:00:54:31:BF:61:44:5D:7D:AC:6F`

### Build Commands
```bash
# Prerequisites: Node 22, JAVA_HOME set
nvm use 22.14.0
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"

# Sync web → android
cd frontend && npx cap sync android

# Build AAB
cd android && ./gradlew bundleRelease

# Output at: frontend/android/app/build/outputs/bundle/release/app-release.aab
```

### Google Play Console
- **App ID**: `io.joinone.app`
- **App name**: One
- **Category**: Dating (18+)
- **Developer account**: Verified ($25 paid)
- **Privacy Policy**: https://joinone.io/privacy
- **Terms of Service**: https://joinone.io/terms
- **Requirements for review**: Block/Report buttons (exist), EULA/consent (exists), age verification (18+)

### Android Testers (13 people — friends/family)
Emails in `Management/Docs/android-testers-emails.txt`
- Push reminders every 2 days at 13:00 Israel time via FCM (`backend/src/androidTesterNudges.ts`)
- Dedup 44 hours, gender-aware Hebrew
- Admin: manual trigger button + status endpoint (`/admin/android-tester-status`)
- `sendPushOnly` — no email fallback, no preference checks, bypasses couple tester filters
- 11 verified native installs (devices_seen native=true), 2 pending (שובל, איה)
- NOT real users — safe to push freely

| ID | Name | Status |
|----|------|--------|
| 16 | נטלי שבתאי | UX Tester, active |
| 17 | אנה | Couple Tester, inactive since 14.09 |
| 18 | הגר | Couple Tester, active |
| 23 | Nadav | UX Tester, active |
| 130 | Gal Ella | Couple, inactive since 14.09 |
| 142 | שני | Couple, active |
| 143 | Ron | Couple, active |
| 145 | הינדי | Couple, inactive since 08.09 |
| 146 | אליהו שמעיה | Couple, inactive since 08.09 |
| 289 | יותם מרטין | Couple, inactive since 08.09 |
| 298 | שובל | Couple, pending install |
| 299 | חדוה | Couple Tester, active |
| - | איה | Pending — not yet registered |

### Android Version History
| Version | versionCode | Status | Notes |
|---------|-------------|--------|-------|
| 1.0.0 | 1 | Superseded | Initial TWA build (bubblewrap) |
| 1.0.1 | 2 | Superseded | Switched to Capacitor, bundled frontend |
| 1.1.0 | 3 | Internal testing | server.url live frontend, OAuth fix |
| 1.2.0 | 4 | Rejected | Low tester activity, no version updates |
| 1.3.0 | 5 | **Pending upload** | Built 2026-10-03, ready for Google Play |

### Android Known Issues
- HEIC photos: fixed with `heic-convert` (pure JS, no native dependency)
- CSP: `https://localhost` in allowed origins for Capacitor WebView
- CORS: `https://localhost` added to backend allowed origins

---

## iOS

### Status: לא התחיל — דורש Mac

### מה צריך Mac
- **Xcode** — IDE היחיד שיכול לבנות iOS apps (רץ רק על macOS)
- **iOS Simulator** — בדיקות בלי מכשיר פיזי
- **Signing & Certificates** — Apple Developer certificates + provisioning profiles
- **העלאה ל-App Store / TestFlight** — רק דרך Xcode או Transporter

### מה מוכן בלי Mac
- קוד ה-frontend זהה (Capacitor משתף)
- `capacitor.config.ts` — משותף, כבר מוגדר
- PWA עובד על Safari/iOS כ-bookmark
- Capacitor plugins (push, splash, status-bar) — cross-platform

### צעדים כשיהיה Mac
1. **Apple Developer Account** ($99/year) — צריך להירשם
2. `npx cap add ios` — יוצר תיקיית `frontend/ios/`
3. `npx cap sync ios` — מסנכרן web → iOS
4. `npx cap open ios` — פותח ב-Xcode
5. הגדרת Signing:
   - יצירת Certificate (Development + Distribution) ב-Apple Developer portal
   - יצירת App ID (`io.joinone.app` — אותו bundle ID כמו Android)
   - יצירת Provisioning Profiles
   - הגדרה ב-Xcode → Signing & Capabilities
6. הגדרת Push Notifications:
   - APNs Key (Apple Push Notification service) — ב-Apple Developer portal
   - העלאת ה-key ל-Firebase (FCM → iOS)
   - הוספת Push Notifications capability ב-Xcode
7. OAuth:
   - Google Sign-In — הוספת iOS URL scheme ב-Info.plist
   - Apple Sign-In — הוספת Sign in with Apple capability ב-Xcode
8. Build → TestFlight → App Store Review

### iOS Requirements (App Store Review)
- **Age rating**: 17+ (dating app)
- **Privacy labels**: Data collection disclosure
- **IDFA**: כנראה לא רלוונטי (אין ads SDK)
- **Content**: Block/Report + EULA כבר קיימים
- **App Review** ב-Apple מחמיר יותר מ-Google Play — צפייה ל-1-3 ימים, תיקונים אפשריים

### אפשרויות גישה ל-Mac
- **Mac mini** (~$600) — הזול ביותר, מספיק ל-Xcode
- **MacStadium / AWS EC2 Mac** — שירות ענן, תשלום לפי שעה
- **GitHub Actions macOS runners** — ל-CI/CD builds בלבד

---

## Key Files (Shared)
| File | Purpose |
|------|---------|
| `frontend/capacitor.config.ts` | Server URL, user agent, plugins config |
| `frontend/public/manifest.json` | PWA manifest (used by Capacitor) |
| `frontend/public/.well-known/assetlinks.json` | Android deep link verification |

### Android-specific
| File | Purpose |
|------|---------|
| `frontend/android/app/build.gradle` | Signing config, versionCode/Name, dependencies |
| `frontend/android/variables.gradle` | SDK versions (target=36, min=24, compile=36) |
| `frontend/android/release.keystore` | **CRITICAL** — Release signing key |

### iOS-specific (will be created)
| File | Purpose |
|------|---------|
| `frontend/ios/App/App.xcodeproj` | Xcode project (created by `cap add ios`) |
| `frontend/ios/App/App/Info.plist` | iOS app configuration |
| `frontend/ios/App/Podfile` | CocoaPods dependencies |

---

## What to Read
1. This file (`CONTEXT.md`) — primary source of truth
2. This agent's worklog (`WORKLOG.md`)
3. `CLAUDE.md` — general architecture, tech stack
4. `Management/claude-working-guidelines.md` — deploy/staging rules, concurrent work
5. Google Play plan: `Management/Docs/GOOGLE_PLAY_PLAN.md`
6. Capacitor notes: `Management/Docs/תשובות לגבי מעטפת capacitor וסיכוני.txt`

## Rules
- NEVER recreate the Android release keystore — it's locked to Google Play
- Always bump versionCode (current: 5) for new AAB submissions
- Run `npx cap sync android` before every Android build
- Test OAuth on real device after any auth changes
- `google-services.json` is a secret — never commit to git
- iOS: `apple-app-site-association` file needed for universal links (like assetlinks.json for Android)
