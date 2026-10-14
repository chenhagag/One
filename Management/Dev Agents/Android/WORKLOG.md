# Mobile (Capacitor) Agent — Work Log

## Latest: 2026-10-13 — Launch Day Health Dashboard + Settings + Fixes

### Settings push toggle for all native app users — DONE
- Toggle visible for anyone with `has_native_app` (from `devices_seen`), not just current WebView
- From browser: shows hint "השינוי ייכנס לתוקף בפתיחה הבאה של האפליקציה"
- From native app: enabling also triggers `initPushNotifications()` (FCM registration)
- Backend: `/new-chat/status` returns `has_native_app` computed from `devices_seen`

### ProfileSetup validation UX fix — DONE
- User 312 (greatwave.blr) stuck 10 attempts on "נתוני פתיחה" — couldn't see error
- Added auto-scroll to notification card on validation error
- Added red border on the card when no channel selected
- Files: `frontend/src/ProfileSetup.tsx`

### IP attribution: subnet /24 matching — DONE
- CGNAT on mobile networks causes IP to vary by last octet between browser and app
- Changed `WHERE ip = $1` to `WHERE ip LIKE '152.233.13.%'` (first 3 octets)
- Verified: user 313 (Shani Zandberg) had IPs `152.233.13.165` (browser) vs `152.233.13.164` (app)
- Files: `backend/src/index.ts` (`resolveEntryPoint()`)

### System Health Dashboard — DONE
- אדמין → אנליטיקות → "בריאות מערכת"
- **Endpoint**: `GET /admin/system-health`
- **מה מוצג**:
  - פעילות כרגע (שעה אחרונה) — פעילות + בשיחה
  - משפך הרשמה 24ש — landing → registration → profile → consent → chat
  - משפך לפי מקור (forwomen/meme/barazany)
  - בריאות Push — native users vs FCM tokens vs push enabled, sent/failed
  - ערוצי התראות — push/email/whatsapp/ללא ערוץ
  - משתמשות תקועות — profile_complete=false אחרי 10+ דקות
  - תקועות בנתוני פתיחה — 3+ ניסיונות טעינה
  - שגיאות אחרונות מ-error_logs
- **אינדיקטורים**: אדום = דורש תשומת לב, ירוק = תקין
- **מדריך קריאה** בתחתית הדף
- **עדכון**: משפך לפי מכשיר (Android מודגש בצהוב, אדום אם תקוע)
- **עדכון**: push enabled מפורק ל-native (אמיתי) vs web-only (לא רלוונטי)

### Google Play download banner in web app — DONE
- באנר במסך הבית למשתמשות Android web: "One זמינה עכשיו ב-Google Play!" + לינק להורדה
- מופיע רק: Android UA + לא באפליקציה נטיבית + לא נסגר קודם
- כפתור X לסגירה (localStorage flag, לא מופיע שוב)
- טקסט בנשי תמיד (קהל יעד נשים)
- Files: `frontend/src/NewChat.tsx`

### Google Play email campaign — DONE (2026-10-14)
- מייל "One זמינה עכשיו כאפליקציה" נשלח ל-35 משתמשות WW Android עם פרופיל מלא
- לא כולל: couple testers, user 312 (greatwave), user 313 (shani zandberg)
- כולל: לוגו, כפתור הורדה מ-Google Play, הערה שאפשר להמשיך בדפדפן, פוטר עם לינקי תמיכה

### Google Play download button on landing page — DONE (by Chen)
- Android users see download button on landing page
- AuthScreen: "המשיכי בדפדפן" label for Android users alongside download option

### AAB v1.4.0 (versionCode 6) — built and ready

---

## 2026-10-11 — Google Play Approved + Push Permission Flow

### Google Play approved!
- App approved for production release
- Tester nudges disabled (testing period complete)

### Push notification permission prompt — DONE
- Custom One-branded prompt on home screen after first login (native app only)
- Flow: consent done → home screen → "נרצה לעדכן אותך כשיש התאמה חדשה או הודעה" → Yes/No
- Yes → triggers native Android permission dialog → FCM token registered → `push_notifications=true` in users table
- No → localStorage flag, prompt not shown again
- Uses `localStorage push_prompt_done_{userId}` to track
- **Backend**: `registerToken()` now also sets `push_notifications=true` on users table; `syncPermissionStatus()` syncs both `fcm_tokens` and `users.push_notifications`
- **Backend**: `/new-chat/status` now returns `push_notifications`, `email_updates`, `whatsapp_updates`

### "No notification channels" banner — DONE
- Shows on home screen when ALL notification channels are off (push + email + whatsapp)
- Yellow warning: "כדאי לבדוק את האפליקציה מדי פעם..."
- Links to Settings screen

### IP-based entry_point attribution for native app users — DONE
- When native app user registers without a specific entry_point, backend checks `page_views` for matching IP in last 48 hours
- Maps `landing_meme` → `meme`, `landing_barazany` → `barazany`, etc.
- Runs once at `/auth/sync` — once tagged, entry_point is permanent
- Covers: user visits landing page in browser → downloads app from same device → registers → correctly attributed
- Files changed: `backend/src/index.ts` (`resolveEntryPoint()` helper in `/auth/sync`)

### User bug fixes — DONE
- **Missing greeting on sidebar click**: greeting now added when entering new_chat from sidebar (was only from home button)
- **Enter sends message on mobile**: on mobile keyboards, Enter now adds a new line instead of sending. Send via button only. Desktop unchanged.
- Files changed: `frontend/src/NewChat.tsx`

### Fixed: CONTEXT.md outdated info
- `Capacitor.isNativePlatform()` DOES return true with server.url (Capacitor 8.4.0 injects androidBridge)
- Removed from "Known Issues"

---

## 2026-10-07 — Renamed Android → Mobile (Capacitor)
- Agent expanded to cover both Android (active) and iOS (future)
- Added iOS section: requirements, steps when Mac available, App Store review notes
- Shared vs platform-specific files documented

---

## 2026-10-03 — AAB v5 (1.3.0) Built for Resubmission
- Agent created with full build/signing/versioning info
- Bumped versionCode 4→5, versionName 1.2.0→1.3.0
- `cap sync android` — 5 plugins synced (app, browser, push-notifications, splash-screen, status-bar)
- `gradlew bundleRelease` — BUILD SUCCESSFUL, AAB at `frontend/android/app/build/outputs/bundle/release/app-release.aab` (39.7MB)
- **Next step**: upload to Google Play Console → Internal testing → Create new release
- Previous v1.2.0 rejected likely due to low tester activity + no version updates (not code issues)

---

## History (from general WORK_LOG)

### 2026-09-08 — AAB v3 (1.1.0) with server.url
- Switched from bundled frontend to `server.url: 'https://joinone.io'`
- Frontend updates deploy via Railway without new AAB
- OAuth (Google) working on real device
- CORS fix: `https://localhost` added to allowed origins
- 30 beta invite emails sent

### 2026-09-10 — AAB v4 (1.2.0)
- Bumped to versionCode 4, version 1.2.0
- Submitted to Google Play internal testing
- **Rejected** — needs new submission showing fixes

### 2026-08 — Capacitor Migration
- Migrated from TWA (bubblewrap) to Capacitor
- AAB v2 bundled July 8 frontend snapshot — all subsequent changes invisible
- Led to server.url approach in v3

### 2026-07 — Initial Setup
- Google Play Developer account verified ($25)
- TWA approach with bubblewrap CLI
- assetlinks.json configured for deep link verification
- release.keystore created (one-time, locked to Google Play)
