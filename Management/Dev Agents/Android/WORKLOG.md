# Mobile (Capacitor) Agent — Work Log

## Latest: 2026-10-11 — Google Play Approved + Push Permission Flow

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
