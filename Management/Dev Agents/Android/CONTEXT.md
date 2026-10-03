# Android Dev Agent — Context

## Role
Responsible for building, maintaining, and publishing the One Android app via Capacitor.
This includes AAB builds, Google Play Console management, native plugin configuration, and Android-specific debugging.

## Architecture
- **Wrapper**: Capacitor (not TWA) — native Android shell loading web frontend
- **Frontend delivery**: `server.url: 'https://joinone.io'` — app loads live frontend from server, NOT bundled assets
- **Implication**: `Capacitor.isNativePlatform()` returns false (bridge not injected). Native detection uses `appendUserAgent: 'OneNativeApp'` + `X-Requested-With: io.joinone.app`
- **Updates**: Frontend changes deploy via Railway without new AAB. AAB rebuild only for: native plugin changes, AndroidManifest changes, Capacitor config changes, icon changes, or Google Play version bumps

## Current State (as of 2026-10-03)
- **Latest AAB**: v1.2.0 (versionCode 4) — **REJECTED by Google Play**, needs new submission with fixes
- **Previous**: v1.1.0 (versionCode 3) was on internal testing
- **Testing track**: Internal testing (closed), 13 testers (friends/family, not real users)
- **OAuth**: Google login working on real device, Apple Sign-In NOT implemented
- **Push notifications**: FCM configured, `google-services.json` required (not in git — secret)

## Key Files
| File | Purpose |
|------|---------|
| `frontend/capacitor.config.ts` | Server URL, user agent, plugins config |
| `frontend/android/app/build.gradle` | Signing config, versionCode/Name, dependencies |
| `frontend/android/variables.gradle` | SDK versions (target=36, min=24, compile=36) |
| `frontend/android/build.gradle` | Root gradle config |
| `frontend/android/capacitor.settings.gradle` | Capacitor module includes |
| `frontend/android/app/capacitor.build.gradle` | Auto-generated capacitor dependencies |
| `frontend/android/release.keystore` | **CRITICAL** — Release signing key (NEVER recreate, Google Play locked to this fingerprint) |
| `frontend/public/.well-known/assetlinks.json` | Deep link verification (3 SHA256 fingerprints) |
| `frontend/public/manifest.json` | PWA manifest (used by Capacitor) |

## Signing
- **Keystore**: `frontend/android/release.keystore`
- **Password**: `oneapp2026`, **Alias**: `one-release`
- **SHA256**: `CB:B8:1F:6D:A0:27:D9:7B:21:CB:D3:13:30:C8:3A:DF:4E:B7:72:4E:7D:46:00:54:31:BF:61:44:5D:7D:AC:6F`

## Build Commands
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

## Google Play Console
- **App ID**: `io.joinone.app`
- **App name**: One
- **Category**: Dating (18+)
- **Developer account**: Verified ($25 paid)
- **Privacy Policy**: https://joinone.io/privacy
- **Terms of Service**: https://joinone.io/terms
- **Requirements for review**: Block/Report buttons (exist), EULA/consent (exists), age verification (18+)

## Android Testers (13 people — friends/family)
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

## Known Issues
- `Capacitor.isNativePlatform()` always false (server.url limitation)
- HEIC photos: fixed with `heic-convert` (pure JS, no native dependency)
- CSP: `https://localhost` in allowed origins for Capacitor WebView
- CORS: `https://localhost` added to backend allowed origins

## Version History
| Version | versionCode | Status | Notes |
|---------|-------------|--------|-------|
| 1.0.0 | 1 | Superseded | Initial TWA build (bubblewrap) |
| 1.0.1 | 2 | Superseded | Switched to Capacitor, bundled frontend |
| 1.1.0 | 3 | Internal testing | server.url live frontend, OAuth fix |
| 1.2.0 | 4 | **Rejected** | Needs fixes for resubmission |

## What to Read
When activated, this agent should read:
1. This file (`Management/Dev Agents/Android/CONTEXT.md`) — primary source of truth
2. This agent's worklog (`Management/Dev Agents/Android/WORKLOG.md`)
3. General project context: `CLAUDE.md` (skip sections about matching algorithm, analysis system, prompt templates)
4. General worklog: `WORK_LOG.md` — check latest session for relevant changes
5. Google Play plan: `Management/Docs/GOOGLE_PLAY_PLAN.md`
6. Capacitor notes: `Management/Docs/תשובות לגבי מעטפת capacitor וסיכוני.txt`

## Rules
- NEVER recreate the release keystore — it's locked to Google Play
- Always bump versionCode (current: 4) for new AAB submissions
- Run `npx cap sync android` before every build
- Test OAuth on real device after any auth changes
- `google-services.json` is a secret — never commit to git
