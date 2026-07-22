# WORK_LOG.md — One (formerly MatchMe) Development Log

## Latest Session: 2026-07-22 (Admin Improvements + Photo Verification + Pool Filters)

### Admin — Candidate Match Notes
- New `admin_notes` column on `candidate_matches` table
- Editable inline textarea with save/cancel in admin candidate matches table
- Endpoint: `PATCH /admin/candidate-matches/:id/notes`

### Admin — New Email Templates
- "הודעה חדשה במערכת" — notification that a message is waiting
- "התאמה מחכה!" — celebratory match notification (🎉) with gender-aware text (מישהי/מישהו based on looking_for_gender)
- All system emails (not OTP) now include footer: "לא ניתן להשיב למייל זה. מוזמנים לפנות אלינו בוואטסאפ או במייל התמיכה"
- Email body alignment fixed: `margin:0 auto; text-align:right`

### Admin — Send System Question from User Screen
- Input field + "שלח שאלה" button directly in the system questions section of each user
- Calls existing `POST /admin/users/:id/system-question` endpoint

### Admin — Photo Analysis Button
- "ניתוח חיצוני" button (orange) in admin user toolbar
- Triggers `POST /admin/users/:id/run-photo-analysis` with result feedback

### Profile — Empty Defaults with Placeholders
- Removed pre-filled defaults (רווק/ה, אין ילדים, לא מעשן/ת)
- All sensitive fields (marital status, children, religion, smoking) start empty with placeholder text
- Existing users keep their current values

### Match Without Photo Approval
- "שלח ללא תמונות" button (orange) in candidate matches when both users have 0 photos
- `/prepare` endpoint now accepts `waiting_first_rating` / `waiting_second_rating` status (skips rating step)

### Fake Profile Detection in Photo Analysis
- GPT-4o Vision prompt extended with 5 verification fields: `is_real_photo`, `is_adult`, `apparent_gender`, `is_ai_generated`, `verification_notes`
- Results saved to `users.photo_flags` (JSONB column)
- Admin alert box (🚨) with Hebrew descriptions on user detail page
- 🚨 indicator next to flagged user names in users list
- Flags auto-clear on clean re-analysis
- Detects: not a real person, minor (<18), AI-generated, gender mismatch

### Pool Filters in Admin
- **Users tab**: new "מאגר התאמות" filter — הכל / סטרייט / נשים→נשים / גברים→גברים
- **Candidate matches tab**: same pool filter with result counts per category
- Backend: candidate-matches query now returns `user1_gender`, `user1_looking_for`, `user2_gender`, `user2_looking_for`
- Display-only separation (no algorithm changes)

### Deployed to production: all changes

---

## Previous Session: 2026-07-22 (Match Screen Overhaul)

### Match Hub Screen (replaces direct match card navigation)
- New `match_hub` screen — central hub with partner photo/name/age/city header + action cards:
  - **שיחה** — chat button with unread badge
  - **כרטיס התאמה** — view match card
  - **פרופיל** — partner profile with swipeable photo gallery (4/5 aspect, indicator bar, nav arrows, tap zones, photo counter)
  - **ביטול התאמה וחזרה למאגר** — subtle cancel button at bottom
- Sidebar "ההתאמה שלי" now navigates to hub (not directly to card)
- Home screen banners also navigate to hub
- MatchChat back button goes to hub

### Match Cancellation Flow (User-Initiated)
- Cancel screen with yellow warning box ("ישפיע על שני הצדדים")
- Feedback textarea (optional) + double confirmation dialog
- On cancel: both users → `waiting_match`, feedback saved to `conversation_messages` with `guide='match_feedback'`
- Schema: `cancelled_by`, `cancellation_feedback_user1`, `cancellation_feedback_user2` columns on matches
- Endpoint: `POST /users/:id/cancel-match` (reuses admin cancel logic for unfreezing)

### Past Matches ("התאמות קודמות")
- Sidebar item shown when user has cancelled matches and no active match
- List screen: partner photo + name + status "בוטלה" + who cancelled
- Detail screen with two variants:
  - **Canceller**: editable feedback textarea
  - **Cancelled-by**: encouraging message ("הצד השני בחר שלא להמשיך... אנחנו ממשיכים לחפש... עד שנמצא את ה-One שלך") + feedback textarea
- Feedback editable at any time via `POST /users/:id/match-feedback`
- Feedback saved to both matches table and conversation_messages (for AI analysis)

### Partner Profile View
- Swipeable photo gallery matching PotentialMatchScreen style
- Name + age above photo, city below name
- Visible circular arrow buttons + tap zones + indicator bar + photo counter
- Header title shows "פרופיל" (not "התאמה קודמת")

### Chat AI Match Awareness
- chatManager injects match status as internal note (not visible to user):
  - `in_match` → "user has active match"
  - `waiting_match` + recent cancel → empathetic context about cancellation
  - `waiting_match` → "in pool, waiting"
- 7 new regex patterns in SYSTEM_PATTERNS for match status questions
- Minimal addition to `context-system-info.txt` (3 lines about match status sensitivity)

### MatchChat Cancellation Detection
- Polling detects when match is cancelled by other side (match_id returns null)
- Shows inline notice: "ההתאמה בוטלה" + "חזרת למאגר" + back button

### Backend Endpoints Added/Modified
- `POST /users/:id/cancel-match` — user-initiated cancellation
- `GET /users/:id/match-history` — past cancelled matches
- `GET /users/:id/match-partner-profile` — partner's public info (name, age, city, photos)
- `POST /users/:id/match-feedback` — save/update feedback on cancelled match
- `GET /users/:id/active-match-card` — now includes `partner_city`
- `GET /new-chat/status/:id` — now includes `has_past_matches`

### Deployed to production: all changes

---

## Previous Session: 2026-07-22 (Prompt Refinements + QA Chat Fixes)

### Big Five Naming
- Renamed "רגישות רגשית" → "עוצמת תגובה רגשית" across 5 files (safeOutputLayer, Insights.tsx, chatManager, context-profile, bigfive-schwartz prompt)
- Clarified: measures emotional reactivity/volatility, NOT sensitivity or empathy
- AI instructed to gently correct when users say "אני רגיש/ה"

### Profile Prompt — "What did you learn about me"
- Changed: start from deep summary (personal_insights_full), not MBTI. MBTI is secondary tool
- Added Big Five theory context ("תיאוריית חמשת הגורמים") and Schwartz theory context for when users ask "how do you know this"

### System Info Prompt — Matching Explanation
- Restructured from model-based listing (Big Five, Schwartz, MBTI) to dimension-based:
  1. Cognitive profile 2. Cultural style 3. Emotional style 4. Schwartz values 5. Big Five 6. User preferences
- MBTI removed as standalone item
- Added note about additional dimensions (attachment, regulation mechanisms, etc.)

### QA Chat Fixes (chatManager.ts)
- **Topic stickiness fix**: topic detection now checks current message first, falls back to round history only during active calibration. Previously unrelated questions got stuck in topic-specific phase instructions
- **Removed forced closure**: no more MAX_GENERAL_MSGS limit. Closure only after calibration completion or explicit user decline
- **Removed "שיחה קצרה וממוקדת"**: was causing AI to try closing conversation and adding "אם יש לך עוד שאלות" on every response

### Ex/Acquaintance Handling
- Keyword detection (אקס, קרוב משפחה, מכיר אותו, etc.) in both qa_system AND qa_about_me channels
- Checks last 6 messages for follow-up context (not just current message)
- First mention: explain photo verification + option to share names for exclusion
- Follow-up details: accept warmly, explain system will try to identify but **can't guarantee 100%**

### Deployed to production: all prompt changes

---

## Previous Session: 2026-07-21–22 (Automated User Pipeline)

### Automated Completion Pipeline (Phase A) — deployed to staging
- **Pipeline orchestrator**: When user finishes all chat channels → auto-analysis run #2 → creates DB-backed job → generates insights → marks analysis_completed → enters matching pool (atomic) → sends welcome email
- **Job system**: `pipeline_jobs` table with status/attempts/last_error/step_reached. Polls every 2 min. Retry with backoff (3 attempts, 5/10/15 min). Survives server restart.
- **Insights extraction**: Moved 160-line insights generation from index.ts admin endpoint into `pipeline/generateInsights.ts`. Idempotency: skips if final insights exist, regenerates if `insights_pre_completion = true`
- **Welcome email**: Uses exact same template as admin panel's `buildPoolEmail()` — subject "הניתוח שלך ב-One הושלם", includes כרטיס התאמה CTA
- **Schema**: New `pipeline_jobs` table, `email_type` column on `email_log` with unique index for dedup

### Photo Analysis Pipeline (Phase B) — deployed to staging
- **GPT-4o Vision**: Analyzes up to 4 user photos, extracts 11 look traits (8 numeric 0-100, 3 categorical)
- **Traits**: appeal, fitness_aesthetic, femininity_masculinity, warmth_visual, glamour, naturalness, style_polish, skin_tone_range, hair_color, eye_color, hair_type
- **Guards**: Only with `photo_ai_consent = true`. SQL-level `WHERE source != 'manual'` prevents overwriting manual traits
- **Triggers**: Photo upload creates job (if analysis done + consent), daily reconciliation catches missed photos
- **Job metadata**: Stores which photos analyzed, timestamp, model version, raw AI output

### Admin Endpoints Added
- `POST /admin/users/:id/run-pipeline` — manual completion pipeline trigger
- `POST /admin/users/:id/run-photo-analysis` — manual photo analysis trigger
- `GET /admin/pipeline-jobs?user_id=X&status=Y` — view all jobs with status
- `POST /admin/users/:id/generate-insights?force=true` — force regenerate insights

### Bug Fix
- `PATCH /users/:id` was missing `test_user_type` in destructuring — new users from ProfileSetup had null test_user_type. Fixed.

### Files Created
- `backend/src/pipeline/generateInsights.ts`
- `backend/src/pipeline/completionPipeline.ts`
- `backend/src/pipeline/jobRunner.ts`
- `backend/src/pipeline/welcomeEmail.ts`
- `backend/src/pipeline/photoAnalysis.ts`

### Testing Status
- Initial staging tests by Chen: completion pipeline + photo analysis both working
- Still needs: more edge case testing, test with real user completing all channels end-to-end

---

## Previous Session: 2026-07-21 (OTP Stabilization + UX Improvements + Error Monitoring)

### OTP Investigation & Fix Verification
- Confirmed OTP UUID fix working: הגר (#18), רוני (#208), טל (#168) all successfully logged in
- Root cause confirmed: `supabase_uid` column is UUID type, `"otp-{id}"` was invalid → fixed with `crypto.randomUUID()`
- Investigated user #250 (אולי) photo upload 500 — new Google user, unrelated to OTP bug
- Added multer error handler: catches upload failures, logs to error_logs, returns 400 instead of silent 500

### Error Monitoring Improvements
- Error logs now show **user name** alongside ID (backend JOIN with users table)
- Fallback: extracts user ID from route path for older logs without user_id
- Frontend error reports now include `user_id` from localStorage
- **Severity classification** added to admin error logs:
  - 🔴 Red = critical (500 backend, OTP failure, 8+ repeated 401s for same user)
  - 🟡 Yellow = warning (403, 429, frontend 500)
  - No color = noise (one-time 401, Script error, OTP diag success)
- Filter dropdown: all / important only / critical only
- Badge counts for critical + warning at top

### Auth Screen Updates
- Removed yellow "תקלה זמנית" warning boxes
- Replaced with subtle gray text: "חווים בעיות בחיבור? נסו דרך גוגל / דווחו לנו במייל / בווטסאפ"
- Google login remains primary on all browsers (including in-app)

### Home Screen Footer
- Replaced old feedback link with compact icon row: 💬 feedback + WhatsApp logo + ✉️ email
- Icons only (no labels), styled in One purple (#8b7ba8) + WhatsApp green
- Text: "מוזמנים לשתף אותנו בתקלות, שאלות או כל דבר אחר:"

### ErrorBoundary
- Added WhatsApp link alongside email support link on crash screen

### Landing Page
- Added support contact links (email + WhatsApp) below "צוות One"

### OTP Fix Email
- Sent email to 21 affected OTP users about the fix
- Template: centered One logo, "עדכון ממערכת One" header, WhatsApp + email contact links

### 401 Error Analysis
- Confirmed most 401s are noise: old token → session-expired → re-login → works
- User #130 (Gal Ella), #150 (חן), #17 (אנה) — all normal token refresh patterns
- `/admin/auth-alerts` endpoint available for detecting repeated 401 patterns

### Photo Upload Investigation
- User #250 (אולי) — new Google user, got 500 on photo upload (unrelated to OTP)
- Root cause unknown — multer error wasn't logged
- Fix: wrapped multer in error handler, now logs upload failures to error_logs + returns 400

### Error Logs: "Clear Noise" Button
- Backend: `DELETE /admin/error-logs?noise_only=true` removes 401s, Script errors, OTP diag success
- Frontend: "נקה קלות" button keeps critical + warning, clears noise
- Renamed old button to "נקה הכל"

### ErrorBoundary Verification
- 0 React crash errors in logs — no user has hit the crash screen
- If triggered: logged as "React crash: ..." with 🔴 severity

### OTP Fix Email Sent
- 21 affected users notified via email about the fix
- Template: One-branded, centered logo, "עדכון ממערכת One" header, WhatsApp + email contact

### Open Security Items (not urgent, for future staging work)
1. Revert Google-first login in in-app browsers when OTP stable
2. Remove otp-diag logging
3. Filter fields in /register, POST /users, PATCH /users/:id responses
4. Signed URLs for /uploads (currently origin/referer check)
5. XSS review (dangerouslySetInnerHTML, messages, filenames)
6. Per-user rate limit on messaging endpoints
7. Separate APP_JWT_SECRET for OTP tokens
8. Shorten OTP token expiry (currently 7 days, no refresh)
9. Review /auth/exchange-code — no rate limit

---

## Previous Session: 2026-07-20 (Security Hardening + OTP UUID Fix)

### Security Session (Claude session 1)

#### Security Audit
- Full 11-area security audit → report at `reports/security-audit-2026-07-19.md`
- Endpoint audit table → `reports/endpoint-audit-table.md`

#### Security Fixes Applied (merged to production):
1. CORS restricted to allowlist (joinone.io, staging, localhost, Capacitor)
2. Helmet.js with CSP headers
3. `/login` returns safe fields only (not SELECT *)
4. `/analyze` + `/analyze-profile` IDOR fixed (JWT owner verification)
5. `/system-question/answer` ownership check
6. `GET /users/:id` explicit safe fields (no admin_notes, devices_seen)
7. `/auth/sync` + `/auth/verify-otp` safe fields (not SELECT *)
8. Photo files deleted from disk on account deletion (user + admin)
9. Auth rate limiting: 30/10min/IP + OTP send 5/hour/email
10. OTP verify lockout after 5 failed attempts per email
11. Open redirect fixed (redirectTo validated against allowlist)
12. PII removed from logs (emails, transcript content)
13. File upload hardening (extension whitelist + MIME check)
14. `/uploads` origin/referer middleware
15. `express.json` 1mb limit

#### OTP UUID Fix (ROOT CAUSE of Hagar/Hadar failures)
- **Bug:** `supabase_uid` column is UUID type, but code generated `"otp-{id}"` string
- **Error:** `invalid input syntax for type uuid: "otp-163"`
- **Fix:** Changed to `crypto.randomUUID()` → proper UUID generated
- **Commit:** 87e3d7a

#### OTP Atomic Login
- verify-otp now returns 500/503 if JWT signing fails (not 200 without token)
- Frontend rejects verify-otp responses without access_token

#### Temporary UX (still active):
- Google login primary on all browsers (including in-app browsers)
- Yellow notice on OTP screens about temp issue + links to Google/email/WhatsApp support
- Landing page: support contact links added
- **TODO:** Revert in-app browser order when OTP confirmed stable

#### New Files:
- `backend/src/audit-orphan-photos.ts` — orphan photo file detector
- `reports/security-audit-2026-07-19.md`
- `reports/endpoint-audit-table.md`

#### New Admin Endpoint:
- `GET /admin/auth-alerts` — detects repeated 401s and OTP-then-401 patterns

#### Schema Change:
- `otp_codes.failed_attempts INTEGER DEFAULT 0`

---

## Previous Session: 2026-07-20 (OTP Auth Fix + Error Handling + Insights Prompt)

### What We Did
Fixed critical auth issues affecting OTP users after security hardening broke OTP login (no JWT was generated). Multiple iterations required due to incorrect initial approach. Also improved error handling and updated insights prompt.

**Full technical report for security review:** [`reports/otp-auth-fix-2026-07-20.md`](../reports/otp-auth-fix-2026-07-20.md)

**Branch:** `staging` → deployed to both staging and production
**17 commits** — see report for full list and rationale

### 1. OTP Login — Complete Auth Flow Fix
**Problem:** Security hardening (2026-07-19) added `requireAuth` to all API routes, but OTP login never created a JWT. All OTP users (דנית, הדר, טל, יוליה) got 401 on every API call — broken app experience.

**Root cause chain:**
- `verify-otp` returned user data without any JWT token
- No Supabase session created for OTP users
- All subsequent API calls rejected by `requireAuth` middleware

**Solution — self-signed JWT approach:**
- Backend signs JWT using `SUPABASE_JWT_SECRET` (HS256, 7-day expiry) after OTP verification
- JWT `sub` = user's existing `supabase_uid` (or generated `otp-{id}` for new users)
- `auth.ts`: added `!header.kid` check to skip JWKS and use JWT secret directly for HS256 tokens (JWKS `getSigningKey(undefined)` threw instead of calling error callback)
- Frontend saves token to localStorage via `saveSupabaseTokens()`

**Additional OTP fixes:**
- `getAccessToken()`: reversed strategy — localStorage first, Supabase client fallback (prevents Supabase from interfering with OTP sessions)
- `onAuthStateChange` SIGNED_OUT handler: disabled entirely (Supabase client fires SIGNED_OUT for OTP users who have no Supabase session, causing logout loops)
- Logout now handled only by explicit `handleLogout()` and `session-expired` events

### 2. Token Refresh Mechanism
**Problem:** When Supabase JWT expired (after 1 hour), users saw a broken/blank app with no way to recover.

**Solution:**
- `apiFetch`: on 401 with existing token → attempt `supabase.auth.refreshSession()` → retry request
- If refresh fails → dispatch `session-expired` event → redirect to login screen
- Guard: only triggers when token existed (prevents firing during pre-auth flows)

### 3. ErrorBoundary — No More White Screens
**Problem:** React render crashes showed blank white pages.

**Solution:**
- `ErrorBoundary` class component wraps entire App
- Shows friendly Hebrew error screen: 😔 "משהו השתבש" with reload/home buttons
- Auto-reports crash to `/api/log-error` with component stack
- `report-bug` endpoint changed from `requireAuth` to `optionalAuth` (bug reports work even when auth is broken)

### 4. Insights Prompt — Second Person (גוף שני)
**Problem:** Generated insights for ענבל were written in third person ("ענבל היא אישה...").

**Solution:**
- Rewrote system prompt with explicit correct/incorrect examples
- Removed `genderWord` ("המשתמשת") from prompt body — replaced with direct second-person references
- Added closing reminder: "כל הטקסט בגוף שני"
- Fixed `partnerType` bug: was based on user's gender instead of `looking_for_gender`
- Fixed ענבל's existing insights directly in production DB

### 5. Insights Null Safety
**Problem:** Users without traits data (דנית, טל) got JS crash: `Cannot read properties of undefined (reading 'type')`.

**Solution:** Added `?.` to `profile.mbti?.type` in 3 places in `Insights.tsx` (lines 159, 187, 519).

### 6. Admin Email Template + Support Email Fix
- New template: "עדכון לאחר תקלה" — post-bug-fix notification email with support contact
- Fixed incorrect support email across all public pages:
  - `terms.html`: contact@joinone.io → one-support@googlegroups.com
  - `privacy.html`: contact@joinone.io → one-support@googlegroups.com
  - `csae-policy.html`: support@joinone.io → one-support@googlegroups.com
  - `delete-account.html`: support@joinone.io → one-support@googlegroups.com

### Files Changed:
| File | Changes |
|------|---------|
| `backend/src/index.ts` | OTP verify: self-signed JWT, supabase_uid sync, insights prompt rewrite, report-bug optionalAuth, jwt import |
| `backend/src/auth.ts` | JWKS kid guard for HS256 fallback |
| `frontend/src/App.tsx` | ErrorBoundary, session-expired listener, disabled SIGNED_OUT handler |
| `frontend/src/lib/api.ts` | Token refresh on 401, localStorage-first getAccessToken |
| `frontend/src/AuthScreen.tsx` | Save OTP tokens to localStorage |
| `frontend/src/Insights.tsx` | mbti?.type null checks |
| `frontend/src/AdminView.tsx` | Post-bug-fix email template |
| `frontend/public/terms.html` | Support email fix |
| `frontend/public/privacy.html` | Support email fix |
| `frontend/public/csae-policy.html` | Support email fix |
| `frontend/public/delete-account.html` | Support email fix |

### 7. Session-Expired UX
**Problem:** When a user's token expired, they were silently redirected to the login screen with no explanation. Users with legacy sessions (no JWT) got stuck on a broken screen entirely — `session-expired` didn't fire because the guard required a token to exist.

**Fixes:**
- `apiFetch`: fire `session-expired` on any 401 (not just when token existed). Safe because `apiFetch` is only called by logged-in components; login/OTP flows use raw `fetch`
- Added dedup (`fireSessionExpired`) to prevent multiple simultaneous events from parallel API calls
- Auth screen now shows a yellow notice: "החיבור שלך פג תוקף. יש להתחבר מחדש." when redirected via session-expired

### 8. ErrorBoundary — Report Link
**Problem:** When the app crashed, users saw a friendly error screen but had no way to report the issue if the app was fully broken.

**Fix:** Added a `mailto:one-support@googlegroups.com` link on the crash screen: "הבעיה חוזרת? כתבו לנו ונטפל"

### 9. Admin Error Log Clear
**Problem:** "נקה ישנים" button only deleted logs older than 30 days. All visible logs were recent, so nothing was deleted.

**Fix:** Changed to delete all logs (`?all=true`). Also fixed SQL injection in the interval parameter (was string interpolation, now parameterized).

### 10. Insights Crash — allValues Undefined
**Problem:** When `/detailed-traits` API returned 401 (error JSON like `{error: "..."}`), the response was stored as `profile`. Then `profile.allValues.length` crashed because `allValues` didn't exist on the error object.

**Fix:**
- Check `r.ok` before parsing detailed-traits response
- Validate `data.allValues` exists before setting profile
- Added `?.` null checks on `allValues` and `allBigFive` accessors

### Affected Users (Production):
- **ענבל (246)** — insights rewritten to second person directly in DB
- **הדר (244), דנית (207), טל (168), יוליה (245)** — will auto-fix on next OTP login (get JWT + supabase_uid)

---

## Previous Session: 2026-07-19 (Security Hardening Audit)

### What We Did
Full security audit + 2 rounds of fixes pushed to `staging` branch.

**Branch:** `security-hardening` merged into `staging` (2 commits: 89b7cbf, 1ea4f45)

### Fixes Applied (12 items):
1. **CORS restricted** — allowlist: joinone.io, staging env var, localhost, Capacitor origins
2. **Helmet.js added** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options
3. **`/login` hardened** — returns only id/email/first_name/gender, normalized error (anti-enumeration)
4. **`/analyze` + `/analyze-profile` IDOR fixed** — JWT owner verification added
5. **`/system-question/answer` ownership** — verifies question belongs to auth user
6. **`GET /users/:id` safe fields** — explicit 28 fields instead of SELECT *
7. **Photo file deletion** — files deleted from disk on account deletion (user + admin)
8. **Auth rate limiting** — authLimiter (10/10min/IP), otpSendLimiter (5/hour/email)
9. **OTP verify lockout** — per-email failed_attempts counter, blocks after 5 failures
10. **Open redirect fixed** — redirectTo validated: strict origin + /auth/callback path only
11. **PII removed from logs** — emails, transcripts, user details stripped from console.log
12. **File upload hardening** — extension whitelist (jpg/png/webp/heic), double MIME+ext check
13. **`/uploads` protection** — origin/referer middleware blocks direct cross-origin access
14. **express.json limit** — 1mb payload cap

### Schema Change:
- `otp_codes` table: added `failed_attempts INTEGER DEFAULT 0` column (with ALTER TABLE migration)

### New File:
- `backend/src/audit-orphan-photos.ts` — reports files on disk with no DB record (run with `npx ts-node src/audit-orphan-photos.ts`)

### Pending — User Must Test on Staging:
1. ✅ Login works (OTP sends and verifies)
2. ✅ Chat works (conversation loads and responds)
3. ✅ Photos load (profile photos visible in app + admin)
4. ✅ No CSP errors in DevTools Console (no "Refused to load" messages)
5. ✅ OAuth/Google login works
6. ✅ Capacitor app still works (if testing on mobile)
7. ✅ Admin panel loads and functions normally

### Pending — Not Yet Done (GPT review items):
- Integration tests with 2 users (IDOR attempts, invalid tokens, etc.)
- `STAGING_URL` env var needs to be added in Railway (the staging service URL)
- Full endpoint audit table (post-fixes)
- Production deploy (only after staging verified)

### Security Audit Report:
Full report saved to `reports/security-audit-2026-07-19.md`

---

## Previous Session: 2026-07-19 (API Security + Error Logging + Gender Fixes)

### What We Did

#### 1. Full JWT Auth Enforcement (All API Endpoints)

**Problem**: 107/111 API routes had NO authentication — anyone with a user ID could access any data.

**Solution — Three middleware layers:**
- `requireUserAuth` — 22 `/users/:id` routes: JWT + numeric ID ownership check (admin bypass included)
- `requireAdmin` — 65 `/admin/*` routes via `app.use("/admin", requireAdmin)` + email whitelist
- `requireAuth` — `/new-chat/message`, `/analyze`, `/matches`, `/report-bug` etc.

**Frontend migration:**
- All components (MatchChat, AdminView, AdminPipeline, NewChat, ProfileEdit, Insights, ConsentScreen, etc.) migrated from raw `fetch()` to `apiFetch()` which auto-attaches JWT
- `lib/api.ts`: FormData detection for file uploads

**New public routes** (pre-auth access):
- `GET /enum-options` — for registration forms (was `/admin/enum-options`)
- `GET /users/:id/conversation-history` — user loads own chat (was `/admin/full-transcript`)
- `DELETE /users/:id/account` — self-delete (was `DELETE /admin/users/:id`)

**Fixes during testing:**
- Admin bypass in `requireUserAuth` — admin can view any user's screen
- Admin bypass in `/new-chat/message` — admin can chat as other users
- `PATCH /users/:id` — added missing fields (consent, settings, match_card)
- Delete account — added missing FK tables (direct_messages, typing_status, match_scores)

#### 2. Error Logging System

**New table**: `error_logs` (source, user_id, route, method, status_code, message, stack, user_agent, extra)

**Frontend (automatic):**
- `apiFetch` auto-reports non-2xx responses (with response body in `extra.response`)
- `window.onerror` + `unhandledrejection` capture JS errors
- Dedup (same error not sent twice in 10s) + batching (flush every 2s)

**Backend (automatic):**
- `unhandledRejection` + `uncaughtException` logged to DB

**Admin panel:**
- New "שגיאות" tab — table with time, source, user, route, status, message
- Filter by frontend/backend, refresh, clear old logs

#### 3. UX Fixes

- **Thank-you screen after feedback** — "תודה רבה על הדיווח! מאוד חשוב לנו לשמוע חוות דעת..." + button to return home
- **Deal-breaker question** — neutralized gender (was masculine-only: "אדם שהוא גרוש")
- **Admin view gender** — pass full user object (including gender) when viewing as user, fixing masculine greeting for female users

### Files Changed
- `backend/src/auth.ts` — `requireUserAuth`, `requireAdmin` + admin bypass
- `backend/src/index.ts` — auth on all routes, new endpoints, logError helper, error logging routes
- `backend/src/schema.pg.ts` — `error_logs` table
- `backend/src/agents/conversation/chatManager.ts` — gender-neutral deal-breaker
- `frontend/src/lib/api.ts` — apiFetch with auth + error reporting + response body capture
- `frontend/src/App.tsx` — initErrorReporting + pass full user in admin view
- `frontend/src/AdminView.tsx` — ErrorLogsTab + pass full user in onViewDashboard
- `frontend/src/NewChat.tsx` — thank-you screen, use /users/:id routes instead of /admin
- All other frontend components — migrated to apiFetch

---

## Previous Session: 2026-07-19 (API Security — Full Auth Enforcement)

### What We Did

#### Full JWT Auth Enforcement Across All API Endpoints

**Problem**: 107 out of 111 API routes had NO authentication — anyone with a user ID could read/write any user's data.

**Solution**: Three-layer auth middleware applied to all endpoints:

##### 1. `requireUserAuth` (user-facing routes)
- Verifies Supabase JWT token
- Resolves numeric user ID from `supabase_uid`
- Checks `:id` URL param matches the authenticated user (prevents accessing other users' data)
- Applied to all 22 `/users/:id/*` routes

##### 2. `requireAdmin` (admin routes)
- Verifies JWT + checks email is in admin whitelist (`chen.hagag@gmail.com`)
- Applied globally via `app.use("/admin", requireAdmin)` — covers all 65 admin routes
- Also protects `/api/users/:id/reset-data` and `GET /users` (list all)

##### 3. `requireAuth` (general protected routes)
- JWT verification only (no user ID matching needed)
- Applied to: `/new-chat/message`, `/analyze`, `/analyze-profile`, `/report-bug`, `/system-question/answer`, `/matches/:id/rate`, `/matches/pending-rating`

##### Frontend Changes
- **MatchChat.tsx**: 9 raw `fetch()` calls → `apiFetch()` (sends JWT token)
- **AdminView.tsx**: ~52 raw fetches → `apiFetch()`
- **AdminPipeline.tsx**: 14 fetches → `apiFetch()`
- **NewChat.tsx**: 18 fetches → `apiFetch()`
- **ProfileEdit.tsx**: 8 fetches → `apiFetch()`
- **All other components**: migrated to `apiFetch()`
- **lib/api.ts**: Added FormData detection (skips Content-Type for file uploads)
- **New public `/enum-options` route**: for ProfileSetup/Register (was `/admin/enum-options`)

##### Routes Intentionally Left Open (pre-auth):
`/cities`, `/enum-options`, `/login`, `/register`, `/auth/*`, `/health`, `/privacy`, `/terms`, `POST /users`, `/track-page` (optionalAuth)

### Scaling Notes (Address When 100+ Concurrent Chat Users)

| Issue | Impact | When to Fix | Solution |
|-------|--------|-------------|----------|
| Polling DB load (5 queries/5s/user) | ~100 queries/sec at 100 users | 500+ concurrent | WebSocket or longer intervals |
| `findActiveMatch` no cache | Same query 12x/min per user | 200+ concurrent | In-memory cache, 30s TTL |
| `requireUserAuth` DB lookup | +1 query per request | 500+ concurrent | Cache uid→id, 5min TTL |
| No connection pool tuning | May exhaust PG connections | 300+ concurrent | Configure pool size |

**NOT a risk**: crashes (all try-catch + global handlers), message table growth (indexed + LIMIT 200).

### Files Changed
- `backend/src/auth.ts` — Added `requireUserAuth`, `requireAdmin` middlewares
- `backend/src/index.ts` — Applied auth to all routes + public `/enum-options`
- `frontend/src/MatchChat.tsx` — All fetch → apiFetch
- `frontend/src/AdminView.tsx` — All fetch → apiFetch
- `frontend/src/AdminPipeline.tsx` — All fetch → apiFetch
- `frontend/src/NewChat.tsx` — All fetch → apiFetch
- `frontend/src/ProfileEdit.tsx` — All fetch → apiFetch
- `frontend/src/Insights.tsx` — All fetch → apiFetch
- `frontend/src/ConsentScreen.tsx` — fetch → apiFetch
- `frontend/src/MatchCardConsentScreen.tsx` — fetch → apiFetch
- `frontend/src/Register.tsx` — fetch → apiFetch
- `frontend/src/ProfileSetup.tsx` — fetch → apiFetch
- `frontend/src/lib/api.ts` — FormData detection

---

## Previous Session: 2026-07-19 (Direct Messaging — Full Stability Pass + Features)

### What We Did

#### Part 1: Features

##### 1. iOS Keyboard Fix (MatchChat.tsx)
- First attempt: `visualViewport` resize collapsed entire chat — reverted
- Final: scroll-only approach — detects keyboard open/close via viewport height change, scrolls to bottom

##### 2. Home Banner Redesign — Two Modes (NewChat.tsx)
- **Before card view**: Celebratory banner with 🎉 + view card button + unread indicator + chat button
- **After card view**: Persistent compact card with partner photo, name + age, "ההתאמה שלי", round chat/card buttons with badge
- Tracked via `localStorage` (`match_card_viewed_{userId}`)

##### 3. Partner Age in Match Card API (backend/index.ts)
- Added `partner_age` to `GET /users/:id/active-match-card` response

##### 4. Unblock Match (MatchChat.tsx + backend)
- New `POST /users/:id/unblock-match` — only the blocker can unblock
- Frontend shows "הסרת חסימה" button when blocked by current user

#### Part 2: Critical Bug Fixes

##### 5. Server Crash Fix — RETURNING COUNT(*)
- `mark-messages-read` used `RETURNING COUNT(*)` — illegal in PostgreSQL
- This crashed the server **every time** a user opened match chat
- Root cause of repeated Railway crashes

##### 6. Health Endpoint Ordering
- `/health` was registered AFTER the SPA catch-all `app.get("*")`
- Railway health check got HTML instead of JSON → killed deployments
- Moved `/health` before catch-all

#### Part 3: Stability & Performance

##### 7. Global Crash Protection (backend/index.ts)
- Added `process.on("unhandledRejection")` + `process.on("uncaughtException")`
- 60+ async route handlers lack try-catch — this prevents ANY unhandled error from killing the server
- Also wrapped all 7 DM endpoints in individual try-catch with safe fallback responses
- Added NaN validation on all parseInt(req.params.id)
- Null check for deleted partner in pending-rating endpoint

##### 8. Rate Limit Fix
- DM endpoints (direct-messages, mark-messages-read, typing-status, active-match-card, unread-count) excluded from general rate limiter
- Problem: chat polling every 3s = ~60 req/min, hit 300/15min limit → blocked ALL API calls for user
- Fix: skip rate limit for high-frequency polling endpoints

##### 9. Lightweight Unread Count Endpoint
- New `GET /users/:id/unread-count` — returns `{ unread_count, chat_started }` only
- Home screen was fetching 200 messages just to count unread — now uses this instead
- Home polling interval: 5s → 10s

##### 10. Chat Polling Optimization (MatchChat.tsx)
- Polling interval: 3s → 5s
- `mark-messages-read` only fires when `unread_count > 0` (was every poll)
- `since` query now has `LIMIT 200` (was unbounded)

##### 11. Optimistic Message Dedup Fix (MatchChat.tsx)
- Temp messages now use negative IDs `-(Date.now())` instead of `Date.now()`
- Old approach: ID > 1.7 trillion = temp (brittle heuristic, could collide with real IDs)
- New approach: `id < 0` = temp (clean, impossible to collide)
- Dedup logic cleaned up — removes matched optimistic msgs before adding server msgs

##### 12. Smart Scroll (MatchChat.tsx)
- Tracks `isNearBottomRef` via `onScroll` handler
- Auto-scroll only fires if user is near bottom (threshold: 100px)
- Prevents losing scroll position when reading old messages and new one arrives

##### 13. Race Condition Fix (NewChat.tsx)
- `loadRecommendations` now uses generation counter (`loadGenRef`)
- Stale responses from rapid screen switching are discarded
- Prevents badge flicker and state overwrites

##### 14. Mark-Read Timing Fix (NewChat.tsx)
- Was marking messages read when returning from ANY screen to home
- Now uses `prevScreenRef` — only marks read when returning from `match_chat`
- Prevents unread badge disappearing without user reading messages

### Match Card Written
- Wrote match card for חן (150) + שני (142), match ID 3121 (staging)

### Infrastructure Issues Discovered
- Railway crashes were caused by two bugs: RETURNING COUNT(*) + health endpoint ordering
- NOT caused by code complexity or DM system itself

### Deployment State
- **Production** (main remote): has commits up to `9edd5f3` — rate limit fix + notification improvements
- **Staging** (staging remote): has all commits up to `ad32190` — full stability pass
- Staging needs testing confirmation before pushing to production

### Open Items
- **Auth verification on ALL API endpoints** — critical security gap, planned for next session
  - No endpoint verifies caller identity via JWT
  - Anyone with a user ID can read/write data via API
  - Need: Supabase JWT middleware + update frontend fetch calls to send token
  - `lib/api.ts` has auth wrapper but MatchChat.tsx uses raw fetch

---

## Previous Session: 2026-07-17/18 (Insights Batch + Pre-Completion Tracking + Generate-Insights Prompt Rewrite)

### What We Did

#### 1. Personal Insights — Batch Writing (27 users)
Wrote deep personal insights (summary_short + summary_full) for 27 users across two days:
- First batch (7): דנית, נוי, רוויטל, סיון, אריאל גבע, אבי, רוית
- Second batch (14 fully completed): אורטל, ליאור, אליה, דלית, מיכל, נביעה פמלה, ברקת, אלה פוקס, אושרת, רונה דייויס, ענבר, לבנה אשכנזי, הדר, רוני
- Partially completed (6): ימית, יערה, קרן, פז, מאיה, ליעד גונן + הילה

**Writing guidelines established:**
- Insights, not summaries — never quote/cite what user said in conversation
- No dry facts (job, hobbies, ideal evening) — these are known to the user
- Deep pattern analysis: emotional dynamics, relationship lessons, taste patterns
- Second person (את/אתה), gender-matched, warm but honest tone
- "את אדם" not "את בן אדם" (אדם is masculine in Hebrew)
- No intimate/sexual content even if shared in conversation
- Adapt language for looking_for_gender (woman/man/both/doesnt_matter)

#### 2. Insights Pre-Completion Tracking
New system to flag insights written before user completed all channels:
- **DB**: `insights_pre_completion BOOLEAN DEFAULT FALSE` on users table
- **Auto-set on PATCH**: When `personal_insights_full` is saved, backend checks cog/taste message counts — sets flag TRUE if incomplete, FALSE if complete
- **Auto-set on generate-insights**: Same logic in the AI generation endpoint
- **Admin UI**: Warning badge "⚠ הוזנו לפני סיום התהליך" shown next to insights button when flag is set
- **15 existing users** retroactively marked

#### 3. Generate-Insights Prompt Rewrite
Complete rewrite of the `/admin/users/:id/generate-insights` system prompt:
- **Before**: Generic instructions ("describe personality, strengths, communication style")
- **After**: Detailed guidelines matching manual writing style — no quoting, no facts, pattern analysis only
- Explicit prohibitions: no intimate content, no "את בן אדם", no generic statements
- Tone: "like a perceptive friend, not a clinical report"
- Structure guidance: each paragraph = new insight, not fact description
- max_tokens: 3000 → 4000, temperature: 0.7 → 0.75

#### 4. Settings: Match Card Info Link
Added "מה זה כרטיס התאמה?" link in Settings screen next to match card consent checkbox, linking to the full explanation screen.

#### 5. Health Endpoint for Zero-Downtime Deploys
Added `GET /health` endpoint returning `{ ok: true }` for Railway healthcheck-based zero-downtime deployments. User needs to configure Health Check Path → `/health` in Railway Dashboard.

#### 6. Match Card Written
Wrote match card for חן (150) + שני (142), match ID 3089.

### Technical Details
- Schema: `insights_pre_completion` column added with ALTER TABLE migration
- `PATCH /admin/users/:id`: `insights_pre_completion` added to allowed fields + auto-management logic
- `PersonalInsightsEditor` component: new `insightsPreCompletion` prop with warning badge
- `SettingsView` component: new `onShowMatchCardInfo` prop for navigation to consent screen

---

## Previous Session: 2026-07-15/16 (Match Card System + Region Revamp)

### What We Did

#### 1. Match Card Consent & Delivery System
Full flow for match cards — from consent to delivery:

**User-facing:**
- **MatchCardConsentScreen** — explains what a match card is, shows Gaya/Ofir demo example, approve/decline with optional restrictions, gender-adapted text
- **Home screen messages** — "all stages done" CTA to approve card + pool welcome message for pool users
- **Sidebar** — "כרטיס התאמה" item for users who completed all stages; becomes "ההתאמה שלי" with heart badge when match card is active
- **Settings** — toggle to change match card consent at any time
- **Celebration** — home screen banner "קיבלת התאמה!" with link to view card when active match exists
- **MatchCard.tsx** refactored — data-driven (accepts matchData prop), demo banner for examples, celebration header for real matches

**Admin:**
- **Two-step flow**: "שלח התאמה" → pre_match status → card entered via API → "בדיקת כרטיס התאמה" → preview modal with edit option → "אישור ושליחה"
- **Match card preview modal** — full card preview + inline editing + save + approve & send
- **Pool emails** — batch "מייל כרטיס למאגר" button + individual per-user button
- **Pool entry email** updated with match card consent paragraph
- **match_card_consent status** shown in user detail view

**DB:**
- `users`: `match_card_consent`, `match_card_restrictions`
- `matches`: `match_card_data` (JSONB), `match_card_approved_by_admin`, `match_card_sent_at`

**Endpoints:**
- `POST /users/:id/match-card-consent` — save consent
- `GET /users/:id/active-match-card` — fetch active card for display
- `POST /admin/matches/:id/prepare` — move to pre_match (pending card)
- `POST /admin/matches/:id/save-card` — save card content (JSONB)
- `POST /admin/matches/:id/approve-card` — admin approves
- `POST /admin/send-pool-emails` — batch consent email

#### 2. Region System Revamp
Complete overhaul of location filtering:

**9 regions** (was 6): גוש דן, שרון, עמקים-חוף, שפלה-מרכז, ירושלים, דרום-מערב, דרום-נגב, כרמל-חיפה, צפון

**Multi-region cities** — cities can belong to multiple regions (e.g. הרצליה → גוש דן + שרון). Code updated to check all regions of a city for location filter.

**Realistic adjacency** — e.g. גוש דן ↔ שרון/שפלה/ירושלים. חדרה/זכרון area gets its own "עמקים-חוף" region between שרון and כרמל.

#### 3. Expanded Matching Algorithm
- **"Run Expanded" button** in admin — relaxes age (+2 years) and location (bump one level)
- `age_expanded` column on candidate_matches with 🔞 indicator in admin table
- `location_expanded` 📍 indicator (existing)
- Age tolerance restored in regular run (was accidentally removed)

#### 4. Taste Test Prompt Fix
- Clarified system identity: "אתה חלק ממערכת One, המשתמש כבר בתוך המערכת"
- Added handling for user confusion about profiles vs single match
- Removed misleading "הלינק למערכת: joinone.io" that made AI think it's separate from the app

#### 5. Personal Insights Written
- Nadav (#23) — full insights saved to staging DB
- נטלי שבתאי (#16) — full insights saved to staging DB

#### 6. Match Card Created
- גיא (#97) & Gal Ella (#130) — test match card built and saved in staging

### Next Steps
- **In-app messaging** — "התחילו שיחה" button on match card should open a chat between matched users
- **Taste test prompt** — monitor for profile confusion issues after fix
- **Match card flow** — test full end-to-end on staging (send → user sees celebration + card)

## Previous Session: 2026-07-14 (Chat Review — New Users + Prompt Fixes)

### What We Did

#### 1. Chat Review — צאלה (#188), מיקי (#189), ליאור (#190)
- Reviewed conversations for 3 new users (post-review #120-166)
- ליאור (#190) still mid-conversation, only general + 2 cognitive messages

#### 2. Issues Found
- **מיקי: AI skipped opening question** — Prompt A sent "איך נראה יום רגיל שלך?" but AI invented a different question about what he looks for in a partner. Caused by short "כן" message giving AI nothing to react to, so it improvised.
- **צאלה: AI skipped deal-breaker questions in taste test** — phaseInstruction told AI to ask about smoking/lifestyle, but AI jumped straight to presenting profiles instead.
- **מיקי: AI self-closed taste test after 8/13 profiles** — AI said "עברנו על כל הפרופילים הזמינים" without receiving a closing instruction from the system. No summary was given.
- **מיקי: gender confusion** — "מה את/ה מגדיר/ה" for a male user (should be masculine only)
- **צאלה: redundant religion questions** — asked about religion connection after she already explained her religious background in detail

#### 3. Prompt Fixes (text-only, no logic changes)
- **Prompt A** (`promptTemplates.ts`): Emphasized "you MUST ask this exact question" in the required question label
- **Taste deal-breakers** (`chatManager.ts`): Strengthened "אל תציג פרופילים עדיין" → "**חובה:** אל תציג פרופילים בשום מקרה בשלב הזה" on both deal-breaker phases
- **Taste self-closing** (`chatManager.ts`): Added "אל תחליט בעצמך שהפרופילים נגמרו. כשהם ייגמרו, תקבל הוראה מפורשת לסכם ולסגור." in profile display phases

### Open Items
1. **Google OAuth on real device** — v2 AAB uploaded, needs testing
2. **Chat scrolling bug on native** — needs investigation on real device
3. **TEMP admin shortcut** — still active, keep for now
4. **Chat review 120-166** — 22 users still need review
5. **Score gap: category vs trait** — display inconsistency in admin
6. **Miki (#189)** — needs better photos
7. **Taste test: 1-10 scale** — מיקי gave 10 to almost everyone, scale may not differentiate enough (monitor)

---

## Previous Session: 2026-07-08–13 (Google Play Upload, OAuth Fix, Match Card, User Insights)

### Deployment
- Multiple pushes to production and staging
- AAB v2 (1.0.1) uploaded to Google Play Console (internal testing)

### What We Did

#### 1. Google Play — First Upload
- Built signed AAB with release keystore
- Uploaded to Google Play Console as internal testing release
- Created CSAE child safety policy page (`csae-policy.html`)
- Created feature graphic (`play-store-feature.html` template with dark mode logo)
- Tablet screenshots: resized phone screenshots to 7" (1200x1920) and 10" (1600x2560)
- versionCode bumped to 2, versionName to 1.0.1 for second upload

#### 2. OAuth Deep Link Fix (Ongoing)
- First upload had Google OAuth loop: Chrome Custom Tab → joinone.io → Google Play instead of back to app
- Root cause: `callback-native.html` intent URL redirect not working reliably
- Fix: restored HTTPS deep link (`/auth/callback`) + custom scheme fallback in AndroidManifest
- Updated assetlinks.json with release keystore SHA256 fingerprint
- Redirect URL changed back to `https://joinone.io/auth/callback`
- **Status: v2 AAB uploaded, awaiting testing on real device**

#### 3. Release Keystore Issue
- Original keystore had empty certificate chain (created with `-genkey` instead of `-genkeypair`)
- Recreated keystore → Google Play rejected (different fingerprint)
- Restored original keystore from `.bak` file — Google Play accepted
- **Lesson: NEVER recreate keystore once first AAB is uploaded to Google Play**
- Release keystore SHA1: `F6:63:A8:1D:0C:D9:95:34:0E:92:DD:B3:79:33:F9:51:9F:73:70:6E`
- Release keystore SHA256: `CB:B8:1F:6D:A0:27:D9:7B:21:CB:D3:13:30:C8:3A:DF:4E:B7:72:4E:7D:46:00:54:31:BF:61:44:5D:7D:AC:6F`

#### 4. Match Card — Demo Complete
- Full match card for Gaya (#130) & Ofir (#133) with AI-generated photos
- Combined intro presenting both people to each other
- 4 connection points (accordion style)
- Meeting suggestion + growth area + closing + CTA button
- Soft/potential language, privacy note
- Only visible to users #130 and #133
- Renamed: old "כרטיס התאמה" (couple insights) → "ניתוח זוגיות"

#### 5. User Insights — Miki (#189)
- Wrote `summary_short` + `summary_full` from full conversation analysis
- Scored 8 look traits from photo (appeal 45, warmth 55, masculinity 55, glamour 30, naturalness 75, fitness 45, style 35, skin_tone 55)
- Note: only 1 photo, screenshot from WhatsApp — needs better photos
- admin_checklist updated: insights + look_traits done

#### 6. UI Updates (Production)
- Replaced roundLogo with iconOnly (O symbol) across all screens
- Insights card order: MBTI → Attachment → Big Five → Values → Enneagram
- Admin pipeline: all stages collapsed by default
- Admin sidebar shortcut: available on Railway URLs (not joinone.io), chen's email only
- Data reset feature: users can delete conversations without deleting account

### Open Items
1. **Google OAuth on real device** — v2 AAB uploaded, needs testing
2. **Chat scrolling bug on native** — needs investigation on real device
3. **TEMP admin shortcut** — still active, keep for now
4. **Chat review 120-166** — 22 users still need review
5. **Score gap: category vs trait** — display inconsistency in admin
6. **Miki (#189)** — needs better photos

---

## Previous Session: 2026-07-06–08 (Capacitor Android, Match Card, Google Play Prep)

### Deployment
- Multiple pushes to production and staging
- Staging has additional features (match card demo, admin sidebar shortcut) not yet on prod

### What We Did

#### 1. Capacitor Android — First Build & Testing
- Installed Node 22 (required by Capacitor CLI v8), Android Studio, Pixel 7 emulator
- `npx cap sync android` + `npx cap open android` — app launches on emulator
- **OTP login works** on real device, Google OAuth works on real device
- **Google OAuth on emulator fails** — emulator kills app process during Browser.open (RAM issue)
- Created `callback-native.html` — static page that redirects via Android intent URL after OAuth
- Fixed: PWA install screen skipped on native (`isNativeApp()` check)
- Fixed: relative API URLs (`fetch("/api/...")`) → absolute (`getApiBaseUrl() + "/api/..."`) for native
- Fixed: `StatusBar.overlaysWebView: false` for safe area
- Fixed: `CapacitorHttp.enabled: false` to prevent fetch interference
- **Built debug APK** — tested successfully on real Android device

#### 2. App Icons & Signing Key
- Generated all Android icon sizes from `appLogo.png` using `@capacitor/assets`
- Created release keystore: `release.keystore` (alias: `one-release`, password: `oneapp2026`)
- Configured signing in `build.gradle` for release builds
- Keystore backed up to Dropbox — **do not lose, cannot update app without it**

#### 3. Google Play Preparation
- Created `delete-account.html` — static page for Google Play compliance (account + data deletion)
- Added `POST /api/users/:id/reset-data` endpoint — deletes conversations/analysis/matches, keeps account
- Settings screen: "מחיקת נתונים" button with double confirmation
- Admin notified via bug_reports when user resets data
- Created `play-store-feature.html` — 1024x500 feature graphic template with dark mode logo
- Privacy policy at `joinone.io/privacy.html` (already existed)
- Updated README.md to reflect current project state

#### 4. Match Card (Demo — for Screenshots & Future Template)
- **New component: `MatchCard.tsx`** — demo match card for Gaya & Ofir
- Visible only to users #130 and #133 in sidebar ("כרטיס התאמה")
- AI-generated photos in `frontend/public/demo/`
- **Match card structure** (template for future real match cards):
  1. Header: both photos with subtle heart connection symbol + names
  2. Combined intro: "הכירו אחד את השנייה" — brief bio of each person, then 2 lines summarizing the match
  3. Connection points (4): titled sections explaining why the match works
  4. "הצעה למפגש ראשון": suggestion for first meeting (not "date idea")
  5. "מה יכול להיות מעניין לבדוק ביניכם": growth area / point to watch (not "warning")
  6. Closing: why we believe in this match + privacy note about deeper layers
  7. "התחילו שיחה" CTA button
- **Writing style**: address both people directly (שניכם), soft/potential language (not absolute promises), professional but warm, no quotes or sensitive info
- Renamed: old "כרטיס התאמה" (couple insights) → "ניתוח זוגיות"

#### 5. Other Changes
- Reordered insights cards: MBTI → Attachment → Big Five → Values → Enneagram
- assetlinks.json uploaded for Android deep link verification
- Removed `Conversation Examples/` from all branches
- Deleted `postgres-migration` branch (no longer needed)
- Created `capacitor-apple` branch + instructions file for Ron (iOS developer)
- TEMP: admin sidebar shortcut on staging for chen only (for screenshots) — **MUST REMOVE**
- Synced staging with main

### Match Card Design Decisions (for future real match cards)
- Card is sent to **both** people — presents each to the other
- No match score shown to users
- Tone: "potential" not "certainty" — "יש סיכוי טוב" not "אתם בטוח"
- Connection points should be based on actual conversation analysis, not generic
- Include practical meeting suggestion, not just "go on a date"
- Include growth area framed as curiosity, not warning
- Privacy note: "there are deeper layers we found but can't share — discover them together"

### Open Items
1. **TEMP admin shortcut on staging** — must remove after screenshots done
2. **Google OAuth on emulator** — works on real device, emulator RAM issue
3. **Chat scrolling bug on native** — needs investigation on real device
4. **App icons** — generated but not tested in production build
5. **AAB build for Google Play** — signing configured, ready to build
6. **Google Play Console** — fill details, upload AAB, submit for review
7. **Chat review 120-166** — 22 users still need review
8. **"שלח התאמה" button** — placeholder, needs real match card/reveal flow (now have template)
9. **Score gap: category vs trait** — display inconsistency in admin

---

## Previous Session: 2026-06-30 (Match Attraction Rating Flow, Couple Partner, UI Fixes)

### Deployment
- All changes pushed to main (production) and staging

### What We Did

#### 1. Match Attraction Rating Flow (Full Feature)
- **DB**: `sent_for_rating_at`, `sent_for_rating_to`, `rejection_reason` columns on matches table
- **New status**: `rejected_acquaintance` — when user marks match as known person (ex/family/friend), doesn't count in rating stats
- **Admin endpoint**: `POST /admin/matches/:id/send-for-rating` — admin sends specific user a match to rate (via `sent_for_rating_to`)
- **User endpoint**: `GET /matches/pending-rating` — returns partner photos for the target user
- **Rate endpoint updated**: supports `known_person` rating → `rejected_acquaintance` status; clears `sent_for_rating_at/to` after each rating so admin must explicitly send to second rater
- **`/new-chat/status`**: returns `pending_rating` flag

#### 2. User-Facing Rating Screen (PotentialMatchScreen)
- New screen accessible from home screen card
- Photo gallery with arrow navigation + dot indicators
- Three rating buttons side by side: "בול הטעם שלי 🤍" / "אפשרי" / "לא הטעם שלי"
- "מכיר/ה" option in visible card below (gender-adapted text)
- Shows photo only — no name/age/city (decision to keep minimal)
- Thank you message after rating, auto-return to home

#### 3. Home Screen Match Card
- "יש לנו כיוון להתאמה אפשרית" card when pending_rating exists
- White card design matching overall style
- Gender-adapted CTA button ("בוא/י נראה")

#### 4. Admin Pipeline — Match Ratings Section
- New purple section above system questions in pipeline dashboard
- Shows all rated matches with per-user ratings (✅ בול / 🟡 אפשרי / ❌ לא / 👤 מכיר/ה)
- Status display: "ממתין לצד השני" / "שניהם אישרו" / "נדחה" / "מכיר/ה"
- "שלח לדירוג" button for second rater when first has rated
- Sent indicator (📩) when already sent

#### 5. Admin UserDetail — Match Actions
- "שלח לדירוג" button next to each match in waiting status
- Ratings display per side (הוא/היא vs צד שני)
- `rejected_acquaintance` status color (yellow-orange in UserDetail, red in CandidateMatches)
- Rejection reason shown when present

#### 6. Candidate Matches Tab Improvements
- `approved_by_both` shown in green (was yellow)
- `rejected_by_users` / `rejected_acquaintance` shown in red
- Ratings column: shows what each user rated (✅/🟡/❌/👤)
- "שלח התאמה" button (placeholder) when both approved
- Fixed: "צפייה במסך המשתמש" button now works when navigating from CandidateMatchesTab

#### 7. Couple Tester Partner Flow
- Auto-message for couples: "בעזרתכם" (was "בעזרתם"), gender-adapted partner instructions
- When partner not in system: guide to mark partner in "הפרטים שלי" screen
- When partner_name set + partner_in_system: personalized message with partner's name
- **ProfileEdit for couples**: shows partner name input instead of "מה אני מחפש/ת" preferences section
- `partner_name` field added to User interface

#### 8. UI/Design Fixes
- Admin message on home screen: white card with subtle border (was purple background with border-right)
- "צפייה במסך המשתמש" button: fixed disappearing when navigating to user from matches or CandidateMatchesTab (props weren't passed through nested UserDetail)

### Match Rating Flow
```
Admin → "שלח לדירוג" (sets sent_for_rating_to = target user)
  ↓
User home → sees card → clicks "בוא/י נראה" → PotentialMatchScreen
  ↓
Rates: bullseye/possible → waiting_second_rating (sent_for_rating cleared)
       miss → rejected_by_users
       known_person → rejected_acquaintance (not counted in stats)
  ↓
Admin → sees rating in pipeline → "שלח לדירוג" to second rater
  ↓
Second rater: bullseye/possible → approved_by_both
              miss → rejected_by_users
```

### New DB Columns
- `sent_for_rating_at` TIMESTAMPTZ on matches
- `sent_for_rating_to` INTEGER REFERENCES users(id) on matches
- `rejection_reason` TEXT on matches

### New Match Status
- `rejected_acquaintance` — user knows the match (ex/family/friend), not a taste rejection

### Open Items (Not Yet Done)
1. **Chat review for users 120-166** — 22 users still need conversation review
2. **"שלח התאמה" button functionality** — currently placeholder, needs full match card/reveal flow
3. **Score gap: category vs trait** — known display inconsistency in admin

---

## Previous Session: 2026-06-29 (Chat Fixes, System Questions, OTP, Agent Review)

### Deployment
- All changes pushed to main (production) and staging

### What We Did

#### 1. Chat Prompt Fixes (from agent conversation review)
- **SYSTEM_IDENTITY**: slimmed down — kept core rules only, moved detailed info to context-system-info
- **Template B**: added rule to answer user's direct questions before continuing
- **Template D**: fixed "buttons on home screen" → clear guidance for insights, feedback, main screen
- **context-system-info**: added notifications info (email/WhatsApp/app), post-completion flow, taste input anywhere, photo approval process, feedback screen fallback
- **Pool entry requirement**: fixed prompt to include conversation completion (was missing)

#### 2. Taste Test Fixes
- Inject list of already-shown profile names → prevents duplicate profiles
- After all profiles exhausted: explain pool is done, don't invent new ones
- Strengthened follow-up request for short answers

#### 3. Career Question Adaptive Logic
- Detects if user already mentioned studies in recent messages
- Adapts question: present tense for current students, past for graduates
- Skips career_basics entirely if AI already asked about studies as follow-up
- Gender-adapted phrasing ("איפה את לומדת" / "איפה אתה לומד")

#### 4. Clarification Question Detection
- New `isClarificationQuestion()` — detects short questions like "מה הכוונה?"
- When detected: answers via Template C without advancing to next topic
- Prevents skipping unanswered topics

#### 5. Conversation Progress
- Injects topic progress (e.g. 8/14) into prompt
- AI can answer "how much is left" naturally when asked
- Marked "do NOT mention unprompted"

#### 6. System Questions Feature
- New `system_questions` DB table
- Admin sends question to user → appears as card on home screen
- User answers with fixed options ("כן אין בעיה" / "אפשרי" / "לא")
- After answering: shows confirmation with selected answer highlighted
- Admin sees answered questions in pipeline dashboard with "ראיתי" button

#### 7. OTP as Default Login
- Changed email login from magic link to OTP code for all browsers
- Magic links caused issues (expiry, cross-browser sessions)

#### 8. Agent Tasks
- Downloaded all user photos (51 photos, 17 users) → `user-photos/`
- Downloaded all conversations (55 users) → `conversations/`
- Chat review report for users 167-183 → `reports/chat-review-167-183.md`

### Open Items (Not Yet Done)

1. **Chat review for users 120-166** — 22 users still need conversation review (same format as reports/chat-review-167-183.md)
   - Users to review: סיון (#166), סתיו שמחה (#165), אלמוג רובין (#164), יאנה (#163), הילה (#161), פלג סולרסקי (#158), יסמין כהן (#157), Ornat (#156), לינוי סימאי (#155), אביב וואל (#154), Netanela (#153), חן (#150), הינדי (#145), Ron (#143), אלישבע שטראוס (#137), דולב הלחמי (#136), עדן אלה (#133), Gal Ella (#130), איה (#120), איתי שגב (#117), ניצן בר אל (#115), גיא (#97)
   - Conversations already downloaded to `conversations/` folder

---

## Previous Session: 2026-06-28 (External Analysis, Pipeline Filters, Location Override)

### Deployment
- All changes pushed to main (production)

### What We Did

#### 1. External Visual Analysis — All 15 Ready Pool Users
- Viewed photos for all 15 users with photos in ready_pool via production API
- Scored 11 look traits per user: appeal, warmth, femininity/masculinity, glamour, naturalness, fitness, style, skin_tone, hair_color, eye_color, hair_type
- Used English values for categorical traits (hair_color, eye_color, hair_type) — Hebrew caused encoding issues (showed as `???`)
- Marked `external_analysis: true` in admin checklist for each user
- Entered all 15 users into matching pool (`enter_pool` pipeline action)
- Reference scores from staging practice run used for consistency calibration

#### 2. Matching Filter Fields in Pipeline Dashboard
- Pipeline API (`GET /admin/user-management`) now returns: `looking_for_gender`, `height`, `desired_age_min/max`, `age_flexibility`, `desired_height_min/max`, `height_flexibility`, `desired_location_range`, `cognitive_score`
- AdminPipeline card shows these fields for ready_pool/pool/completed_all stages
- Missing fields highlighted in red for quick identification
- Found all users had data except `desired_location_range` (see below)

#### 3. Location Override for Matching
- **Problem**: Users like רון (באר שבע, `my_city`) get zero matches because no compatible users in same city
- **Solution**: Admin can expand a user's location range without changing their preference
- New DB column: `admin_location_override TEXT` on users (null/my_area/bit_further/whole_country)
- New DB column: `location_expanded BOOLEAN` on candidate_matches — flags matches found via override
- matchStage1: tries original location filter first, falls back to admin override; marks pair as `location_expanded`
- AdminPipeline: dropdown next to location field to set override (highlighted yellow when active)
- AdminView match table: 📍 icon next to score when match is outside original location range
- Default `desired_location_range` when null: `bit_further` (was pass-all before)

#### 4. First Algorithm Run on Production
- Ran matching algorithm on 14 pool users (3 men, 11 women)
- Got 3 candidate matches for אור (#181)
- רון (#183) got zero — diagnosed: `desired_location_range: my_city` + באר שבע = no compatible women in city → location override feature built to address this

#### 5. Chat Prompt Improvements (context-system-info.txt)
- **User input anywhere**: Chat now knows users can write any preference/request anywhere in conversation and the system analyzes it all — not just in specific fields
- **Taste test channel**: Described accurately as style-focused (not just external appearance), with option to write external taste preferences there too
- **Photo approval process**: Chat explains that AI analysis narrows options, but before final match both sides see and approve each other's photos. No match without mutual approval.
- **Fallback for unanswered questions**: When chat doesn't know an answer, user repeats a question, or argues — chat can say it's still developing and refer to "עזרו לנו להשתפר" feedback screen where human team responds
- **Privacy note**: Chat explains conversations are AI-only, but feedback screen goes to human team
- **Pool entry requirements**: Fixed prompt to include conversation completion as a requirement (was missing — only mentioned profile details and photos)

#### 6. Bug Fix: Pipeline Filter Fields Not Showing
- Fields were fetched from DB in the query but not included in the response mapping object — all showed as "חסר"
- Fixed by adding all filter fields to the response builder

### Technical Notes
- `desired_location_range` (not `location_preference`) is the correct DB column name for location filter
- All 14 pool users are "User Experience Tester" type
- הינדי (#145) is a Couple Tester — was excluded from pool entry despite having a photo
- Prompt files loaded at startup via `fs.readFileSync` — changes require server restart (auto on deploy)

---

## Previous Session: 2026-06-28 (Admin Pipeline Improvements, Deleted Users, Bug Fixes)

### Deployment
- All changes pushed to main (production) and staging

### What We Did

#### 1. Pipeline Email & Message Fixes
- **Completed users email**: Fixed to use "מייל כניסה למאגר" template instead of welcome email
- **System message templates**: No-email users now get pre-filled messages (editable before saving):
  - New users: short welcome message
  - Completed/ready for pool: analysis done + pool entry
  - Couples: thank you + insights available
  - All gender-adaptive Hebrew

#### 2. Couples Stage Split
- Renamed "זוגות חדשים" → "זוגות לטיפול"
- Added "זוגות — לא דורשים טיפול" stage for handled couples
- Auto-return to active when couple has new activity (message/profile change) after being marked done
- New DB column: `couple_handled_at TIMESTAMPTZ`

#### 3. Pipeline Stage Reorder
- Moved "בתהליך (לא דורשים טיפול)" and "זוגות — לא דורשים טיפול" below "במאגר"
- Active stages on top, passive stages at bottom

#### 4. Deleted Users Tracking
- New `deleted_users` table: stores name, email, gender, age, city, type, dates, who deleted, chat count, pool/insights status
- Self-delete sends `?self=true` to distinguish from admin delete
- New admin tab "משתמשים שנמחקו" with full table view

#### 5. Email Status per User
- Each pipeline card shows all emails sent (subject + date/time)
- Shows "📵 לא מקבל/ת מיילים — הודעות מערכת" for no-email users
- Backend now returns full email history (not just latest)

#### 6. Admin User Detail — Hebrew Profile Fields
- Replaced English Registration/Preferences sections with Hebrew:
  - פרטים אישיים: שם, מין, גיל, מיקום, מצב משפחתי, ילדים, דת, עישון, גובה, מחפש/ת
  - העדפות: טווח גילאים, טווח מיקומים
  - הגדרות: אימייל, סטטוס מיילים, וואטסאפ + מספר, הסכמה לניתוח חיצוני

#### 7. Admin Photos Gallery Fixes
- Fixed photos not showing (API returns `{photos: [...]}`, not array)
- Download names: `userName-picture1.jpg` instead of random hash
- AI consent indicator next to photos title (✓/✗)

#### 8. Red Highlight Fix ("פעילות חדשה")
- Was comparing against `last_email_sent` (false positives for users without emails)
- Now uses `admin_processing_done_at` / `couple_handled_at` timestamps
- New DB column: `admin_processing_done_at TIMESTAMPTZ`

#### 9. Admin Page View Tracking Fix
- Admin preview of user screen was still registering as user page view
- Added `adminViewing` prop through App → NewChat → Insights
- All `trackPage` calls now guarded

#### 10. Admin Notes
- `admin_notes` text field per user (admin-only, users can't see)
- Inline edit with save/cancel on every pipeline card
- New DB column: `admin_notes TEXT`

#### 11. Manual Move to Completed
- "↑ העבר להשלימו" button on "בתהליך" users
- Sets `admin_force_completed` flag (bypasses chat completion check)
- New DB column: `admin_force_completed BOOLEAN`

#### 12. Ready for Pool — Photo Status
- Shows "📷 N תמונות" (green) or "📷 ללא תמונה" (red)
- External analysis checkbox only shown for users with photos

### New DB Columns
- `couple_handled_at` TIMESTAMPTZ
- `admin_processing_done_at` TIMESTAMPTZ
- `admin_notes` TEXT
- `admin_force_completed` BOOLEAN
- New table: `deleted_users`

#### 13. Completed Stage Split
- Split "השלימו את התהליך" into two stages:
  - **"השלימו את כל התהליך"** (`completed_all`): general + cognitive + taste all closed → full treatment (analysis, insights, pool email, mark_done)
  - **"כמעט השלימו (חסרים ערוצים)"** (`completed_partial`): only general chat closed → analysis + insights, NO pool email, reminder button instead
- Each completed card shows channel status: ✓/✗ כללי, ✓/✗ קוגניטיבי, ✓/✗ טעם

#### 14. User Management Agent — First Pipeline Run (Production)
- Built and tested agent pipeline run on production
- Agent reads all users from API, classifies by stage, takes actions
- Performed on production:
  - **יאנה #163**: verified insights quality (good), sent pool entry email, mark_done + checklist
  - **Netanela #153**: mark_done (per admin note — almost completed, move to pool path)
  - **חן #150**: wrote full personality insights (read all 110 messages), mark_done + checklist
- Insights written by Claude directly (not GPT API) — deep analysis, no conversation quoting
- Created `Docs/User Management Agent.md` — full agent specification

#### 15. Reminder Email Template
- New `buildReminderEmail` for completed_partial users — subject "תזכורת ממערכת One"
- Encourages completing remaining channels (cognitive/taste)
- Distinct from welcome and pool emails so admin can track which was sent

#### 16. External Analysis (Visual) — Agent Capability (In Progress)
- Agent can view user photos and score look traits (appeal, warmth, femininity, glamour, naturalness, fitness, style, skin tone, hair/eye details)
- Tested on 9 example users with consistent scoring
- Started production run on 15 ready_pool users with photos — viewed 7/15 before hitting context image limit
- **No scores were saved** — viewing only, scores to be entered in next session
- Remaining: ליה #169, טל #168, מורן #167, סתיו #165, הילה #161, לינוי #155, אביב #154, חן #150

### Next Session TODO
- Complete external analysis for all 15 ready_pool users (view photos + enter scores)
- Enter pool for users with completed external analysis
- Send pool entry emails

### New Files
- `Docs/User Management Agent.md` — agent spec with pipeline run, daily tasks, scheduling, advanced features

### Known Limitations
- Users marked as `admin_processing_done` before this session won't have `admin_processing_done_at` set (no red highlight until re-marked)
- Same for `couple_handled_at` on previously handled couples
- 4 users (תומר #173, סיון #166, אלמוג #164, פלג #158) stuck in "completed_partial" despite admin notes to move them back — requires manual intervention or `admin_force_not_completed` flag (not yet built)
- Staging has no RESEND_API_KEY — cannot test email sending there

---

## Previous Session: 2026-06-23–24 (Admin Pipeline Dashboard, Prompt Safety, Bug Fixes)

### Deployment
- All changes pushed to main (production) and staging

### What We Did

#### 1. Admin Pipeline Dashboard (replaces user_mgmt tab)
- New component `AdminPipeline.tsx` with 6 pipeline stages:
  1. **חדשים** — new users, send welcome email or message, mark as contacted
  2. **זוגות חדשים** — couple testers, couple-specific email, partner-in-system toggle
  3. **בתהליך** — contacted users still in chat, monitoring only
  4. **השלימו** — completed chat, sub-categorized (photo+details/photo/details/chat only), reanalyze + AI insights generation + checklist (analysis/insights/email) + mark done
  5. **מוכנים למאגר** — admin done, external analysis checklist, enter pool button, red highlight on new activity
  6. **במאגר** — in matching pool, red highlight on new activity
- Summary stats bar with counts per stage
- Click user name → opens UserDetail in Users tab
- New DB columns: `admin_contacted`, `admin_processing_done`, `admin_checklist` (JSONB), `partner_in_system`
- New backend routes: `POST /admin/users/:id/pipeline-action`, `POST /admin/users/:id/update-checklist`

#### 2. AI Insights Generation
- `POST /admin/users/:id/generate-insights` — builds prompt from ALL full conversations + trait scores
- Sends to GPT-4o, returns `summary_short` (2-3 sentences for insights header) + `summary_full` (6-10 paragraphs, detailed analysis)
- Saves to `personal_insights_short` and `personal_insights_full` in users table
- Prompt instructs: Hebrew, second person, professional-warm tone, covers personality, communication style, relationship needs, ideal match type

#### 3. Auto System Messages
- Couple testers with ≥1 chat message: auto-display thank you message + partner status + chat completion reminder
- Users with `email_updates=false` (and no WhatsApp): auto-display message about checking the app for updates
- Manual `admin_message` always takes priority over auto messages
- WhatsApp-approved users skip the no-email message

#### 4. Email Templates in Pipeline
- 3 templates: welcome (ברוכ/ה הבאה), pool entry (ניתוח הושלם), couples (תודה על השתתפות)
- All gender-adaptive Hebrew
- For no-email users: message composer (sets admin_message) instead of email button

#### 5. Critical Prompt Safety Fixes (triggered by user incident)
- **Problem**: Taste test chat told a user the profiles are "not real people" and referred him to Tinder/Bumble
- **Fix**: All prompts (taste-test, cognitive, general chat templates A/B/C/D/E, context-system-info, context-profile) now include:
  - System identity: One (joinone.io), MVP status, social media (Facebook + Instagram)
  - **Strict prohibitions**: never refer to other apps, never say user can't find someone here, never say profiles are fake/fictional, never say "I'm just a chatbot"
  - Taste test prompt fully rewritten: explains profiles as diagnostic tool, not "fake people"
- Added `SYSTEM_IDENTITY` constant in `promptTemplates.ts` shared across all templates

#### 6. Bug Fixes
- **Profile save**: PATCH `/users/:id` was missing `marital_status`, `has_children`, `religion`, `smoker` — users could edit but changes weren't saved
- **Admin page view tracking**: admin "צפייה במסך המשתמש" was registering as user page view — added `adminViewingUser` flag to prevent tracking
- **last_activity calculation**: was using `updated_at` which changes on admin actions — now uses only user messages + page views
- **WhatsApp status in admin**: shows "✓ אישר/ה וואטסאפ" next to "לא אישר/ה מיילים" when relevant

#### 7. Admin UI Improvements
- **Feedback badge**: red badge on "משוב ודיווחים" tab showing count of new reports since last visit (localStorage-based)
- **Photo gallery in UserDetail**: expandable thumbnail gallery near external traits, lightbox view, download all button
- **MVP disclaimer**: updated to "הצ׳אט עדיין נמצא בשיפור, ולכן ייתכנו ניסוחים פחות מדויקים או טעויות נקודתיות"

### Known Limitations
- Staging has no photos (separate Railway Volume from production)
- WhatsApp sending not implemented (fields exist, no API integration yet)
- Email sending requires RESEND_API_KEY (may not be set in staging)

---

## Previous Session: 2026-06-15–20 (Email, Analytics, OTP Login, UI Refresh)

### Deployment
- All changes pushed to main (production) and staging
- RESEND_API_KEY added to Railway variables (both environments)
- seedAdditionalTraits.ts run on production DB (Enneagram + Attachment + Gender Conformity)

### What We Did

#### 1. Email Sending via Resend
- Installed `resend` package, initialized from `RESEND_API_KEY` env var
- `POST /admin/users/:id/send-email` — send HTML email to specific user
- `POST /admin/send-email` — send to any address (free-form)
- Admin user detail: "Send Email" button with HTML editor + preview
- Admin "Send Email" tab: standalone composer with to/subject/HTML/preview + sent log
- Domain `joinone.io` verified in Resend

#### 2. Page View Analytics
- `page_views` table: user_id, page, viewed_at
- `POST /track-page` endpoint (fire-and-forget from frontend)
- Frontend tracks view changes (App.tsx) + screen changes (NewChat.tsx) + insight sub-views (Insights.tsx)
- Admin screens excluded from tracking
- Admin user detail: "Page Views" collapsible section with summary + recent visits
- Admin "Analytics" tab: pages table (views + unique users) + daily activity (30 days)
- Click any page row to expand and see who visited + when
- Registration date (created_at) shown as badge in user detail header

#### 3. OTP Email Login (code-based, no redirect)
- `otp_codes` table: email, code, expires_at, used
- `POST /auth/send-otp` — generates 6-digit code, sends styled email via Resend
- `POST /auth/verify-otp` — verifies code, finds/creates user, returns session
- AuthScreen: OTP replaces magic link for in-app browsers (Instagram/Facebook)
- 6 separate digit inputs with auto-advance, paste support, auto-submit on 6th digit
- "שליחה מחדש" and "שינוי אימייל" buttons
- Context-aware auth screen:
  - **In-app browser**: OTP email primary button, Google OAuth secondary (small gray)
  - **Regular browser**: Google OAuth primary, magic link secondary (unchanged)

#### 4. UI Refresh
- Landing page: full background image (background.png) instead of cover+gradient
- Tagline changed to "Meet as you are"
- Sidebar: light purple (#f4f2f8) instead of cream
- Buttons/cards/bubbles: white instead of cream (#FCF8F5)
- Active items: light gray (#f5f5f7) instead of soft purple (#f5f0fb)
- Darker text on landing page for readability

#### 5. Capacitor Native App (continued from previous session)
- Upgraded @capacitor/cli to v8, switched Node to 22.14.0
- `cap init` + `cap add android` — Android platform ready
- platform.ts, OAuth via system browser, deep link listener
- NOT YET TESTED on device — next steps in previous session's notes

#### 6. Production DB: New Trait Definitions
- Ran `seedAdditionalTraits.ts` on production — added 13 traits:
  - 9 Enneagram types
  - 3 Attachment styles (secure, anxious, avoidant)
  - 1 Gender conformity
- Users need re-analysis to populate new trait scores

---

## Previous Session: 2026-06-15 (Capacitor Native App Setup)

### What We Did

#### Capacitor Initialization
- Upgraded `@capacitor/cli` from v6 to v8 (to match `@capacitor/core` v8)
- Switched Node to v22.14.0 (required by Capacitor CLI v8)
- Ran `npx cap init "One" "io.joinone.app" --web-dir dist`
- Installed `@capacitor/android` and ran `npx cap add android`
- Configured `capacitor.config.ts`: `androidScheme: 'https'`, `iosScheme: 'https'`, SplashScreen settings

#### Platform Detection & Native API Support
- Created `frontend/src/lib/platform.ts`:
  - `isNativeApp()` — detects Capacitor native shell
  - `getApiBaseUrl()` — returns `https://joinone.io` for native, `''` for web
  - `getOAuthRedirectUrl()` — returns appropriate redirect URL per platform
- Updated `api.ts` — `apiFetch()` now prefixes base URL for native (relative paths don't work in WebView)
- Updated `AuthCallback.tsx` — all `/auth/*` fetch calls use `getApiBaseUrl()`
- Updated `App.tsx` — `/auth/sync` and `/api/login` calls use `getApiBaseUrl()`

#### Native OAuth Flow
- `AuthScreen.tsx`:
  - OAuth opens via `@capacitor/browser` (system browser) on native instead of `window.location.href`
  - Landing page and PWA install screens skipped when `isNativeApp()`
- `App.tsx`:
  - Added `appUrlOpen` deep link listener (via `@capacitor/app`) to catch OAuth callback
  - `shouldShowPWAInstall()` returns `false` for native

#### Android Configuration
- `AndroidManifest.xml`: Added intent-filter for `https://joinone.io/auth/callback` deep link with `autoVerify="true"`

### Build Status
- Frontend builds successfully, `npx cap sync android` completed
- Android project at `frontend/android/`

### Next Steps (To Resume Later)
1. **Android Studio** — `npx cap open android` → test on emulator/real device
2. **App icons** — Generate platform-specific sizes from logo, replace defaults in `android/app/src/main/res/mipmap-*`
3. **Supabase Dashboard** — Add `https://joinone.io/auth/callback?source=capacitor` to allowed redirect URLs
4. **assetlinks.json** — Upload to `joinone.io/.well-known/assetlinks.json` for Android deep link verification (needs SHA-256 fingerprint from signing key)
5. **Signing key** — Generate release keystore for Google Play
6. **iOS** — `npx cap add ios` (requires macOS for build/test)
7. **Status bar** — Configure `@capacitor/status-bar` styling (color, overlay)
8. **Splash screen** — Design and add splash screen assets
9. **Test full flow** — Auth → chat → sidebar → insights on native
10. **Google Play** — Build signed APK/AAB, upload to Play Console (plan already documented)

---

## Previous Session: 2026-06-12–15 (UI Redesign + Branding + Landing Page + In-App Browser + Dark Mode Tracking)

### Deployment
- All changes pushed to both main (production) and staging

### What We Did

#### 1. New Branding — Logo & Icons
- **New logos**: roundLogo (round heart), nameLogoTrans (name logo with transparency) — replaced old heartIcon everywhere
- **Custom-designed icons** replace all emoji icons (sidebar, chat buttons, Q&A bubbles, insight cards)
- **All icons are transparent (RGBA)** — verified with color type byte check
- **PWA app icon**: replaced with logoRound (icon-192/512), apple-touch-icon updated
- **manifest.json**: theme_color updated to lilac (`#8b7ba8`)

#### 2. Color Palette Updates
- **Completed channel badges**: green → lilac (`#8b7ba8`)
- **User chat bubble**: indigo → lilac (`#8b7ba8`)
- **Recommendation/system message backgrounds**: blue-tinted → soft purple (`#f5f0fb`)
- **Dashboard card ("מה למדנו עליך")**: background → cream (`#FCF8F5`)
- **Header**: shows nameLogoTrans instead of "One" text
- **Recommendation border**: indigo → lilac (`#8b7ba8`)

#### 3. Landing Page (Pre-Auth)
- **New welcome screen** with cover image (black & white couple on beach)
- Cover image fades via gradient into warm gray background (`#e8e4e0 → #f7f5f3 → #fff`)
- Logo + "ברוכים הבאים ל-One" + 6 numbered onboarding steps with lilac badges
- Onboarding text matches exact copy from instructions file
- "בהצלחה, צוות One" + CTA button
- Tagline: "One who truly fits"
- **Auth loop fix**: sessionStorage tracks seen_landing and seen_pwa to prevent loops after Google OAuth redirect

#### 4. Screen Redesigns
- **ProfileSetup**: logo at top, card sections with lilac borders/shadows, lilac checkboxes, notifications section with lavender background
- **ConsentScreen**: logo at top, card layout with lilac borders, lilac links/checkboxes
- **PWAInstallFlow**: redesigned for all scenarios:
  - **In-app browser** (Instagram/Facebook): dark card with "Open in external browser" instructions
  - **Samsung Internet**: step-by-step install instructions (☰ → Add page to → Home screen) with numbered lilac badges
  - **iOS Safari**: share → Add to Home Screen instructions
  - **Chrome Android**: native install button with retry timer (500ms/1.5s/3s)
  - Skip button is subtle text link to encourage installation
  - PWA install shown before auth for all mobile users
- **Auth screen**: padding fix for logo clipping, in-app browser tip at bottom

#### 5. In-App Browser Handling
- Detection: `FBAN|FBAV|Instagram|LinkedInApp|Line` in user agent
- Auth screen shows tip: "לחצו על ⋯ → Open in external browser"
- Unified instructions for iOS/Android in Instagram

#### 6. Dark Mode
- Explored dark mode icon wrapping (cream circles in dark, transparent in light) — **removed** because the app doesn't have full dark mode support yet
- **Dark mode tracking added**: `dark_mode` boolean column in users table, sent via `getDeviceInfo()` on auth/sync, visible in admin with 🌙 badge

#### 7. Text Changes
- "מה ה-AI למד עליך?" → "מה למדנו עליך" (insight drip feed title)
- Tagline: "Find your one perfect match" → "One who truly fits"
- PWA subtitle: custom text about adding to home screen before app stores

### Files Modified
- `frontend/src/NewChat.tsx` — icons, colors, drip feed title, dashboard card bg
- `frontend/src/AuthScreen.tsx` — landing page, logos, in-app browser, tagline, auth loop fix
- `frontend/src/PWAInstallFlow.tsx` — redesigned install screens, in-app browser detection, Samsung instructions
- `frontend/src/ProfileSetup.tsx` — card layout, lilac accents
- `frontend/src/ConsentScreen.tsx` — logo, card layout, lilac accents
- `frontend/src/App.tsx` — dark_mode in getDeviceInfo
- `frontend/src/AdminView.tsx` — dark mode 🌙 badge
- `frontend/index.html` — apple-touch-icon updated
- `frontend/public/manifest.json` — theme_color updated
- `backend/src/index.ts` — dark_mode stored on auth/sync
- `backend/src/schema.pg.ts` — dark_mode column migration

### Files Created
- `frontend/public/icons/` — 17 custom transparent (RGBA) icons
- `frontend/public/icons/sidebar/` — cream-background icon versions
- `frontend/public/roundLogo.png`, `nameLogoTrans.png`, `coverMainScreen.png`
- `frontend/public/logoRound.png`, `icon-192.png`, `icon-512.png` (PWA icons)

### DB Changes
- `users.dark_mode BOOLEAN DEFAULT FALSE` — tracks user's dark mode preference

### Key Decisions
- Dark mode icon wrapping removed — needs full app dark mode support first
- Landing/PWA screens use sessionStorage to prevent auth redirect loops
- PWA install shown before auth (not after) for all mobile users
- Samsung Internet gets manual install instructions (no beforeinstallprompt support)
- All icons truly transparent (RGBA verified) — no cream/white background baked in

### Next Up: Capacitor Native App
- Plan ready for wrapping the web app with Capacitor for Android + iOS
- Capacitor dependencies installed (`@capacitor/core`, `@capacitor/cli`, `@capacitor/app`, `@capacitor/browser`, etc.)
- Still need: `npx cap init`, platform setup, OAuth deep links, API base URL for native, CORS, Supabase redirect URL config
- iOS builds require macOS — Android can be done on Windows
- Continue in a new session

---

## Session: 2026-06-10 (Enneagram + Attachment + Personal Insights + Bug Fixes)

### Deployment
- All changes pushed to both main (production) and staging

### What We Did

#### 1. New Analysis Traits — Enneagram, Attachment, Gender Conformity
- **9 Enneagram types** added to MBTI prompt with detailed per-type instructions (signals, non-signals, score ranges)
- **3 attachment styles** (secure/anxious/avoidant) added to emotional profile prompt
- **Gender conformity** trait added to personal style prompt (gender-specific scoring criteria)
- Seed script `seedAdditionalTraits.ts` created and run on both DBs — 13 new trait_definitions
- Analysis agent updated: "Enneagram" group runs with MBTI prompt group
- `safeOutputLayer.ts`: Enneagram type+wing computation, attachment compound labels (e.g., "בטוח-חרדתי")

#### 2. Matching Algorithm Updates
- New `enneagram` category (weight 0.5) with `score_enneagram` column in candidate_matches
- Attachment styles added to `emotionality` category
- Gender conformity added to `vibe` category
- matchStage1: simplified filter logic

#### 3. Personal Insights (Admin-Written)
- 3 new DB columns: `personal_insights_short`, `personal_insights_full`, `analysis_completed`
- **Admin**: PersonalInsightsEditor for all users — short text, full text, "ניתוח הושלם" toggle
- **Insights screen**: "ניתוח עוד לא הושלם" yellow notice when incomplete, short summary at top, full text as expandable card with dedicated detail view
- **Home drip feed**: small gray notice when analysis not completed (inside card, not standalone banner)
- **qa_about_me chat**: full personal insights injected as expert analysis context
- **API**: GET /users/:id/personal-insights endpoint

#### 4. Insights Screen Enhancements
- Enneagram detail screen: type + wing display, top 5 types with score bars
- Attachment detail screen: dominant style, compound labels, all styles with scores
- Admin: Enneagram type, attachment style, gender conformity in user profile
- Drip feed expanded from 3 to 5 rotations (includes enneagram + attachment)
- "← לתובנות נוספות" link at bottom of each detail view

#### 5. Taste Test Fixes
- **Follow-up questions strengthened**: mandatory for short responses (סבבה, אחלה, לא), skip only if 3+ detailed sentences
- **Gender question offset**: when looking_for_gender unknown, first message is gender question — all phase thresholds shift by 1
- **Deal-breaker questions**: 2 new questions before profiles (lifestyle + life stage), profileStartMsg raised to 5
- **hasPriorTasteInfo disabled**: all users get full question flow

#### 6. Post-Close Bubbles Fix
- **Root cause**: taste_closed used `tasteCount >= 6` which triggered after deal-breaker questions (before any profiles)
- **Fix**: cognitive_closing_stage and taste_closing_stage now persisted to DB (in topic_injection_counts) when chatManager returns closingStage=3
- Status endpoint reads saved closing states instead of message count thresholds
- has_taste_info and has_cognitive aligned with saved closing states
- Legacy fallbacks: cognitiveCount>=7 for cognitive, tasteCount>=25 for taste (pre-fix users)
- Fixed TS build error: hasTasteInfo moved after convState declaration

#### 7. Bug Fixes from Testing
- **Logo**: borderRadius "50%" → 6px (was circle in square, now rounded square)
- **JS Error on iPhone**: global error catcher now dev-only (localhost), "Script error." suppressed everywhere (cross-origin Supabase SDK)
- **Device dedup in admin**: dedup by device+pwa (was including date, causing duplicates per day), first_seen/last_seen tracking
- **iOS keyboard**: visualViewport resize listener scrolls input into view when keyboard opens
- **"חזרה למסך הראשי"**: small gray button below chat input area

#### 8. HowItWorks Page
- Added step 6: "ומה קורה אם החיבור לא הצליח?" with re-matching explanation
- Step 5: expanded text about no compromise on mediocre matches

### Files Modified
- `backend/src/agents/analysis/agent.ts` — Enneagram group mapping
- `backend/src/agents/analysis/prompts/mbti-system.txt` — 9 Enneagram types + instructions
- `backend/src/agents/analysis/prompts/emotional-profile-system.txt` — 3 attachment styles
- `backend/src/agents/analysis/prompts/personal-style-system.txt` — gender_conformity trait
- `backend/src/agents/conversation/chatManager.ts` — taste test fixes, personal insights context
- `backend/src/index.ts` — personal-insights API, closing state persistence, PATCH fields, status fixes
- `backend/src/matchStage1.ts` — filter simplification
- `backend/src/matchStage2.ts` — enneagram category, attachment/gender_conformity in categories
- `backend/src/safeOutputLayer.ts` — enneagram/attachment computation
- `backend/src/schema.pg.ts` — score_enneagram, personal_insights columns
- `frontend/src/AdminView.tsx` — PersonalInsightsEditor, enneagram/attachment display, device dedup
- `frontend/src/AuthScreen.tsx` — logo borderRadius fix
- `frontend/src/Insights.tsx` — enneagram/attachment detail views, personal insights display
- `frontend/src/NewChat.tsx` — home button, iOS keyboard, drip feed notice, analysis status
- `frontend/index.html` — error catcher dev-only + Script error suppression

### Files Created
- `backend/src/seedAdditionalTraits.ts` — seed 13 new trait definitions

### DB Changes
- `candidate_matches.score_enneagram` — new column
- `users.personal_insights_short` — admin-written short text
- `users.personal_insights_full` — admin-written full text
- `users.analysis_completed` — boolean toggle
- `topic_injection_counts.cognitive_closing_stage` — persisted closing state
- `topic_injection_counts.taste_closing_stage` — persisted closing state

### Key Decisions
- Enneagram runs with MBTI prompt (same analysis call) to save tokens
- Attachment styles in emotionality category (affects matching), not separate category
- Personal insights: admin-written, not auto-generated — gives control over quality
- "ניתוח הושלם" is a toggle (reversible), not one-time
- Never deploy to production without explicit user instruction

#### 9. qa_about_me Chat — Calibration Questions Flow
- **Structured flow**: opinion → offer calibration questions → user accepts/declines → 3 questions → close
- **5 question banks** (3 questions each): MBTI (E/I, T/F, J/P), Enneagram (coping, fear, group role), Values/Schwartz (security vs openness, achievement vs universalism, tradition vs self-direction), Big Five (neuroticism, conscientiousness, openness), Attachment (distance, intensity, vulnerability)
- **Per-round state**: each topic discussion is a separate "round" — closing message resets state for next topic
- **Topic detection**: scans only current round's user messages (not entire history) to avoid cross-contamination
- **Strict prompt structure**: "מבנה ההודעה — חובה לעקוב בדיוק" with explicit allowed/forbidden lists per step
- **Auto-close**: after calibration questions or after 4 general messages
- **Closing message**: "מריץ את הניתוח מחדש בהתאם למידע החדש"

#### 10. QA Chat — max_tokens Fix
- QA channels (qa_system, qa_about_me, etc.) raised from 300 → 600 tokens
- Fixes long system explanations getting cut off mid-sentence

#### 11. Visual Matching Explanation
- Updated context-system-info.txt with detailed visual matching process
- AI photo analysis with consent, taste matching between sides, photo sharing on match

#### 12. Old Users Reset (Staging)
- Initialized user_chat_summaries for old users (Nadav, נטלי שבתאי, אנה) on staging
- Empty summary + conversation state allows them to start fresh new_chat flow
- Old interviewer/psychologist messages preserved for future analysis

---

## Previous Session: 2026-06-08–09 (Major UX Overhaul — Waiting State + Insights + Q&A Channels + Registration)

### Deployment
- All changes pushed to both main (production) and staging

### What We Did

#### 1. Enhanced Insights Screen (Insights.tsx — full rewrite)
- Replaced inline accordion with dedicated detail screens per section (MBTI, Values, Big Five)
- Main view shows summary cards with "הרחבה →" button
- MBTI detail: type description, alternate type detection (borderline dimensions), relationship meaning per type, compatibility chart (ideal/good/challenging types for all 16 MBTI types)
- Schwartz Values detail: strong values (>60) with score bars + relationship context, weak values (<40) with explanation
- Big Five detail: all 5 traits including neuroticism (renamed "רגישות רגשית" with respectful framing), high/mid/low levels, per-trait relationship context
- "לא דייקנו לדעתך?" disagree section opens qa_about_me chat channel
- New initialView prop — drip feed links open specific detail screen directly
- Sidebar "תובנות על עצמי" always resets to main view

#### 2. Separate Q&A Chat Channels (4 new channels)
- qa_about_me — "מה למדת עליי עד עכשיו?" (only shown after analysis runs)
- qa_system — "איך אתה מוצא לי התאמה מדויקת?"
- qa_general — "יש לי שאלה לגבי התהליך"
- qa_insights — "דיון על תובנות" (opened from Insights disagree bubble, routes to qa_about_me)
- All use qa_ prefix (excluded from personality analysis — buildAnalysisTranscript uses LIKE 'new_chat%')
- Each channel has separate history, loads on mount, shown in admin transcript tabs
- Fixed full-transcript endpoint to return qa_ channels with correct chat_type (was falling to "interviewer" default)

#### 3. Enriched AI Chat Context
- qa_about_me/qa_insights: receives both safe profile data AND conversation summary
- Detailed instructions for discussing insights: ask probing questions, suggest MBTI alternatives, reach conclusions together
- qa_system/qa_general: receives system context with explicit instruction to answer FROM provided info
- Strengthened profile prompt: AI shares MBTI/values/Big Five directly, never suggests external tests, calls neuroticism "רגישות רגשית"

#### 4. Post-Completion Dashboard (home screen, below existing all-done message)
- Progress Pulse: "האלגוריתם בעבודה" with scanned profiles count + pool size
- Insight Drip Feed: rotating card (MBTI → Values → Big Five) with "לקריאת הניתוח המלא" linking to specific detail screen
- Fine-Tuning Question: single pet compatibility question with chip buttons
- Feedback Footer: "מסך המשוב שלנו" as visible link
- Dashboard only shows when profile is complete; insight drip + fine-tuning show after all chats done
- Couples see insight drip feed too; couples skip "צעד אחרון" message

#### 5. Progress Bar
- Shows below welcome text after user starts chatting
- 4 step indicators: שיחת היכרות, סגנון חשיבה, ניתוח טעם, השלמת פרטים
- Visual: ✅ done / 🔵 active / ⚪ pending with labels
- Progress: 5% first messages → 15% mid-chat → 30% done per channel + 10% profile
- Green 100% badge when everything complete

#### 6. Home Screen Recommendations Redesign
- "המלצת המומחה" → "📊 איפה אנחנו עומדים?" with gender-adapted text (לחץ/לחצי)
- Clickable links to next step (not just text instructions)
- "בוא נמשיך" button shows green ✓ + "חזרה לשיחה" when chat closed
- Welcome text hides "how it works" paragraph after all chats complete
- Profile incomplete: differentiated messages for "only photo missing" vs "photo + details missing"

#### 7. Bubble Styling Split
- Step bubbles (start/continue, cognitive, taste): solid border, full size
- Q&A bubbles (system, question, about me): separated below with divider, smaller font (12px), normal border
- "מה למדת עליי" only shown after analysis_run_count > 0

#### 8. "How It Works" Page + Brand Language
- New sidebar screen "איך המערכת עובדת?" with full process + science explanation
- Brand language alignment: "פרופיל" → "מפה אישיותית"/"מאפיינים"/"תמונת מצב"
- Professional tone: מנגנוני ויסות, עיבוד מידע, הלימה
- MBTI as supplementary tool, Big Five + Schwartz as research-backed
- Algorithm trained on real couples data
- AI rules: no "פרופיל" word, gender-adapted language, algorithm secrecy policy

#### 9. System Prompt Overhaul (context-system-info.txt)
- Full rewrite aligned with Gemini suggestions + brand language
- Theories: Big Five, Schwartz, MBTI (supplement), cognitive profile, attachment, communication, cultural, conflict
- "When will I get a match": no compromise on mediocre matches, pool growth = faster, no specific timeline
- Match pool entry: requires completed profile details + photos in "הפרטים שלי"

#### 10. Profile Prompt Enhancement (context-profile.txt)
- AI shares MBTI type, Schwartz values, Big Five results proactively
- Never suggests external personality tests
- Neuroticism discussed as "רגישות רגשית" — framed as strength

#### 11. Photo Privacy Explanation
- Added explanation block below photo upload in ProfileEdit
- Three points: full privacy, targeted exposure only, mutual visual approval required

#### 12. Profile Completeness Fix
- has_profile_details now requires ALL fields: age, city, height, looking_for_gender, desired_age_min/max, desired_height_min/max, plus at least 1 photo (was only checking age + city + photo)

#### 13. Admin Enhancements
- test_user_type dropdown in user detail (switch between UX Tester / Couple Tester / none)
- Q&A channels visible in transcript tabs with colors
- Fixed full-transcript chat_type mapping for qa_ prefix

#### 14. Backend — New Endpoints
- GET /users/:id/matching-progress — dashboard data (pool size, scanned profiles)
- GET /users/:id/detailed-traits — full trait data for Insights (all scores, MBTI dimensions, alternate type)
- POST /users/:id/fine-tune-answer — save fine-tuning question answer
- Status endpoint now returns analysis_run_count and gender

#### 15. User Copy Script
- Created backend/copy-user-to-staging.js — copies user + all related data from production to staging
- Usage: node copy-user-to-staging.js <user_id_or_name>
- Copies: users, conversation_messages, user_chat_summaries, user_traits, user_look_traits, user_photos, analysis_runs, token_usage, bug_reports

### Files Modified
- `frontend/src/NewChat.tsx` — Progress bar, recommendations, bubbles, dashboard, channels, welcome text
- `frontend/src/Insights.tsx` — Full rewrite with detail screens
- `frontend/src/ProfileEdit.tsx` — Photo privacy explanation
- `frontend/src/AdminView.tsx` — Q&A transcript tabs, test_user_type dropdown
- `backend/src/index.ts` — New endpoints, profile completeness, transcript fix, status fields
- `backend/src/safeOutputLayer.ts` — getDetailedUserProfile, neuroticism addition
- `backend/src/agents/conversation/chatManager.ts` — Q&A channel routing, enriched context
- `backend/src/agents/conversation/prompts/context-profile.txt` — Enhanced instructions
- `backend/src/agents/conversation/prompts/context-system-info.txt` — Full rewrite with brand language

### Files Created
- `backend/copy-user-to-staging.js` — User data copy script

### New DB Fields Used (via status endpoint)
- analysis_run_count (existing column, now exposed)
- gender (existing column, now in status response)

#### 16. Profile Completeness Fix
- `has_profile_details` now requires ALL fields: age, city, height, looking_for_gender, desired_age_min/max, desired_height_min/max + photo (was only age + city + photo)

#### 17. Automatic Retry on Chat Messages
- If message send fails (network/deploy), retries up to 2 more times with 3s delay
- Error shown only after all retries exhausted — transparent to user

#### 18. Sidebar Reorder
- "איך המערכת עובדת?" moved to third position (after מסך ראשי and חזרה לשיחה)

#### 19. Q&A Prompt Strengthening
- qa_general/qa_system: explicit instruction to answer FROM provided context
- Specific reinforcement for wait-time questions (no mediocre matches, pool growth, no timeline)

#### 20. Major Improvement to qa_about_me Chat Quality
- Replaced `getSafeUserProfile` (only >60 scores) with `formatRichProfileForChat` (all scores)
- AI now receives: all Big Five (5 traits incl. neuroticism), all Schwartz values (11), MBTI dimensions with descriptive labels, safe positive traits (>65)
- Pulls 15 recent user messages as citable conversation excerpts
- AI instructed to never show numbers — translate to descriptive language ("גבוה מאוד", "מאוזן", "נמוך יחסית")
- Separate instructions: "מה למדת עליי" allows elaboration; "disagree" flow is shorter and focused
- New `SAFE_POSITIVE_TRAITS` list: curated traits safe to share when high (e.g., emotional intelligence, warmth, self-awareness)
- New helper functions: `scoreToLevel()`, `mbtiDimensionDescription()`

#### 21. Removed After Testing
- **Progress bar** — removed entirely (step indicators + percentage)
- **Dashboard progress pulse** — removed (scanned profiles count)
- **Fine-tuning question** — removed (pet compatibility chips)
- These features were built, tested, and intentionally removed based on UX feedback

#### 22. Post-Completion UI Polish
- All bubbles shrink to small size (11px font) when all chats are complete
- 🎉 celebration emoji added to "כל השלבים הושלמו בהצלחה!"
- Q&A bubbles separated below step bubbles with divider line

#### 23. User Data Copy Script
- Created `backend/copy-user-to-staging.js` for copying users between environments
- Successfully used to copy הינדי (#145) from production to staging for testing

### Key Design Decisions
- Q&A channels use qa_ prefix (not new_chat_) to exclude from personality analysis
- Disagree from Insights routes to qa_about_me (shared channel, not separate qa_insights)
- Brand language: "מפה אישיותית" not "פרופיל", professional but warm tone
- Neuroticism renamed "רגישות רגשית" with positive framing throughout
- Progress bar, dashboard pulse, and fine-tuning removed after testing — didn't add enough value
- AI gets full scores internally but never exposes numbers to user — descriptive language only

#### 24. Registration & Consent Improvements
- ProfileSetup: email notification checkbox (default on) + WhatsApp/SMS checkbox with phone input
- ConsentScreen: replaced generic consent with "קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות" with links to /terms and /privacy
- Settings: added terms + privacy links at bottom

#### 25. Sensitive Personal Details (ProfileEdit)
- New compact section: marital status (single/divorced/married), children (yes/no), religion (jewish/muslim/christian/other), smoking
- 2×2 grid layout with small selects
- 4 new DB columns: marital_status, has_children, religion, smoker

#### 26. Profile Privacy Notes
- "עליי" section: "הפרטים שלך לא חשופים למשתמשים אחרים..."
- "מה אני מחפש/ת" section: "הנתונים לא יופיעו בשום מקום..."

#### 27. Device Tracking — All Devices
- New DB column: devices_seen (JSONB array) accumulates all unique device+pwa combinations
- Admin table shows all devices per user (not just last)
- PWA install detection via standalone mode in devices_seen

#### 28. Home Screen Polish
- Removed input area from home screen, replaced with MVP feedback text at bottom
- "להסבר המלא על המערכת והתהליך ←" link below welcome text
- Recommendation links: underline only (no blue color)
- Menu button: background + purple badge dot for visibility
- Bubbles shrink further after all chats complete (10px font)
- 🎉 celebration emoji on completion message
- HowItWorks page: updated process text with chat breakdown, photo privacy details, match celebration

### Known Issues / Next Steps
- **Future insight types**: Enneagram + attachment style (second analysis run)
- **Fine-tuning questions**: design decision pending — static bank vs dynamic based on missing data

---

## Previous Session: 2026-06-07 (iOS Fixes + Device Tracking + UI Updates)

### Deployment
- All changes pushed to both main (production) and staging

### What We Did

#### 1. iOS Standalone (PWA) Safe-Area Fix
- Added `safe-area-inset-top` padding to main container, sidebar, auth screens, consent screen
- iOS PWA was cutting off the top (header/menu inaccessible) — now respects notch/status bar
- Sidebar mobile: positioned below safe area

#### 2. iOS Standalone Keyboard Fix
- Problem: when tapping input, entire screen jumped up hiding the chat
- Tried multiple JS approaches (visualViewport resize, scrollTo lock, transform offset) — all caused worse issues
- Solution: CSS-only `position: sticky` on input area for iOS standalone mode — works cleanly

#### 3. Desktop Layout — Wider Sub-Screens
- ProfileEdit: maxWidth 520 → 720px
- Insights: maxWidth 600 → 720px
- Settings: 400 → 560px (desktop only via CSS class)
- Feedback: 500 → 560px (desktop only)
- ConsentScreen: 400 → 560px
- ProfileSetup: 600 → 680px
- Mobile unchanged — CSS classes only activate above 769px

#### 4. Device Tracking (Admin)
- New DB columns: `last_device` (TEXT), `pwa_installed` (BOOLEAN)
- Frontend sends device info (iphone/android/desktop + standalone detection) on every auth sync
- Admin table shows new "Device" column: 🍎 iphone / 🤖 android / 🖥️ desktop + "(PWA)" badge
- Updates on every login — always shows last device used

#### 5. Home Screen Text Updates
- Welcome text: new copy explaining the One process (AI chat → one precise match)
- Removed old MVP disclaimer with bug report link
- All-done message (non-couples): explains system is analyzing + MVP stage + quality over speed
- Couples keep their existing all-done message

#### 6. Google OAuth on Safari — Enabled
- Removed Safari/iOS hiding of Google OAuth button — now shown to all browsers
- Tested and confirmed working on iPhone Safari

### Files Modified
- `frontend/src/NewChat.tsx` — Safe-area, keyboard fix, desktop widths, welcome text, all-done message
- `frontend/src/AuthScreen.tsx` — Safe-area padding, removed Safari OAuth hiding
- `frontend/src/ConsentScreen.tsx` — Safe-area + wider maxWidth
- `frontend/src/ProfileSetup.tsx` — Wider maxWidth
- `frontend/src/ProfileEdit.tsx` — Wider maxWidth
- `frontend/src/Insights.tsx` — Wider maxWidth
- `frontend/src/App.tsx` — getDeviceInfo() helper, send in auth sync
- `frontend/src/AuthCallback.tsx` — Send device info in auth sync
- `frontend/src/AdminView.tsx` — Device column in user table
- `backend/src/index.ts` — auth/sync accepts device/pwa_installed, saves to DB
- `backend/src/schema.pg.ts` — last_device + pwa_installed columns

### DB Columns Added (users table)
- `last_device TEXT` — iphone / android / desktop
- `pwa_installed BOOLEAN DEFAULT FALSE`

---

## Previous Session: 2026-06-03 (Google Play + Legal Pages)

### What We Did

#### 1. Privacy Policy & Terms of Service Pages
- Created `frontend/public/privacy.html` — full Hebrew privacy policy
- Created `frontend/public/terms.html` — full Hebrew terms of service
- Added backend routes (`/privacy`, `/terms`) before SPA catch-all — static HTML, no auth, crawlable
- Deployed to production: https://joinone.io/privacy, https://joinone.io/terms

#### 2. Google OAuth on Safari — Test & Revert
- Tried enabling Google OAuth on Safari for staging (hide only on production)
- Didn't work on Safari — reverted to original behavior (hidden on all Safari/iOS)

#### 3. Google Play Publishing — Plan Created (On Hold)
- User has verified Google Play Developer account
- Created detailed plan: `Docs/GOOGLE_PLAY_PLAN.md`
- Approach: TWA (Trusted Web Activity) wrapping existing PWA via Bubblewrap
- Reason: Chrome's WebAPK has old targetSdkVersion causing security warnings on Android 14+
- Path: AAB build → assetlinks.json → Closed testing (20 testers, 14 days) → Production release
- **On hold**: LambdaTest confirmed PWA install works clean on Galaxy S24 Ultra + S26 Ultra — the original warning was likely Play Protect caching on user's old device, not a real issue for new users
- Installed `@bubblewrap/cli` globally, created empty `twa/` folder — ready to resume when needed
- Google Play still valuable for discoverability + credibility even without the security warning issue

### Files Created
- `frontend/public/privacy.html` — Privacy policy page
- `frontend/public/terms.html` — Terms of service page
- `Docs/GOOGLE_PLAY_PLAN.md` — Google Play publishing plan

### Files Modified
- `backend/src/index.ts` — Added /privacy and /terms routes

---

## Previous Session: 2026-06-02 (MVP UI Overhaul)

### Deployment
- All changes tested on staging, then pushed to both main (production) and staging on 2026-06-02

### What We Did

#### 1. Mobile Safari Viewport Fix
- **Root cause**: `100vh` on Safari includes browser chrome (address bar + toolbar), causing chat to overflow
- Changed to `100dvh` + `position: fixed` on container
- Added `visualViewport` resize handler for virtual keyboard (scroll-into-view, not resize)
- `viewport-fit=cover` + `safe-area-inset-bottom` for notched iPhones
- `flexShrink: 0` on header/input to prevent layout collapse

#### 2. UI Polish — Sidebar Badges, Header, Typing, Transitions
- **Sidebar badges**: ✓ green checkmark on completed channels + "הפרטים שלי" when profile complete
- **Home screen badges**: green border + ✓ on completed suggestion buttons (cognitive, taste)
- **Header title**: shows current screen/channel name (שיחת היכרות / סגנון חשיבה / הגדרות / etc.)
- **Typing indicator**: animated bouncing dots instead of static "..."
- **Screen transitions**: fade-in + slide animation when switching screens

#### 3. Mobile Logout
- User avatar in header (mobile only) opens dropdown with "התנתק" button
- Click-outside overlay to dismiss dropdown

#### 4. Recommendation Logic Fixes
- Fixed: `closedChannels` now reads `cognitive_closed` and `taste_closed` from status API (not just `chat_closed`)
- Fixed: `chatClosed` implies `conversationAdvanced` — user who finished all topics gets cognitive recommendation even with low `summary_fields`
- Backend: `chat_closed` now true when `closing_stage >= 1` OR `topic_index >= 14`

#### 5. Merged ProfileEdit + ProfileView → Single "הפרטים שלי" Screen
- Combined photos + personal details + preferences into one screen with 👤 icon
- Removed "פרופיל" sidebar item and `ProfileView` component
- **Photos redesign**: grid 3×2 (104px tiles), tap-to-select with purple highlight, "הסרת תמונה" button overlay (no permanent X), upload "+" tile with "הוספה" text, photo counter (X/6)
- Cards with subtle `boxShadow` instead of borders, rounded corners (16px)
- Consent modal updated to match new design language

#### 6. "עזרו לנו להשתפר" — Feedback Screen (was "דווח על באג")
- Sidebar: ✨ icon, renamed to "עזרו לנו להשתפר"
- Category chips: 🐛 משהו לא עובד / 💡 רעיון / 💬 שיתוף כללי / ⚙️ בקשה מהמערכת
- Dynamic textarea placeholder per category
- Category prefix `[bug]`/`[idea]`/`[general]`/`[request]` in report_text
- **Admin**: tab renamed to "משוב ודיווחים", filter chips with counts, category badge per report

#### 7. ProfileSetup Improvements
- Added age + city fields (in one row) after name
- City autocomplete with datalist (same as ProfileEdit)
- Don't pre-fill name from OAuth/email — user enters their own name
- Default `desired_location_range` changed to `bit_further`
- Title: "נתוני פתיחה" with subtitle "כמה פרטים טכניים, כדי שהמערכת תדע לכוון לאנשים הרלוונטיים עבורך."

#### 8. Location Range Options Updated
- "העיר שלי בלבד" (`my_city`)
- "האזור שלי בלבד" (`my_area`)
- "האזור שלי + מרחק נסיעה סביר" (`bit_further`) — **new default**
- "כל הארץ" (`whole_country`)
- DB migration: `ALTER TABLE users ALTER COLUMN desired_location_range SET DEFAULT 'bit_further'`

#### 9. Settings Screen Fix
- Fixed missing `/api` prefix on 3 fetch calls (load, save, delete) — requests were going to Vite instead of backend

#### 10. Auth Screen Updates
- Tagline: "Find your one perfect match" (was "Find your perfect match")
- Heart logo bubble (22px, round) after tagline text

#### 11. Home Screen Disclaimer Updated
- New MVP text explaining system is in early version
- Clickable link "✨ עזרו לנו להשתפר" navigates to feedback screen

#### 12. Consent Screen Fix
- Fixed missing `/api` prefix on PATCH call — consent was failing silently

#### 13. City Hint Text
- Added "אם העיר שלך לא מופיעה — אפשר לבחור עיר קרובה" under city field in both ProfileSetup and ProfileEdit

### Files Modified
- `frontend/src/NewChat.tsx` — Viewport fix, badges, header, typing, transitions, mobile logout, merged screens, feedback redesign, settings fix, disclaimer
- `frontend/src/ProfileEdit.tsx` — Full rewrite: merged with ProfileView, new photo UI, card design, city hint
- `frontend/src/ProfileSetup.tsx` — Age/city fields, city autocomplete, no name pre-fill, new title, city hint
- `frontend/src/AuthScreen.tsx` — Logo + tagline update
- `frontend/src/AdminView.tsx` — Feedback tab with category filters and badges
- `frontend/src/ConsentScreen.tsx` — Fixed missing /api prefix
- `frontend/index.html` — Viewport meta tag (viewport-fit=cover)
- `backend/src/index.ts` — chat_closed logic, don't pre-fill name from OAuth, has_profile_details includes photos
- `backend/src/schema.pg.ts` — desired_location_range default migration

### Key Design Decisions
- Photos: tap-to-select pattern instead of always-visible delete button — cleaner look, prevents accidental deletions
- Feedback categories embedded as prefix in report_text — no DB schema change needed, parseable in admin
- `has_profile_details` now requires age + city + at least 1 photo
- Settings auto-save on toggle (no save button needed) — was already implemented, just broken by missing `/api` prefix

---

## Previous Session: 2026-06-01–02 (Staging Environment + Security + Consent + Matching Pool)

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
