# Android Dev Agent — Work Log

## Latest: 2026-10-03 — Agent Created
- Agent context file created with full build/signing/versioning info
- Current AAB v1.2.0 (versionCode 4) rejected by Google Play
- Next step: build new AAB (versionCode 5) for resubmission

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
