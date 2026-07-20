# OTP Auth Fix — Full Technical Report (2026-07-20)

## For review by: Security hardening session (Claude session 2)

This report documents all changes made on 2026-07-20 to fix OTP login after the security hardening from 2026-07-19. The security session should review these changes for correctness, security implications, and potential regressions.

---

## Root Cause

The security hardening session (commits 89b7cbf, 1ea4f45) correctly added `requireAuth`/`requireUserAuth` middleware to all API routes. However, OTP login (`POST /auth/verify-otp`) was never designed to create a JWT — it returned user data only. After the security changes, OTP users could authenticate (verify their code) but then couldn't use any API endpoint because they had no JWT token.

**Affected users:** All OTP-authenticated users (דנית/207, הדר/244, טל/168, יוליה/245). Google OAuth users were unaffected because Supabase creates a JWT for them.

---

## Solution: Self-Signed JWT for OTP Users

### Approach chosen
After OTP code verification succeeds, the backend signs a JWT using `SUPABASE_JWT_SECRET` (HS256, 7-day expiry). This token is returned to the frontend alongside user data and used for all subsequent API calls.

### Why self-signed JWT (not Supabase session)?
First attempt used Supabase Admin API (`generate_link` + `verify`) to create a real Supabase session. This failed silently — the session wasn't created properly, OTP users got logged in without a valid token, and all API calls failed. Self-signed JWT is simpler and fully under our control.

### Why HS256 with SUPABASE_JWT_SECRET?
The existing `auth.ts` verification already supports HS256 via `SUPABASE_JWT_SECRET` as a fallback. By signing with the same secret, the self-signed tokens pass the same verification pipeline as Supabase-issued tokens. No new secret management needed.

---

## All Changes (Chronological)

### 1. Backend: `POST /auth/verify-otp` — JWT generation
**File:** `backend/src/index.ts`

After OTP code verification (existing logic unchanged), added:

```
1. Find or create app user by email (unchanged)
2. Ensure user has a supabase_uid:
   - If existing (e.g., from Google login): use it as-is
   - If none: generate "otp-{user.id}" and save to DB
3. Sign JWT: { sub: supabase_uid, email, role: "authenticated", aud: "authenticated" }
   - Secret: SUPABASE_JWT_SECRET
   - Algorithm: HS256
   - Expiry: 7 days
4. Return: { ...userData, access_token: jwt }
```

**Security considerations:**
- JWT sub uses the existing `supabase_uid` for users who previously logged in with Google. This ensures `requireUserAuth` (which does `WHERE supabase_uid = claims.sub`) finds the correct user.
- For new OTP-only users, `supabase_uid` is set to `"otp-{id}"` — a deterministic, non-guessable-but-not-random identifier. This is acceptable because the JWT itself is signed and tamper-proof.
- JWT expiry is 7 days (vs Supabase's default 1 hour). Trade-off: less frequent re-auth vs longer exposure window. Acceptable for this app's threat model.
- JWT signing is wrapped in try-catch — if it fails (e.g., missing secret), verify-otp still returns 200 with user data but no token. The user will be redirected to login by the frontend's session-expired mechanism.

**CRITICAL DEPENDENCY:** `SUPABASE_JWT_SECRET` must be set in Railway environment variables. Without it, JWT signing is silently skipped and OTP login appears to work but all subsequent API calls fail with 401.

### 2. Backend: `auth.ts` — HS256 verification support
**File:** `backend/src/auth.ts`

**Problem:** `getSigningKey()` tried JWKS first for all tokens. For self-signed HS256 tokens (no `kid` in header), `jwksClient.getSigningKey(undefined)` threw a synchronous exception instead of calling the error callback. The HS256 fallback to `SUPABASE_JWT_SECRET` was never reached.

**Fix:** Added `if (!header.kid)` guard before calling JWKS:
```javascript
if (!header.kid) {
  // Self-signed HS256 token — skip JWKS, use JWT secret directly
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) return resolve(secret);
  return reject(new Error("No kid in header and no JWT secret configured"));
}
// Otherwise: use JWKS as before
jwksClient.getSigningKey(header.kid, ...);
```

**Security note:** This does NOT weaken verification. Supabase-issued tokens (ES256 with kid) still go through JWKS. Self-signed tokens (HS256 without kid) are verified against the same shared secret. An attacker would need to know `SUPABASE_JWT_SECRET` to forge a token.

### 3. Frontend: `AuthScreen.tsx` — Save OTP tokens
**File:** `frontend/src/AuthScreen.tsx`

After verify-otp succeeds:
```javascript
if (data.access_token) {
  saveSupabaseTokens(data.access_token);
}
```

Saves the self-signed JWT to `localStorage` under `one_access_token`. No Supabase client session is created (OTP tokens are not Supabase tokens — `supabase.auth.setSession()` was tried and removed because it caused issues).

### 4. Frontend: `api.ts` — Token retrieval order
**File:** `frontend/src/lib/api.ts`

**Changed `getAccessToken()` strategy order:**
- **Before:** Supabase client first (2s timeout) → localStorage fallback
- **After:** localStorage first → Supabase client fallback

**Why:** For OTP users, the Supabase client has no session. Calling `supabase.auth.getSession()` is wasteful (2s timeout) and can trigger SIGNED_OUT events that interfere with the OTP session. localStorage is instant and works for both OTP and Google tokens (Google tokens are saved to localStorage during initAuth).

**Security note:** No change in security posture. The token source doesn't affect verification — the backend verifies the JWT regardless of where the frontend stored it.

### 5. Frontend: `api.ts` — Token refresh + session-expired
**File:** `frontend/src/lib/api.ts`

Added 401 handling to `apiFetch()`:
```
On 401 response:
  If token existed → try supabase.auth.refreshSession() → retry on success
  If refresh failed OR no token → fire "session-expired" event
```

**Deduplication:** `fireSessionExpired()` prevents multiple simultaneous events (common when 4-5 API calls fail at once during page load). Uses a 3-second cooldown.

**Important change:** session-expired fires on ANY 401 from apiFetch, not just when a token existed. This was needed because the legacy login path (matchme_user_email in localStorage) could set the user without a JWT, causing a state where the user appeared logged in but had no token. Without this fix, such users were permanently stuck.

**Why is this safe?** apiFetch is only called by logged-in components (NewChat, Insights, etc.). Login/OTP flows use raw `fetch()`. So a 401 from apiFetch always means a broken session, never a pre-auth request.

### 6. Frontend: `App.tsx` — Disabled Supabase SIGNED_OUT handler
**File:** `frontend/src/App.tsx`

**Before:** `onAuthStateChange` listened for `SIGNED_OUT` and redirected to auth screen.
**After:** Handler is empty (intentionally no-op).

**Why:** The Supabase client fires `SIGNED_OUT` because OTP users have no Supabase session. This caused an immediate logout loop after OTP login:
1. OTP login succeeds → token saved → view set to new_chat
2. Supabase client detects no session → fires SIGNED_OUT
3. Handler clears session → redirects to auth
4. User is kicked out immediately

**Logout is now handled by:**
- Explicit `handleLogout()` function (user clicks logout button)
- `session-expired` event from apiFetch (expired/missing JWT)

**Risk:** If a Google user's Supabase session is revoked server-side (e.g., admin deletes the auth user), the app won't immediately react. However, the next API call will return 401 → session-expired → redirect to login. The delay is minimal (seconds).

### 7. Frontend: `App.tsx` — ErrorBoundary
**File:** `frontend/src/App.tsx`

Added React error boundary class that catches render crashes:
- Shows friendly Hebrew error screen instead of white page
- Auto-reports crash to `/api/log-error` (with component stack)
- Buttons: "רענון העמוד", "חזרה למסך הראשי"
- mailto link to `one-support@googlegroups.com` for manual reporting
- Works without authentication (no JWT needed for display)

### 8. Frontend: `App.tsx` — Session-expired notice
**File:** `frontend/src/App.tsx`

When session-expired fires, sets `authNotice` state: "החיבור שלך פג תוקף. יש להתחבר מחדש."
Passed to AuthScreen and displayed as yellow banner above login form.

### 9. Frontend: `Insights.tsx` — Null safety
**File:** `frontend/src/Insights.tsx`

Three fixes:
- `profile.mbti.type` → `profile.mbti?.type` (lines 159, 187, 519)
- `profile.allValues.length` → `profile.allValues?.length` (line 159)
- `profile.allBigFive.length` → `profile.allBigFive?.length` (line 159)
- Check `r.ok` before parsing detailed-traits API response
- Validate `data.allValues` exists before setting profile state

**Why these crashed:** When API returns 401 (error JSON `{error: "..."}`), the response was stored as `profile`. Then `profile.allValues.length` crashed because `allValues` doesn't exist on the error object.

### 10. Backend: `report-bug` — Auth-independent
**File:** `backend/src/index.ts`

Changed from `requireAuth` to `optionalAuth`. Users can report bugs even when their auth is completely broken.

### 11. Backend: `error-logs` DELETE — Clear all option
**File:** `backend/src/index.ts`

Added `?all=true` parameter to delete all error logs (not just older than 30 days). Fixed SQL injection: changed string interpolation for interval to parameterized query.

### 12. Backend: `authLimiter` — Increased limit
**File:** `backend/src/index.ts`

Changed from 10 to 30 requests per 10 minutes per IP. 10 was too aggressive — normal testing with multiple OTP sends + verifies could exhaust the limit. Rate limiter now returns `"too_many_attempts"` error code.

### 13. Frontend: `AuthScreen.tsx` — Rate limit error display
**File:** `frontend/src/AuthScreen.tsx`

Both send-otp and verify-otp handlers now check for `status === 429` or `error === "too_many_attempts"` and display: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." Previously, rate limiting on verify-otp showed the generic "invalid code" message, which was misleading.

### 14. Insights prompt — Second person (גוף שני)
**File:** `backend/src/index.ts`

Rewrote the `generate-insights` system prompt to enforce second-person writing. Added explicit correct/incorrect examples with the user's name. Fixed `partnerType` bug (was based on user gender instead of `looking_for_gender`).

### 15. Support email + email template
**Files:** `frontend/public/terms.html`, `privacy.html`, `csae-policy.html`, `delete-account.html`, `frontend/src/AdminView.tsx`

Replaced incorrect support emails (`contact@joinone.io`, `support@joinone.io`) with `one-support@googlegroups.com`. Added "עדכון לאחר תקלה" admin email template.

---

## Commits (staging → main)

| Hash | Description |
|------|-------------|
| 30efb48 | Fix insights prompt to enforce second-person writing |
| 2f9686c | Fix expired token handling and Insights null crash |
| a64f7f0 | Revert above (broke OTP login on production) |
| 683185e | Reapply fix on staging only |
| eaf1128 | Fix OTP login: generate Supabase session (first attempt — didn't work) |
| 98603e7 | Fix OTP supabase_uid sync + Insights mbti null checks |
| 922b1b0 | Add ErrorBoundary + make bug reporting auth-independent |
| 401d687 | Fix OTP auth: self-signed JWT (replaced Supabase generate_link) |
| 4c63bc8 | Fix OTP logout loop: ignore Supabase SIGNED_OUT |
| d8cd850 | Fix OTP logout loop: localStorage-first token + disable SIGNED_OUT |
| e46d37c | Fix HS256 JWT verification: skip JWKS when no kid in header |
| 03e75ee | Remove debug alerts |
| ab7e946 | Fix session-expired for legacy logins without JWT + dedup |
| eb5b146 | Fix Insights crash on failed API response (allValues undefined) |
| dd1d7c8 | Fix error log clear, session-expired notice, ErrorBoundary report link |
| 950d796 | Increase auth rate limit to 30/10min + proper rate limit errors |
| f04d069 | Make JWT signing non-fatal in OTP verify |

---

## Questions for Security Session Review

1. **Self-signed JWT approach:** Is HS256 with SUPABASE_JWT_SECRET acceptable, or should we use a separate signing secret? The current approach means anyone with the Supabase JWT secret can forge OTP tokens.

2. **7-day expiry:** Supabase uses 1-hour access tokens with refresh. Our OTP tokens last 7 days with no refresh. Is this acceptable? Should we implement our own refresh mechanism?

3. **supabase_uid format for OTP users:** New OTP users get `supabase_uid = "otp-{id}"` (e.g., "otp-244"). This is deterministic. Is there a security concern with predictable UIDs in JWT sub claims?

4. **Disabled SIGNED_OUT handler:** We disabled Supabase's `onAuthStateChange` SIGNED_OUT listener because it caused logout loops for OTP users. This means server-side session revocation for Google users won't immediately reflect on the client. Is this an acceptable trade-off?

5. **session-expired on all 401s:** `apiFetch` now fires session-expired on ANY 401, not just when a token existed. We believe this is safe because apiFetch is only used by logged-in components. Are there edge cases we're missing?

6. **authLimiter at 30/10min:** Increased from 10 to accommodate testing. Is 30 reasonable for production? Should send-otp and verify-otp have separate limits?

7. **report-bug changed to optionalAuth:** This means unauthenticated users can submit bug reports. Is there a spam/abuse concern?
