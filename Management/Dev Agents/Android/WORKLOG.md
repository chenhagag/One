# Mobile (Capacitor) Agent — Work Log

## Latest: 2026-10-07 — Renamed Android → Mobile (Capacitor)
- Agent expanded to cover both Android (active) and iOS (future)
- Added iOS section: requirements, steps when Mac available, App Store review notes
- Shared vs platform-specific files documented

### TODO (from Legal agent, 2026-10-08):
- [ ] **Push notification permission prompt**: כשמשתמשת מורידה את האפליקציה, צריך להקפיץ הודעת בקשת הרשאה לקבלת push notifications. רק אחרי אישור — לעדכן `push_notifications = true` ב-DB. כרגע הצ'קבוקס ב-Settings מוצג כ-false כברירת מחדל ומתעדכן רק דרך הנטיב של האפליקציה.

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
