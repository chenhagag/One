# WORK_LOG.md — One (formerly MatchMe) Development Log

## Latest Session: 2026-06-01–02 (Staging Environment + Security + Consent + Matching Pool)

### Deployment
- All changes tested on staging, then merged to main (fast-forward) and deployed to production on 2026-06-02

### What We Did

#### 1. Staging Environment Setup
- Created `staging` branch from `main` — Railway auto-deploys from it
- New Railway environment with separate PostgreSQL instance
- Copied production data to staging via `pg_dump` / `psql` (PostgreSQL 18 tools)
- Local dev (`backend/.env`) now points to **staging DB** by default (zephyr)
- Shared Supabase project across both environments (same auth)

#### 2. Expired Magic Link Handling
- AuthScreen saves email to `localStorage` before sending magic link
- AuthCallback detects `otp_expired` / `access_denied` in URL hash
- Shows Hebrew error UI: "הקישור פג תוקף" with pre-filled email + resend button
- Handles email scanners that consume OTP links before user clicks

#### 3. Consent Screens
- **General consent** (`ConsentScreen.tsx`): shown after registration, before entering app
  - New DB field: `consent_accepted BOOLEAN DEFAULT FALSE`
  - Existing users see consent on next login (default false)
  - Blocks access until accepted (checked in auth flow + auto-login)
- **Photo upload consent** (modal in ProfileView): shown on first photo upload
  - Checkbox 1 (required): profile display consent
  - Checkbox 2 (optional): AI analysis consent → `photo_ai_consent` DB field
  - Subsequent uploads skip the modal

#### 4. Settings Screen (was placeholder)
- **Photo AI consent toggle** — loads current value from DB, saveable
- **Email updates** — checkbox, default on (`email_updates BOOLEAN DEFAULT TRUE`)
- **WhatsApp updates** — checkbox, default off, shows phone input when enabled (`whatsapp_updates`, `whatsapp_phone`)
- **Delete account** — red section, double confirmation, calls DELETE endpoint then logs out

#### 5. Admin Security — Email-Based Access
- Admin panel now requires `chen.hagag@gmail.com` (production + staging)
- Localhost: hash only (no email check) for development
- `ADMIN_EMAIL` constant in App.tsx — easy to change

#### 6. Rate Limiting
- **General**: 100 requests / 15 min per IP (all routes)
- **AI**: 10 requests / min per IP on OpenAI routes:
  - `/new-chat/message`, `/analyze`, `/analyze-profile`
  - `/admin/users/:id/reanalyze`, `/admin/users/:id/cognitive-test`, `/admin/users/:id/reanalyze-group`
- Package: `express-rate-limit`

#### 7. Match Endpoint Security (ID Enumeration Prevention)
- `POST /matches/:id/rate` now uses `optionalAuth` middleware
- If JWT present: `user_id` resolved from token (ignores body value)
- Fallback to body `user_id` for legacy login compatibility

#### 8. User Deletion Fix
- Fixed FK violation: now deletes from `user_photos`, `user_chat_summaries`, `bug_reports`, `token_usage` before deleting user row

#### 9. Matching Pool — Manual Control
- New DB field: `in_matching_pool BOOLEAN DEFAULT FALSE`
- `matchStage1.ts` now filters by `in_matching_pool = TRUE` (in addition to `is_matchable`)
- Admin: "כניסה למאגר" / "הוצאה מהמאגר" button per user (replaces old toggle-matchable)
- Default: no user in pool — manual admin control only (for now)
- Future: will auto-set when `is_matchable` becomes true

#### 10. Analysis Status in Admin
- New API: `GET /admin/users/:id/analysis-status`
- Shows in admin user detail: how many analysis runs, labels, dates
- Highlights new messages since last analysis (orange if > 0, green if none)

#### 11. Admin Cleanup
- Removed "צפייה בממשק השיחה החדש" button
- Removed "חזרה לשיחה" button
- Removed toggle-matchable button (replaced by matching pool control)

#### 12. Chat UX — Auto-Focus Input
- After AI responds, cursor automatically returns to chat input field

### New Files
- `frontend/src/ConsentScreen.tsx` — General consent screen

### Files Modified
- `frontend/src/App.tsx` — Consent flow, admin email check, User interface fields
- `frontend/src/NewChat.tsx` — Photo consent modal, settings screen, chat auto-focus
- `frontend/src/AuthScreen.tsx` — Save email to localStorage for resend
- `frontend/src/AuthCallback.tsx` — Expired link detection + resend UI
- `frontend/src/AdminView.tsx` — Analysis status, matching pool button, removed old buttons
- `backend/src/index.ts` — Rate limiting, auth import, PATCH fields, analysis-status API, user deletion fix
- `backend/src/matchStage1.ts` — Filter by `in_matching_pool`
- `backend/src/schema.pg.ts` — consent_accepted, photo_ai_consent, email_updates, whatsapp_updates, whatsapp_phone, in_matching_pool
- `backend/src/auth.ts` — optionalAuth exported

### DB Columns Added (users table)
- `consent_accepted BOOLEAN DEFAULT FALSE`
- `photo_ai_consent BOOLEAN DEFAULT FALSE`
- `email_updates BOOLEAN DEFAULT TRUE`
- `whatsapp_updates BOOLEAN DEFAULT FALSE`
- `whatsapp_phone TEXT`
- `in_matching_pool BOOLEAN DEFAULT FALSE`

### Dependencies Added
- `express-rate-limit` (backend)

### Infrastructure
- Staging environment on Railway (branch `staging`, separate PostgreSQL)
- PostgreSQL 18 CLI tools installed locally at `C:\pgsql\pgsql\bin\`

---

## Previous Session: 2026-05-19–20 (Magic Link Auth + Safari ITP + Cognitive Filter)

### What We Did

#### 1. Magic Link Authentication
- Replaced old no-auth email login with Supabase Magic Link
- Flow: enter email → receive link → click → authenticated session
- New/existing users handled automatically via `/auth/sync`

#### 2. Safari ITP — Full Server-Side Workaround
- Safari ITP blocks ALL direct calls to Supabase domain (third-party)
- Created three backend endpoints to bypass ITP:
  - `POST /auth/magic-link` — sends magic link email via Supabase Admin API server-side
  - `POST /auth/exchange-code` — exchanges PKCE code for session server-side
  - `POST /auth/sync` — already existed, syncs Supabase user to local DB
- AuthCallback tries server-side exchange first, falls back to client-side Supabase SDK

#### 3. AuthScreen — Three-Screen Flow
- **Chrome/Android**: Google OAuth button (big) + "Login / Register with email" link (small)
- **Safari/iOS**: Only "המשך עם אימייל" button (Google OAuth blocked by ITP)
- **Email form**: Email input + "שלחו לי לינק להתחברות" → success screen
- **Debug panel removed** from AuthCallback (was green-on-black terminal look)

#### 4. Cognitive Filter — Use DB Score Directly
- `matchStage1.ts` was computing its own cognitive weighted average (different weights, no normalization) that didn't match admin display
- Now uses `users.cognitive_score` directly — same number admin sees
- Tolerance currently set to ±15

#### 5. Infrastructure
- Domain `joinone.io` configured (Railway custom domain + Supabase Site URL)
- SMTP via Resend with `noreply@joinone.io` sender
- `SUPABASE_SERVICE_ROLE_KEY` added to Railway + local env

### Current Status
- **Working**: Magic Link on Galaxy (Android Chrome) — full end-to-end
- **Working**: Magic Link on desktop browsers
- **Working**: Google OAuth on desktop Chrome / Android Chrome
- **NOT working**: Magic Link callback on iPhone Safari — email sends, but clicking link leads to blank page or back to login. Server-side code exchange deployed but not yet tested.
- **NOT working**: Google OAuth on Safari (ITP blocks it — hidden for now)
- **NOT working**: Android PWA Install — Google Play Protect shows "unsafe app blocked"

### Next Steps (Planned)
1. **iPhone Safari auth**: Consider setting up `auth.joinone.io` as Supabase custom domain (same-origin) to bypass ITP entirely
2. **Google Play Store**: Publish as TWA to eliminate Play Protect warning — wraps existing PWA, no code changes, requires $25 Google Play Developer account
3. **Test server-side code exchange** on iPhone Safari (deployed but untested)

### Files Modified
- `backend/src/index.ts` — `POST /auth/magic-link`, `POST /auth/exchange-code` endpoints
- `backend/src/matchStage1.ts` — Cognitive filter uses `users.cognitive_score` directly
- `frontend/src/AuthScreen.tsx` — Three-screen flow (landing → email form → success)
- `frontend/src/AuthCallback.tsx` — Server-side exchange first, removed debug panel
- `frontend/vite.config.ts` — Added `/auth/magic-link`, `/auth/exchange-code` proxies

### Environment Variables Added
- `SUPABASE_SERVICE_ROLE_KEY` — Backend: Supabase service role key for Admin API

---

## Previous Session: 2026-05-19 (Magic Link Auth)

### What We Worked On

#### 1. Supabase Magic Link Authentication
- **Goal**: Replace the old no-auth email login/register flow with real Supabase Magic Link authentication
- **Old flow**: User enters email → instantly "logged in" without any verification (backend just looked up email in DB)
- **New flow**: User enters email → Supabase sends magic link → user clicks link → PKCE code exchange → `/auth/sync` → authenticated session
- Uses `supabase.auth.signInWithOtp()` with `emailRedirectTo` pointing to `/auth/callback`
- Works for both new users (→ ProfileSetup) and existing users (→ straight to app)
- No backend changes needed — existing `AuthCallback.tsx` and `/auth/sync` handle magic link the same as OAuth

#### 2. AuthScreen Rewrite
- Removed `onEmailLogin` prop (no longer navigates to separate login view)
- Email input + "שלחו לי לינק להתחברות" button directly on AuthScreen
- Success screen: "שלחנו לך לינק להתחברות" with email confirmation + "חזרה" button
- Error states: invalid email, send failure, service not configured
- Hebrew UI text, RTL layout
- OAuth buttons (Google/Apple) unchanged — still shown based on browser/platform

#### 3. App.tsx Cleanup
- Removed old `handleLogin()` function (no-auth email lookup)
- Removed old login view JSX (email input + "Login" button + "Register" link)
- Removed `loginEmail`, `loginError`, `loginLoading` state variables
- Removed `"login"` from View type
- Removed unused `loginForm`/`loginInput` styles
- `Register.tsx` kept as legacy fallback (still in code, not primary path)

### Current Status — Magic Link
- **Code complete** — frontend builds clean
- **Pending**: Supabase dashboard verification (Email provider enabled, redirect URLs configured)
- **Testing**: User is checking Supabase dashboard settings now

### Files Modified
- `frontend/src/AuthScreen.tsx` — Major rewrite: magic link flow replaces "Continue with email" button
- `frontend/src/App.tsx` — Removed old login view, cleaned up unused state/styles

### What Was NOT Changed
- `AuthCallback.tsx` — already handles PKCE code exchange (works for magic link)
- `/auth/sync` backend endpoint — already handles new vs existing users
- `ProfileSetup.tsx` — used for new magic link users (same as OAuth)
- `Register.tsx` — kept as legacy fallback
- Google/Apple OAuth — untouched
- Backend endpoints (`/login`, `/register`) — kept for backward compatibility

### Supabase Dashboard Config Needed
1. Authentication → Providers → Email: enable Magic Link sign-in
2. Authentication → URL Configuration: add `http://localhost:3000/auth/callback` + production URL
3. Optional: customize email template to Hebrew

---

## Previous Session: 2026-05-19 (Safari OAuth Battle + Final Decision)

### What We Worked On

#### 1. Safari OAuth — Deep Debugging (6 commits)
- **Problem**: Google OAuth on Safari consistently fails due to ITP (Intelligent Tracking Prevention) blocking Supabase's third-party domain
- **Attempts that didn't work**:
  - Explicit PKCE code exchange + custom token storage + debug panel
  - `skipBrowserRedirect: true` + manual `window.location.href` redirect
  - Global error catcher in `index.html` for Safari debugging
  - Visible debug info on Google sign-in button
- **Root cause**: Safari ITP blocks all cross-origin storage/redirects to Supabase domain — no client-side workaround possible without custom domain
- **Final decision**: **Hide Google OAuth on Safari entirely** — Safari users see email login as primary option
- Detection: `isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)`
- Google button hidden on Safari, email login promoted

#### 2. Stale Service Worker Fix
- **Problem**: After deploys, Safari showed blank page — old service worker served cached `index.html`
- **Fix**: Force-unregister all service workers on page load in `index.html`
- Added loading indicator in HTML (visible before React mounts)

#### 3. HTML Caching Disabled
- Added `Cache-Control: no-cache, no-store, must-revalidate` meta tags to `index.html`
- Backend serves `index.html` with cache-busting headers (`Pragma: no-cache`, `Expires: 0`)
- Prevents Safari from serving stale HTML after Railway deploys

### Current Status — Auth
- **Working**: Google OAuth on desktop (Chrome, etc.) + Android Chrome
- **Working**: Email login everywhere (desktop, Android, iOS Safari)
- **Google OAuth hidden on Safari** — until Supabase custom domain is set up
- **Future fix**: Supabase custom domain (same-origin) would bypass Safari ITP entirely

### Files Modified
- `frontend/src/AuthScreen.tsx` — Safari detection, hide Google OAuth on Safari, cleanup debug code
- `frontend/index.html` — Force SW unregister, loading indicator, no-cache meta tags, error catcher
- `backend/src/index.ts` — Cache-busting headers for index.html serving

---

## Previous Session: 2026-05-18/19 (Auth + PWA)

### What We Worked On

#### 1. Android PWA Install Fix
- **Problem**: `beforeinstallprompt` fired before React mounted — install button never appeared
- **Fix**: Global event capture in `index.html` → stored on `window.__pwaInstallPrompt`
- Component checks for pre-captured prompt on mount
- **Problem**: PWA icons were 80x78 JPG but manifest declared 192x192 + 512x512 → Chrome refused to fire event
- **Fix**: Generated proper PNG icons (192x192, 512x512) with sharp-cli, updated manifest with `maskable` purpose
- Fallback text changed from "open on mobile" to "add via browser menu"

#### 2. Logout from Sidebar
- Added `onLogout` prop to NewChat, popup menu on avatar click with "התנתק" button
- App.tsx passes `handleLogout` to NewChat

#### 3. Supabase OAuth Integration (Google + Apple)
- Committed all auth code from previous session (was untracked)
- Made Supabase optional — app works without OAuth env vars configured
- Set up Supabase project, configured env vars locally + Railway
- Apple login hidden on non-iOS devices (Google only on Android/desktop)

#### 4. Auth Debugging — Multiple Issues Fixed
- **ES256 algorithm**: Supabase uses ES256 (not HS256) — switched from JWT secret to JWKS verification via `jwks-rsa`
- **API path mismatch**: Frontend called `/api/auth/sync` but backend route is `/auth/sync` — fixed paths + added `/auth` to Vite proxy
- **PATCH endpoint incomplete**: `/admin/users/:id` only accepted 4 fields, returned `{updated: true}` instead of user object — expanded to accept all profile fields, returns full user
- **URL not cleaned after OAuth**: `/auth/callback` stayed in URL causing re-trigger on refresh — now `replaceState("/")`
- **first_name undefined crash**: `user.first_name.charAt(0)` crashed when OAuth user had no name — added fallback

#### 5. Safari/iOS Compatibility
- **Problem**: Safari ITP blocks Supabase connections (third-party domain), causing infinite loading
- **Fix**: Added timeouts to ALL Supabase calls:
  - `initAuth` (App.tsx): 3s timeout on getSession
  - `apiFetch` (api.ts): 2s timeout on getSession, continues without JWT
  - `AuthScreen`: 8s timeout on signInWithOAuth
  - `AuthCallback`: 10s global timeout + 3s on getSession fallback
- **PKCE flow**: Switched from implicit to PKCE (`flowType: "pkce"`) for better Safari support
- **Reverted explicit localStorage**: `storage: window.localStorage` broke Safari — Supabase uses localStorage by default

### Current Status — Auth
- **Working**: Google OAuth on desktop (Chrome, etc.) + Android Chrome
- **Working**: Email login everywhere (desktop, Android, iOS)
- **NOT working**: Google OAuth on iOS Safari — Safari ITP blocks Supabase domain
- **Fix needed**: Supabase custom domain (same-origin) to bypass Safari ITP, OR accept email-only on iOS

### Files Created
- `frontend/public/icon-192.png` — PWA icon 192x192
- `frontend/public/icon-512.png` — PWA icon 512x512

### Files Modified
- `frontend/index.html` — Global beforeinstallprompt capture + debug logs
- `frontend/public/manifest.json` — Proper PNG icons with maskable purpose
- `frontend/src/PWAInstallFlow.tsx` — Check window.__pwaInstallPrompt, center logo
- `frontend/src/NewChat.tsx` — onLogout prop, user menu, first_name fallback
- `frontend/src/App.tsx` — onLogout to NewChat, URL cleanup, PKCE detection, session timeout
- `frontend/src/lib/supabase.ts` — Optional client, PKCE flow, persistSession
- `frontend/src/lib/api.ts` — getSession timeout, restore /api prefix
- `frontend/src/AuthScreen.tsx` — Apple only on iOS, OAuth timeout
- `frontend/src/AuthCallback.tsx` — Timeouts, debug logs, cleaner flow
- `backend/src/auth.ts` — JWKS (ES256) verification via jwks-rsa
- `backend/src/index.ts` — PATCH accepts all profile fields, returns full user
- `frontend/vite.config.ts` — Added /auth proxy

### Dependencies Added
- Backend: `jwks-rsa` (JWKS public key fetching for ES256)

---

## Previous Session: 2026-05-18 (evening)

### What We Worked On

#### 1. Android PWA Install Fix
- **Problem**: On Android, `beforeinstallprompt` event fired before React mounted — PWAInstallFlow component missed it, showed generic fallback instead of install button
- **Fix**: Added global event capture in `index.html` — stores event on `window.__pwaInstallPrompt`
- Component now checks for pre-captured prompt on mount before attaching listener
- Fallback text changed from "open on mobile" (wrong when already on mobile) to "add via browser menu"

#### 2. Logout from Sidebar
- Added `onLogout` prop to NewChat component
- Clicking user avatar (bottom of sidebar) opens popup menu with "התנתק" button
- Red text, positioned above avatar, closes on click
- App.tsx passes `handleLogout` to NewChat

#### 3. Supabase Auth — Commit & Deploy
- All auth code from previous session (Google + Apple OAuth) was untracked in Git
- Committed and pushed all new/modified files to unblock Railway build
- Files: AuthScreen, AuthCallback, ProfileSetup, auth.ts, supabase client, API wrapper, Tailwind config

### Files Modified
- `frontend/index.html` — Global `beforeinstallprompt` capture
- `frontend/src/PWAInstallFlow.tsx` — Check `window.__pwaInstallPrompt` on mount, better fallback text
- `frontend/src/NewChat.tsx` — `onLogout` prop, user menu popup, styles
- `frontend/src/App.tsx` — Pass `onLogout={handleLogout}` to NewChat

### Files Committed (from previous auth session)
- `backend/src/auth.ts` — JWT middleware (requireAuth, optionalAuth)
- `backend/src/index.ts` — POST /auth/sync endpoint
- `backend/src/schema.pg.ts` — supabase_uid, auth_provider, profile_complete columns
- `frontend/src/AuthScreen.tsx` — Google + Apple OAuth login screen
- `frontend/src/AuthCallback.tsx` — OAuth redirect handler
- `frontend/src/ProfileSetup.tsx` — Post-OAuth profile form
- `frontend/src/lib/supabase.ts` — Supabase client
- `frontend/src/lib/api.ts` — Fetch wrapper with JWT
- `frontend/src/main.css` — Tailwind directives
- `frontend/tailwind.config.js`, `frontend/postcss.config.js` — Tailwind setup
- `frontend/.env.example` — Supabase env var template

---

## Previous Session: 2026-05-12 to 2026-05-18

### What We Worked On

#### 1. Rename MatchMe → One
- All frontend UI references updated across App.tsx, NewChat.tsx, Register.tsx, index.html
- "הוא מערכת" → "היא מערכת" (grammatical fix)

#### 2. Welcome Screen Gender Adaptation
- "ברוך הבא" / "ברוכה הבאה" based on user.gender
- All body text adapted: "תספרי"/"תעני" for women, "תספר"/"תענה" for men

#### 3. User Name in Greeting
- "היי נוי, תודה רבה..." instead of "היי, תודה רבה..."
- Both couple tester and regular greetings updated

#### 4. Response Speed Optimization
- `max_tokens` reduced from 500 to 300 (chat responses are 100-150 tokens)
- Global OpenAI client (reused across requests, not created per request)
- User message DB save runs parallel to OpenAI call

#### 5. Home Screen Disclaimer
- "המערכת בשלבי בנייה. הצ'אט עלול עדיין להרגיש קצת רובוטי או תקוע — תודה על ההבנה."

#### 6. Cognitive Chat Fixes
- Full history sent (not `slice(-6)`) — prevents question repetition
- Prompt updated: "6 questions max", "never repeat a question already asked"
- Threshold: 7 messages (6 questions + intro) for both couples and regular
- Stronger closing instruction: "חובה לסגור עכשיו", "אל תשאל שאלה נוספת"

#### 7. Post-Close Channel Bubbles
- Backend returns `closing_stage` in API response
- Frontend shows bubbles for incomplete channels after conversation closes
- "בוא נמשיך להכיר" hidden when general chat already closed

#### 8. Expert Recommendation System Overhaul
- Recommendations reload on every home screen visit (not just mount)
- Moved recommendation inside chatArea div (was hidden by layout)
- Priority order: (1) "בוא נמשיך" if chat incomplete, (2) cognitive, (3) taste, (4) all done message
- Respects closed channels — no "בוא נמשיך" after general chat closed
- All-done message: "סיימת את כל השלבים, תודה רבה..."
- Conditional photo/profile prompt for couples vs singles

#### 9. Auto-Analysis Rework (Two Runs)
- Run 1: Triggers when general chat closes — even without cognitive/taste
- Run 2: Triggers when all channels done (cognitive ≥5 + taste ≥5)
- Max 2 automatic runs (tracked via `analysis_run_count` column)
- Auto-analysis now saves raw output to `analysis_runs` table (visible in admin)

#### 10. Taste Test — Major Overhaul
- **All profiles in prompt**: 13 selected profiles injected into every prompt (AI picks from list, no inventions)
- **Profile counting**: counts names from history matching actual profile bank (prevents false matches like "אני מבינה.")
- **Mid-summary after 6 profiles**: "קלטתי נכון? רוצה להמשיך?" — user can continue or stop
- **Follow-up separation**: "don't show new profile together with follow-up question"
- **"Don't ask if ready for next"**: removed "מוכנה לפרופיל הבא?" spam
- **"Don't ask if they want to meet"**: profiles are for taste analysis, not real people
- **Closing bubbles**: only on actual close (not mid-summary)
- **Stronger closing instruction**: "חובה לסגור עכשיו"
- **Full history on taste**: sent to OpenAI always (not just at closing)
- **Removed ages from profiles**: "אני יעל. אוהבת..." instead of "אני יעל, 32. אוהבת..."

#### 11. Same-Sex Taste Profiles
- 4 profile files: female (default), female-ff (woman→woman), male (default), male-mm (man→man)
- Full gender adaptation in text (adjectives, pronouns, not just "מחפש/ת")
- Code selects profile bank based on `gender` + `looking_for_gender`
- Removed AI gender adaptation instruction (was causing confusion)

#### 12. Closing Stage & Bubble Fixes
- Removed regex check on closing — trust `closingStage` from `buildChatPrompt`
- `saveConversationState` now awaited (prevents lost `closing_stage=3`)
- `closedChannels` loaded from API on mount (`chat_closed` from DB state machine)
- Cognitive/taste `closedChannels` set only from real-time API responses

#### 13. Greeting Fix
- Greeting message no longer disappears — history load doesn't overwrite channels with existing messages

#### 14. "חזרה לשיחה" Button
- Only shown when general chat (`new_chat`) has messages (not any channel)

#### 15. Profile View — Photo Upload
- Extracted `ProfileView` component with photo loading from API
- Photos displayed in grid, auto-refresh after upload, delete button
- Vite proxy for `/uploads` in dev mode
- Age displayed without "גיל" prefix
- Production uploads to Railway Volume (`/app/data/uploads`)

#### 16. Old Chat History Mapping
- `psychologist` (שיחת עומק) → displayed in general chat
- `interviewer` (שיחת מעבדה) → displayed in cognitive chat
- Read-only mapping in frontend — zero DB changes

#### 17. Admin Enhancements
- Partner name column: editable with pencil icon (click-to-edit, PATCH API)
- Download All: downloads each chat channel as separate text file
- Inject Conversation: paste chat history per channel for test users
- Couple Insights Editor: write/edit long-form relationship insights for couple testers
- Trans trait hidden from admin display
- Candidate matches sorted by `profile_score` instead of `final_score`
- `PATCH /admin/users/:id` supports `partner_name`, `test_user_type`, `first_name`, `couple_insights`
- User row click: only name navigates to user detail (not entire row)

#### 18. Couple Insights Feature
- New DB column: `couple_insights TEXT` on users
- Admin: editor for long-form relationship insights
- User sidebar: "כרטיס התאמה" button appears when `couple_insights` exists
- User screen: scrollable rich-text display with pre-wrap formatting
- API: `GET /users/:id/couple-insights`

#### 19. PWA Install Flow
- New `PWAInstallFlow` component replaces static welcome screen
- Mobile: polished install screen with Android native prompt / iOS Safari guide
- Desktop: welcome text with app explanation (no install instructions)
- Standalone mode: auto-skip to main app
- PWA manifest.json + minimal service worker for installability
- iOS instructions with Share icon SVG + bouncing arrow animation
- Login on mobile also shows PWA install screen
- Feature cards, gradient buttons, trust badges, fade-in animation

### New Files Created
- `backend/src/agents/conversation/microTopics.ts` — 14 micro-topics with state machine
- `backend/src/agents/conversation/promptTemplates.ts` — Prompt A/B/C/D/E templates
- `backend/src/agents/conversation/prompts/taste-profiles-female-ff.txt` — Same-sex female profiles
- `backend/src/agents/conversation/prompts/taste-profiles-male-mm.txt` — Same-sex male profiles
- `frontend/src/PWAInstallFlow.tsx` — PWA installation flow component
- `frontend/public/manifest.json` — PWA manifest
- `frontend/public/sw.js` — Minimal service worker

### Files Deleted
- `backend/src/agents/conversation/prompts/topic-intro.txt`
- `backend/src/agents/conversation/prompts/topic-relationships.txt`
- `backend/src/agents/conversation/prompts/topic-values.txt`
- `backend/src/agents/conversation/prompts/topic-culture.txt`

### Key Architectural Changes
- Micro-topics + prompt templates replaced topic-based RAG (code controls questions, not AI)
- Taste test: all profiles in prompt instead of one-at-a-time injection
- Profile counting from history instead of message count
- Auto-analysis: two-run system (after chat close + after all channels)
- Recommendations reload on every home screen visit
- `saveConversationState` is now awaited (not fire-and-forget)
- PWA support: manifest, service worker, install flow

### Version Tag
- `v0.9-pre-mvp` — tagged as last stable version before MVP UI overhaul

## Previous Session: 2026-05-12

### What We Worked On

#### 1. Micro-Topics + Prompt Templates (A/B/C/D/E)
- **Replaced** topic-based RAG with 14 micro-topics + structured prompt templates
- Code controls what AI asks (Prompt A = required question, Prompt B = follow-up only if needed)
- AI's role is formatting/tone only — eliminates topic drift and repetition
- State machine: `ConversationState` with `current_topic_index`, `turn_in_topic`, `closing_stage`
- New files: `microTopics.ts`, `promptTemplates.ts`
- Deleted old topic files: `topic-intro.txt`, `topic-relationships.txt`, `topic-values.txt`, `topic-culture.txt`

#### 2. Rename MatchMe → One
- All frontend UI references updated: App.tsx, NewChat.tsx, Register.tsx, index.html
- "הוא מערכת" → "היא מערכת" (grammatical gender fix)

#### 3. Welcome Screen Gender Adaptation
- "ברוך הבא" / "ברוכה הבאה" based on user.gender
- All body text adapted: "תספרי"/"תעני" for women, "תספר"/"תענה" for men

#### 4. User Name in Greeting
- "היי נוי, תודה רבה..." instead of "היי, תודה רבה..."
- Both couple tester and regular greetings updated

#### 5. Response Speed
- `max_tokens` reduced from 500 to 300 (chat responses are short — 100-150 tokens)

#### 6. Disclaimer on Home Screen
- "המערכת בשלבי בנייה. הצ'אט עלול עדיין להרגיש קצת רובוטי או תקוע — תודה על ההבנה."

#### 7. Cognitive Chat Fixes
- **Full history sent** (not `slice(-6)`) — AI sees all previous questions, prevents repetition
- **Prompt updated**: "שאל 6 שאלות", "לעולם אל תחזור על שאלה שכבר שאלת"
- **Closing threshold**: couples = 7 (6 questions), regular = 7 (6 questions), accounting for 2 intro messages
- **Stronger closing instruction**: "חובה לסגור עכשיו", "אל תשאל שאלה נוספת"

#### 8. Post-Close Channel Bubbles
- Backend returns `closing_stage` in API response
- For cognitive/taste: `closing_stage=3` only when AI reply contains actual closing text (regex check)
- Frontend shows bubbles for incomplete channels after conversation closes
- "בוא נמשיך להכיר" hidden when general chat already closed

#### 9. Expert Recommendation Respects Closed Channels
- "בוא נמשיך" recommendation no longer shown after general chat closed
- "All done" message when all channels complete: "סיימת את כל השלבים, תודה רבה..."
- Conditional photo/profile prompt: couples get "העלו תמונות", singles get "להשלמת הפרופיל..."
- Photo/profile prompt disappears when photos uploaded and details filled

#### 10. Taste Test Closing Fix
- Stronger closing instruction: "חובה לסגור עכשיו", "אל תציג עוד פרופילים"

#### 11. Auto-Analysis Rework (Two Runs)
- **Run 1**: Triggers when general chat closes — even without cognitive/taste
- **Run 2**: Triggers when all channels done (cognitive ≥5 + taste ≥5)
- Max 2 automatic runs per user (tracked via `analysis_run_count` column)
- New functions: `maybeAutoAnalyzeAfterChat()`, `maybeAutoAnalyzeAfterAll()`

#### 12. Taste Profiles — Remove Age + Gender Adaptation
- Removed age from all 48 profiles (female + male): "אני יעל. אוהבת..." instead of "אני יעל, 32. אוהבת..."
- Prompt instruction to adapt "מחפש/ת גבר/אישה" to match user's gender

#### 13. Sidebar: "בדיקת טעם חיצוני" Placeholder
- Renamed from "בדיקת טעם אישי" to "בדיקת טעם חיצוני"
- Shows "בבנייה" screen instead of opening taste chat

#### 14. Profile View — Photo Upload Fix
- Extracted `ProfileView` component with photo loading from API
- Photos displayed in grid, auto-refresh after upload
- Delete button on each photo
- Vite proxy added for `/uploads` in dev mode
- Age displayed without "גיל" prefix

#### 15. Old Chat History Mapping
- `psychologist` (שיחת עומק) → displayed in general chat (`new_chat`)
- `interviewer` (שיחת מעבדה) → displayed in cognitive chat (`new_chat_cognitive`)
- Read-only mapping in frontend — zero DB changes, no data modified

### Files Modified
- `backend/src/agents/conversation/chatManager.ts` — Micro-topics, prompt templates, closing thresholds
- `backend/src/agents/conversation/autoAnalysis.ts` — Two-run auto-analysis
- `backend/src/agents/conversation/prompts/cognitive-chat.txt` — 6 questions, no-repeat rule
- `backend/src/agents/conversation/prompts/taste-test-chat.txt` — Gender adaptation instruction
- `backend/src/agents/conversation/prompts/taste-profiles-female.txt` — Removed ages
- `backend/src/agents/conversation/prompts/taste-profiles-male.txt` — Removed ages
- `backend/src/index.ts` — closing_stage in API, full history for cognitive, auto-analysis triggers, photo count
- `backend/src/schema.pg.ts` — `analysis_run_count` column
- `frontend/src/App.tsx` — Rename to One, gender-adapted welcome
- `frontend/src/NewChat.tsx` — Bubbles, recommendations, ProfileView, old chat mapping, disclaimer
- `frontend/src/Register.tsx` — Rename to One
- `frontend/index.html` — Title: One
- `frontend/vite.config.ts` — Uploads proxy

### Files Created
- `backend/src/agents/conversation/microTopics.ts` — 14 micro-topics with state machine
- `backend/src/agents/conversation/promptTemplates.ts` — Prompt A/B/C/D/E templates

### Files Deleted
- `backend/src/agents/conversation/prompts/topic-intro.txt`
- `backend/src/agents/conversation/prompts/topic-relationships.txt`
- `backend/src/agents/conversation/prompts/topic-values.txt`
- `backend/src/agents/conversation/prompts/topic-culture.txt`

## Previous Session: 2026-05-07

### What We Worked On

#### 1. Separate Chat Histories Per Channel
- **Each bubble (general, cognitive, taste test) now has its own independent chat history**
- Frontend state changed from single `Message[]` to `Record<string, Message[]>` keyed by channel
- History loading on mount splits messages by `chat_type` into per-channel arrays
- `sendMessage` sends only the current channel's history to the backend
- "חזרה לשיחה" and "בוא נמשיך" always return to `new_chat` (general) channel
- Sidebar "חזרה לשיחה" visibility based on any channel having messages

#### 2. Removed Mid-Conversation Cognitive Switch
- **Deleted** `detectCognitiveAgreement()` function and `COGNITIVE_AGREE_PATTERNS`
- **Deleted** `switchToCognitive` from `ChatPromptResult` and backend response
- No more automatic channel switching mid-conversation
- Instead: when enough data collected, AI suggests navigating to the cognitive bubble on home screen
- After cognitive is done, AI suggests navigating to taste test bubble

#### 3. Navigation Suggestions (Replace Mid-Chat Switching)
- `COGNITIVE_SUGGESTION_INSTRUCTION` — now says "click on 'בוא נבין את סגנון החשיבה שלי' on the home screen"
- New `TASTE_SUGGESTION_INSTRUCTION` — after cognitive done, suggests "click on 'נתח את הטעם שלי' on the home screen"
- New `shouldSuggestTaste()` — checks if cognitive done (≥3 msgs) and taste not done (<3 msgs)
- Suggestion flow: general chat suggests cognitive → cognitive done, general chat suggests taste

#### 4. Chat Flow Improvements (from user testing feedback)
- **Separated intros**: Both taste test and cognitive now explain what's about to happen, ask "מוכן/ה?" and wait for confirmation before starting questions/profiles
- **Taste test follow-up questions**: After each profile reaction, AI asks 1-2 follow-up questions (what did you like? what didn't work?) to understand both attraction and repulsion. Skips if answer already detailed. Max 2 follow-ups per profile.
- **Taste test expanded to 13 profiles** (was 8): covers more diverse styles for better data
- **Taste test summary validates**: After all profiles, summarizes patterns and asks user "קלטתי נכון?" to let them correct/refine
- **Cognitive closes after ~10 questions**: Tells user "I feel I've captured your thinking style" and navigates to next step
- **Dynamic navigation at end of each chat**: Both cognitive and taste test check what the user still needs (cognitive done? taste done? general chat complete?) and suggest the right next step
- **Culture topic shortened**: Less deep-diving into hobbies/music — 1-2 questions per sub-topic, enough for general picture

#### 5. Suggestion Timing Fix (found during edge-case testing)
- **Problem**: Suggestions to navigate to cognitive/taste never appeared in fresh conversations because summarizer runs async and summary_fields was still 0 when buildChatPrompt checked
- **Fix**: Added fallback trigger — if `history.length >= 12` (6+ exchanges), suggest cognitive even without waiting for summarizer
- **Problem**: Cognitive closing appeared one message too late because DB count doesn't include current message
- **Fix**: Threshold lowered to `cogUserMsgCount >= 9` (current msg not yet in DB)
- **Strengthened suggestion text**: Changed from soft "הצע" to "חובה" so AI doesn't skip the suggestion
- **Strengthened cognitive intro**: Explicit "מוכן/ה להתחיל?" + "אל תשאל שאלת סימולציה בהודעה הזו" to prevent AI from jumping ahead

#### 6. Edge Case Testing (5 scenarios)
- **Verbose user**: AI doesn't repeat questions, progresses topics correctly
- **Terse user**: AI asks focused follow-ups, tries to draw out details
- **User asks questions back**: AI answers system questions then steers back to conversation
- **Confused user**: AI explains gently and guides into conversation
- **Channel hopper**: Each channel preserves its own history, no cross-contamination, returning to general continues where it left off

#### 7. Conversation Closing Logic
- **Full closing**: when all 8 summary fields filled + cognitive ≥7 msgs + taste ≥7 msgs → `isFullyCovered()` returns true
- **General chat closing**: insight about user + "דייקתי?" + user can correct + farewell message ("תודה, מתחילים לנתח, נעדכן")
- **Taste test closing**: same pattern — summary + validation + farewell
- **Cognitive closing**: positive close without personality insights + farewell
- **Partial closing**: if only some channels done → navigate to the missing one
- **User returns after close**: continue conversation, try to close again gently after a few messages

#### 8. Taste Test — General Taste Questions Phase
- **New phase**: before showing profiles, ask 2-3 general questions about taste ("what attracts you?", "what's the biggest turn-off?", "anything important physically?")
- **Smart skip**: if user already discussed taste in general chat (summary has `taste_and_style` or `relationships`) → skip straight to profile explanation
- **Profile start shifted**: `profileStartMsg = hasPriorTasteInfo ? 1 : 3`

#### 9. Couple Tester Support
- **`COUPLE_TESTER_INSTRUCTION`** (~100 tokens) — injected when `test_user_type === "Couple Tester"`
- **First message**: thanks for participation, explains testing purpose, mentions they'll see insights and relationship strengths
- **Adapted questions**: "relationship before your current one" instead of "are you single?", doesn't assume they're looking for a match
- **Zero overhead for regular users**: empty string when not couple tester
- **All 3 channels**: instruction injected into general, cognitive, and taste test prompts

#### 10. DB Query Optimization
- `getUserSummary` now called **once** at the start of `buildChatPrompt`, result (`userSummary`) reused across all logic
- Previously called 3-4 times per request (taste check, topic detection, suggestion check, closing check)

#### 11. Topic Intro — Education & Work Detail
- Strengthened `topic-intro.txt`: explicit instruction to ask about education (where studied, what field) and work details (role, what they like about it)
- "Not like a job interview, but genuine interest"

#### 12. Frontend — "Not Enough Data" Recommendation
- New home screen recommendation: "עדיין לא הגענו להיכרות מספקת, לחץ על בוא נמשיך"
- Shows when `summary_fields < 8` and user has started chatting
- Priority system: cognitive suggestion > taste suggestion > return to general chat

#### 13. Admin: Re-analyze Buttons Always Visible
- Re-analyze, Reset analysis, Cognitive Test, and per-group analysis buttons no longer gated by `profile` existence
- Fixes issue where users who only used new_chat (no old chat) had no way to trigger analysis

### Files Modified
- `frontend/src/NewChat.tsx` — Per-channel message state, channel-aware sendMessage, navigation buttons, "not enough data" recommendation
- `backend/src/agents/conversation/chatManager.ts` — Major: closing logic, taste intro questions, couple tester, DB optimization, suggestion timing, cognitive/taste navigation
- `backend/src/agents/conversation/prompts/taste-test-chat.txt` — Follow-up questions after each profile reaction
- `backend/src/agents/conversation/prompts/cognitive-chat.txt` — Ask "ready?" before starting, ~10 questions target, explicit stop before first question
- `backend/src/agents/conversation/prompts/topic-culture.txt` — Shortened, less deep-diving
- `backend/src/agents/conversation/prompts/topic-intro.txt` — Education + work detail questions
- `backend/src/index.ts` — Removed switchToCognitive, passes test_user_type to buildChatPrompt
- `frontend/src/AdminView.tsx` — Analysis toolbar always visible (not gated by profile)

### Decisions Made
- Each channel = separate conversation with separate history (user experience of independent chats)
- No mid-conversation channel switching — user navigates via home screen bubbles
- AI guides user to the right bubble at the right time via natural suggestion
- Same base prompt for all channels, channel-specific behavior via RAG injection
- Intro → confirm → start pattern: always explain first, never surprise user with questions/profiles
- Dynamic navigation: code checks DB for what's done, injects the right suggestion — no hardcoded flows
- 13 taste profiles for better coverage; ~10 cognitive questions for sufficient thinking style data
- Closing requires 8/8 summary fields — not 5 (full coverage, not partial)
- Couple tester: lightweight instruction (~100 tokens), zero overhead for regular users
- DB optimization: single getUserSummary call per request

### Open Questions
- When to trigger a second auto-analysis (after more conversation data)?
- Should taste test responses get a separate analysis prompt group (taste-specific traits)?
- "פרופיל" sidebar button still not connected

---

## Previous Session: 2026-05-05/06

### What We Worked On

#### 1. Conversation System — Topic-Based RAG (replaced Phase-Based)
- **Replaced** message-count-based phases (opening/middle/deep) with **topic-based flow** driven by summary coverage
- Topic order: `intro` → `relationships` → `values` → `culture`
- `getCurrentTopic()` checks summary fields → returns first uncovered topic → injects only that topic's prompt
- Each topic prompt is slim (~100 tokens) — only what the AI needs right now
- Deleted `phase-opening.txt`, `phase-middle.txt`, `phase-deep.txt` — replaced by topic files
- Base prompt updated: emphasis on active steering ("אתה מוביל — לא רק זורם"), cover all topics, don't linger on general stuff
- Removed rigid "2-3 questions per topic" rule — AI should draw out concise users and flow with expressive ones

#### 2. Taste Test Feature (Full Implementation)
- **New channel**: `new_chat_taste` — separate conversation mode for taste profiling
- **Profile bank**: 24 synthetic profiles per gender (male + female), parsed into arrays at startup
- **Smart RAG**: injects **one profile at a time** based on message count (~80 tokens per profile), not entire bank (~5000 tokens)
- **Curated selection**: 8 diverse profiles per session (intellectual, street, spiritual, mainstream, family, artsy, sensitive, formal)
- **3 phases**:
  1. Intro (msg 0) — opening message + first profile (or ask gender preference if not set)
  2. Profile presentation (msg 1-7) — react briefly + show next profile + ask 1-10 rating
  3. Summary (msg 8+) — summarize taste patterns in 2-3 sentences
- **Gender handling**: `looking_for_gender` = man/woman → matching profiles; "both" → alternating male/female selection order; not set → asks user first
- **Re-entry support**: if user leaves and comes back, reminds them of last unanswered profile (same pattern as cognitive)
- **Frontend**: "נתח את הטעם שלי" button (home screen + sidebar) switches to `new_chat_taste` channel
- **Analysis**: taste test messages (`guide = 'new_chat_taste'`) automatically included via `guide LIKE 'new_chat%'`
- **Status endpoint**: `has_taste_info` now checks taste test messages count (≥5) in addition to summary field

#### 3. Smart Topic Detection — Follow the User + History Scan
- **Problem**: Chat ignored user's topic requests and repeated topics already discussed
- **Root cause**: Topic selection relied solely on summary (updates every 8 msgs) — blind to what actually happened in conversation
- **Solution — 3-layer topic detection in `getCurrentTopic()`**:
  1. `detectUserRequestedTopic(currentMessage)` — if user's current message mentions a topic (keywords), follow them there (highest priority)
  2. `detectTopicsInHistory(history)` — scan conversation history for keywords to find topics already discussed (even before summarizer ran)
  3. Fallback — first uncovered topic in default order (intro → relationships → values → culture)
- **Keyword patterns per topic**: `relationships` matches מחפש/זוגיות/מערכת יחסים/אקס etc., `intro` matches עובד/לומד/תואר etc.
- **History passed from index.ts** — `buildChatPrompt` now receives `history` array to enable scanning without extra DB queries
- **Relationships prompt improved** — explicit instruction to ask about past relationships (what worked, what didn't, why it ended)
- **Prompts stay slim** — no "topics covered/missing" lists injected; code handles the logic, prompt just guides the current topic

#### 4. Frontend Bug Fixes
- **Fixed channel race condition**: `sendMessage()` now accepts `channelOverride` parameter — sends correct channel immediately instead of relying on async React state update. Fixes both cognitive and taste test channel switching.
- **Fixed `setTopicsOpen` reference error**: removed call to non-existent state setter in overlay click handler
- **Removed taste_test placeholder screen**: taste test now runs through the chat, not a separate placeholder

### Files Created
- `backend/src/agents/conversation/prompts/topic-intro.txt` — Topic: background, occupation, education
- `backend/src/agents/conversation/prompts/topic-relationships.txt` — Topic: what looking for, past relationships
- `backend/src/agents/conversation/prompts/topic-values.txt` — Topic: values, positions, what matters
- `backend/src/agents/conversation/prompts/topic-culture.txt` — Topic: taste, culture, hobbies, social style
- `backend/src/agents/conversation/prompts/taste-test-chat.txt` — Taste test system prompt (slim, no profiles)
- `backend/src/agents/conversation/prompts/taste-profiles-female.txt` — 24 female profiles (from Docs)
- `backend/src/agents/conversation/prompts/taste-profiles-male.txt` — 24 male profiles (from Docs)

### Files Modified
- `backend/src/agents/conversation/chatManager.ts` — Major rewrite: topic-based flow, taste test channel handling, profile parsing, curated selection, re-entry detection
- `backend/src/agents/conversation/prompts/new-chat-base.txt` — Active steering emphasis, topic coverage requirements, draw out concise users
- `backend/src/index.ts` — `has_taste_info` now checks taste test message count
- `frontend/src/NewChat.tsx` — `sendMessage` accepts `channelOverride`, taste test via chat channel, removed placeholder, fixed bugs

### Files Deleted
- `backend/src/agents/conversation/prompts/phase-opening.txt` (replaced by topic-intro.txt)
- `backend/src/agents/conversation/prompts/phase-middle.txt` (replaced by topic-relationships.txt + topic-values.txt)
- `backend/src/agents/conversation/prompts/phase-deep.txt` (replaced by topic-culture.txt)

### Decisions Made
- Topic-based RAG over phase-based: flow driven by actual coverage (summary), not arbitrary message counts
- One profile per prompt: ~80 tokens instead of ~5000 — massive token savings
- 8 profiles per session: enough diversity without fatigue
- Draw out concise users instead of skipping ahead — more data = better matching
- Taste test messages included in analysis (via existing `guide LIKE 'new_chat%'` query)
- Code handles topic routing logic, not the prompt — keeps prompts slim and natural
- User's current message has priority over default topic order — follow the user, don't fight them
- History-based keyword scan solves the "summarizer lag" problem without adding DB queries

### Open Questions
- When to trigger a second auto-analysis (after more conversation data)?
- Should taste test responses get a separate analysis prompt group (taste-specific traits)?
- "פרופיל" sidebar button still not connected

---

## Previous Session: 2026-05-05 (morning)

### What We Worked On

#### 1. Guided Conversation System (New Chat Overhaul)
- Rewrote `new-chat-base.txt` — expert-led conversation with specific, interesting questions instead of generic ones
- Created 3 phase-based guidance prompts (RAG injection based on message count):
  - `phase-opening.txt` (0-6 msgs) — light intro, basic background
  - `phase-middle.txt` (7-20 msgs) — taste, style, social world, culture
  - `phase-deep.txt` (21+ msgs) — values, relationships, identity
- Base prompt slimmed from ~1,034 to ~504 tokens — all specific questions moved to phase files
- Phase guidance injected via RAG (only the relevant phase is sent to OpenAI)

#### 2. Cognitive/Simulation Chat Mode
- Created `cognitive-chat.txt` prompt with 27 simulation questions across 7 categories
- Added "בוא נבין את סגנון החשיבה שלי" bubble in NewChat home screen
- Frontend tracks `channel` state (`new_chat` vs `new_chat_cognitive`)
- Messages saved with `guide = 'new_chat_cognitive'` for separate tracking
- Chat naturally suggests cognitive mode when summary is complete + no cognitive done yet
- Agreement detection: when user says "כן"/"יאללה"/"בוא" after suggestion → auto-switches to cognitive prompt
- Backend returns `switch_to_cognitive: true` → frontend updates channel automatically

#### 3. Conversation Summarization System
- Created `summarizer.ts` — extracts structured user info from chat history
- Uses GPT-4o-mini (async, non-blocking, cheap)
- Triggers every 8 user messages (first at 6)
- 9 fields: general_info, occupation, background_culture, social_style, taste_and_style, relationships, values, intellectual_world, notable_quotes
- Updates existing summary (doesn't rebuild from scratch)
- New DB table: `user_chat_summaries` (JSONB, per-user)
- Summary used in profile intent when no formal analysis exists

#### 4. Auto-Analysis System
- Created `autoAnalysis.ts` — triggers full analysis when conditions met:
  - Summary ≥5 of 8 fields filled
  - ≥5 user messages in cognitive chat
  - `auto_analyzed` flag is false
- Runs in background (non-blocking), sets `users.auto_analyzed = TRUE`
- New DB column: `users.auto_analyzed BOOLEAN`

#### 5. Analysis Now Includes All 3 Chat Types
- Updated `buildAnalysisTranscript()` in `orchestrator.ts`
- Part 1: Interviewer (lab/personality) — as before
- Part 2: Psychologist (depth chat) — as before
- Part 3: New chat (general + cognitive) — NEW, `guide LIKE 'new_chat%'`
- Each part only included if it exists for the user

#### 6. Frontend Improvements
- Home screen expert recommendations when cognitive or taste info is missing
- New API endpoint: `GET /new-chat/status/:user_id` for recommendation flags
- Insights empty state: improved message directing user to ask chat "מה למדת עליי"
- Added `emptySubtext` style for secondary hint text

#### 7. Data Cleanup
- Deleted 18 test `new_chat` messages for user 14 (Noy) — preserved interviewer (41) + psychologist (46)
- Ran successful reanalysis for Noy with updated transcript builder

---

## Previous Session: 2026-05-03 / 2026-05-04

### What We Worked On

#### 1. Per-Category Matching Scores
- Added 11 category-specific match scores (cognitive, emotional-social, emotionality, communication, vibe, popularity, big_five, schwartz, style, general, mbti)
- Each category computes similarity only on its own traits
- Added `profile_score` — weighted average of category scores
- Displayed all scores in Candidate Matches admin table

#### 2. Matching Algorithm Improvements
- Changed similarity formula from linear to **Gaussian** (σ=12): `100 × e^(-(diff²)/(2×144))`
- Gender adjustments for emotionality (+10 male) and emotional-social (+4 male) in male-female pairs — uses 50/50 hybrid (trait-by-trait + profile average)
- External score: real visual similarity (was placeholder returning 100)
- External weights: Appeal×3, Fitness×3, Femininity×2, rest×1
- Ratios: 70/30 internal/external (65/35 for appearance-sensitive users)
- Appearance sensitivity threshold: score≥70 AND confidence≥0.7
- Cognitive score normalization: range 10-90 → 0-100

#### 3. MBTI System
- Added 6 MBTI traits (sensing, intuition, thinking, feeling, judging, perceiving)
- Created `mbti-system.txt` prompt
- MBTI type displayed in admin profile + Insights screen
- Thinking gets +10 before comparing with Feeling
- Migration script: `addMbtiTraits.ts`

#### 4. Communication Tone Restructure
- Removed old 8 traits, replaced with 3: energetic_intensity, assertiveness_forcefulness, charismatic_presence
- Moved theatricality to Personal Style
- Migration script: `restructureCommTone.ts`

#### 5. External/Visual Traits
- Added 8 manual visual traits (appeal, warmth_visual, femininity_masculinity, glamour, naturalness, fitness_aesthetic, style_polish, skin_tone_range)
- Editable in admin user detail
- Manual traits survive reset-analysis and reanalyze
- Migration script: `updateLookTraits.ts`

#### 6. New Chat Frontend (NewChat.tsx)
- Complete new user-facing UI: sidebar + chat + sub-screens
- Screens: home (welcome), chat, profile_edit, insights, bug_report, settings (placeholder)
- Sidebar with mobile toggle (☰)
- Set as default screen after login/registration

#### 7. RAG-Based Chat Manager
- `chatManager.ts` — intent detection via regex patterns
- Three intents: profile, system, general
- Injects context only when relevant (not fat prompt)
- Prompts split into: `new-chat-base.txt`, `context-profile.txt`, `context-system-info.txt`
- Safe Output Layer (`safeOutputLayer.ts`) — returns only user-safe data

#### 8. Insights Screen
- Shows MBTI type with description
- Strong Schwartz values (>60) with explanations
- Big Five highlights (>60, excluding neuroticism) with explanations
- Gender-appropriate Hebrew language

#### 9. User Profiles Tab (Admin)
- Updated from 4 old categories to 9 new categories
- Cognitive profile uses DB value only (no local fallback)
