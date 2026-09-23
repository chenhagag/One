# Security Hardening Plan — One

**Created:** 2026-09-23
**Last updated:** 2026-09-23
**Context:** External pentest report (OneSyberTest) + 5 internal code scans + GPT review
**Branch:** staging only until all tests pass. NO production deploy without explicit approval.

## Implementation Status

| Pulse | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1: set-primary + pending-rating | ✅ Done | 195af69 | requireAdmin + IDOR fix |
| 2: profile_complete server-side | ✅ Done | d94a350 | Auto-compute, removed from user PATCH |
| 3: Input validation | ✅ Done | d94a350 | PATCH fields + message length |
| 4: Rate limiting | ✅ Done | d94a350 | /register + /auth/exchange-code |
| 5: Photo privacy (signed URLs) | ⏳ Deferred | — | Needs planning, risk of breaking things |
| 6: Code cleanup | ✅ Done | d94a350 | ADMIN_EMAILS + dead x-admin-key |

---

## Background

### Sources
1. **External pentest** (OneSyberTest): 312 tests, 0 confirmed exploits, 83 suspected, 147 incomplete
2. **Internal scan (5 agents):** security headers, auth/IDOR, file upload, env/secrets, endpoint auth
3. **GPT review:** methodology critique + safety requirements for fixes
4. **Previous audit (July 2026):** 9 open items (see memory: project_security_hardening.md)

### Key Clarifications After Verification
- **Admin endpoints ARE protected** — `app.use("/admin", requireAdmin)` at line 1758 covers all routes defined after it. Only `set-primary` (line 1080) was defined before it.
- **`.env` is NOT in git** — .gitignore works. Local dev file, not a breach.
- **External report false positives:** Many "suspected" findings are SPA returning 200 HTML for all paths. Endpoints like `rewind`, `see-who-likes` don't exist in our system.
- **`x-admin-key` in frontend is dead code** — backend has no check for it.

---

## Pulse 1: Permission Fixes (URGENT)

### 1A. `set-primary` — Unprotected Admin Endpoint

**File:** `backend/src/index.ts` line 1080
**Status:** VERIFIED VULNERABILITY
**Severity:** High

**Problem:** `POST /admin/users/:id/photos/:photoId/set-primary` is defined at line 1080, BEFORE `app.use("/admin", requireAdmin)` at line 1758. Express applies middleware in registration order, so this route has NO auth.

**Impact:** Anyone can change any user's primary photo without authentication.

**Callers:**
- AdminView.tsx line 5856 — "קבע ראשית" button in admin photo gallery
- No other callers (no frontend, no scripts, no cron)

**Fix:** Add explicit `requireAdmin` middleware to the route:
```typescript
app.post("/admin/users/:id/photos/:photoId/set-primary", requireAdmin, async (req, res) => {
```

**Do NOT:** Move the route (unnecessary risk), change URL/format/response.

**Test — Block:**
- No token → 401
- Regular user token → 403
- Verify DB unchanged after blocked request

**Test — Legitimate:**
- Admin token → 200, photo changes
- Admin UI "קבע ראשית" button still works

**Rollback:** Remove the middleware parameter. One line change, no DB impact.

---

### 1B. `pending-rating` — IDOR via Query Param

**File:** `backend/src/index.ts` lines 4109-4111
**Status:** VERIFIED VULNERABILITY
**Severity:** Critical (PII exposure)

**Problem:** `GET /matches/pending-rating` accepts `?user_id=X` query param that overrides the JWT-derived user ID. No admin check. Any authenticated user can see any other user's pending rating data.

**Data exposed:** Partner's first_name, age, city, gender, photo URLs, match_id.

**Callers:**
- NewChat.tsx line 187: `apiFetch(`/matches/pending-rating?user_id=${userId}`)` — ALWAYS sends user_id (own ID)
- No admin UI calls this endpoint

**CRITICAL:** Frontend always sends `user_id` as query param, even for the user's own ID. Cannot simply remove the override — would break all users.

**Fix:**
```typescript
if (req.query.user_id) {
  const requestedId = parseInt(req.query.user_id as string, 10);
  if (requestedId !== userId) {
    // Only admin can view other users' pending ratings
    const isAdmin = req.auth?.email && ADMIN_EMAILS.includes(req.auth.email);
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }
  }
  userId = requestedId;
}
```
Import ADMIN_EMAILS from auth.ts.

**Test — Block:**
- User A sends `?user_id=B` → 403, empty response (no partial data)

**Test — Legitimate:**
- User A sends `?user_id=A` (normal frontend flow) → works
- User A sends no query param → works (JWT fallback)
- Admin sends `?user_id=B` → works
- NewChat rating screen shows correct match
- Test on Android (Capacitor) app

**Rollback:** Remove the if/admin check. Local change, no DB impact.

**Open question:** Are there other endpoints with the same pattern? Need scan.

---

## Pulse 2: Editable Fields & Onboarding

### 2A. `profile_complete` — User-Editable Flag

**File:** `backend/src/index.ts` line 789
**Status:** VERIFIED — user can set profile_complete=true via PATCH
**Severity:** Medium (not critical — matching pool entry requires separate admin flag)

**Actual impact:** Skips ProfileSetup screen. Does NOT give access to matching (needs `in_matching_pool`). Does allow chat with AI without profile data (pollutes conversation data).

**Fix:**
1. Remove `profile_complete` from user-editable fields in PATCH /users/:id (line 789)
2. Auto-compute after PATCH save: `profile_complete = (first_name IS NOT NULL AND age IS NOT NULL AND city IS NOT NULL AND gender IS NOT NULL)`
3. Update ProfileSetup.tsx to not send `profile_complete: true` (remove from PATCH body)

**Callers affected:**
- ProfileSetup.tsx line 110: sends `profile_complete: true` → remove, server computes it
- App.tsx line 366: reads from response → no change needed
- Admin PATCH (line 2087): keep — admin should be able to override

**Test:** Complete ProfileSetup → profile_complete becomes true. Skip fields → stays false.

### 2B. `consent_accepted` — Leave As Is (For Now)

**Decision:** consent_accepted being user-editable is LEGITIMATE — the user is the one accepting consent. However:
- Need to add `consent_accepted_at TIMESTAMPTZ` for audit trail
- Need to track terms version
- Separate pulse — requires DB migration + frontend update

### 2C. `self_frozen` — Leave As Is

**Decision:** User freezing/unfreezing themselves is legitimate behavior. Verify that user unfreeze doesn't override admin freeze (check matchStage1.ts logic).

---

## Pulse 3: Input Validation

### 3A. PATCH /users/:id Field Validation

**Before implementing:** Query DB for existing values to set safe limits:
```sql
SELECT MAX(LENGTH(first_name)), MAX(age), MIN(age), MAX(height), MIN(height) FROM users;
```

**Proposed limits (verify against data first):**
- `first_name`: string, trim, 1-50 chars
- `age`: number, 18-120
- `height`: number, 100-250
- `gender`: enum ['man', 'woman']
- `looking_for_gender`: enum ['man', 'woman']
- `whatsapp_phone`: string, regex `/^\+?\d{7,15}$/`
- `marital_status`, `religion`, `smoker`, `has_children`: validate against known enum values

**Error handling:** Return 400 with clear field name. Do NOT silently truncate.

### 3B. Chat Message Length

**File:** `backend/src/index.ts` — POST /new-chat/message, POST /analyze, POST /analyze-profile
**Fix:** `if (typeof answer !== 'string' || answer.length > 5000) return 400`
**Frontend:** Already has 2000 char limit in UI. Server limit is safety net.

---

## Pulse 4: Rate Limiting

### 4A. Missing Rate Limits

- `POST /register` → add authLimiter (30/10min per IP)
- `POST /auth/exchange-code` → add authLimiter (30/10min per IP)

### 4B. General Rate Limit Discrepancy

- Code: 1000/15min. CLAUDE.md says 300/15min.
- Decision: Do NOT lower to 300 without analyzing real traffic. Update CLAUDE.md to match code.

### 4C. Frontend 429 Handling

- Verify frontend handles 429 gracefully (shows message, doesn't loop)

---

## Pulse 5: Photo Privacy (Requires Planning)

### Current State
- Photos accessible without auth if URL known (middleware allows `!origin` requests)
- Filenames are timestamp+random (10^19 combinations) — not guessable
- URLs only exposed through authenticated API endpoints
- But: once a match partner has a URL, they can share it

### Options (evaluate before implementing)
1. **Signed URLs with TTL** — most secure, but breaks cached images, open tabs, Android app
2. **Require auth header for /uploads** — breaks img tags (can't add auth headers)
3. **Proxy through API endpoint** — performance cost, but full control
4. **Accept current risk** — filename randomness provides security-through-obscurity

### Dependencies to check
- Android app photo loading
- PWA cached images
- Open tabs with loaded photos
- Admin panel photo viewing

---

## Pulse 6: Code Cleanup

- Replace hardcoded admin email at lines 5184, 5879 with ADMIN_EMAILS import
- Remove `x-admin-key` header from AdminPipeline.tsx line 771 (dead code)
- Update CLAUDE.md rate limit documentation (1000, not 300)

---

## Open Items from July 2026 Audit

| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | Revert Google-first in in-app browsers | Open | Low |
| 2 | Remove otp-diag logging | Open | Low |
| 3 | Filter fields in /register, POST /users, PATCH /users/:id | → Pulse 3 | Medium |
| 4 | Signed URLs for /uploads | → Pulse 5 | Medium |
| 5 | XSS review | Done (pentest confirmed safe) | Closed |
| 6 | Per-user rate limit on messaging | Open | Medium |
| 7 | Separate APP_JWT_SECRET for OTP | Open | Low |
| 8 | Shorten OTP token expiry + add refresh | Open | Low |
| 9 | Rate limit /auth/exchange-code | → Pulse 4 | Medium |

---

## Testing Protocol (All Pulses)

Before deploying ANY pulse to staging:

1. **Block test:** Verify unauthorized action returns error AND does not modify data
2. **Legitimate test:** Verify normal user flow still works
3. **Existing session test:** Tab open from before the change still works
4. **Android test:** Same flows work in Capacitor app
5. **Admin test:** Admin operations unaffected
6. **Two-user test:** Use two test accounts with different data

After deploying to staging:
- Smoke test with test accounts
- Monitor error logs for unexpected 401/403
- Verify no push/email/nudge side effects on real users

**NEVER test write operations on real user accounts.**
**NEVER deploy to production without explicit instruction.**
