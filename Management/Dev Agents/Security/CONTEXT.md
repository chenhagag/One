# Security Agent — Context

## Role
אחראי על אבטחת המערכת: auth, IDOR prevention, input validation, rate limiting, photo privacy, penetration testing, וניטור שגיאות. כולל פיתוח, auditing, ובדיקות.

---

## Security Audit History

### Full Audit — September 2026
- **תאריך**: 2026-09-23/24
- **מקורות**: External pentest (OneSyberTest) + 5 internal code scans + GPT review
- **תוצאות pentest**: 0 exploits, 1,483+ requests, 2 accounts, 86 tests blocked
- **3 "urgent" findings — all false positives**: headers exist (Helmet), rate limiting exists, /api/users/search doesn't exist
- **Deployed to production**: 2026-09-23
- **Full plan**: `Management/Docs/security-hardening-plan.md`

### Previous Audit — July 2026
- OTP bug fixed, error monitoring added
- 9 open items identified (most resolved in Sep audit)

---

## What Was Fixed (Sep 2026)

| Fix | Severity | Details |
|-----|----------|---------|
| `set-primary` unprotected | High | Defined before global requireAdmin → added explicit middleware |
| `pending-rating` IDOR | Critical | `?user_id=X` override → admin check added |
| `profile_complete` user-editable | Medium | Removed from PATCH, auto-computed server-side |
| Input validation | Medium | name 1-50, age 18-120, height 100-250, gender enum, phone regex, message max 5000 |
| Rate limiting on auth | Medium | authLimiter on /register + /auth/exchange-code |
| Hardcoded admin email | Low | 2 locations → centralized ADMIN_EMAILS from auth.ts |
| Dead x-admin-key | Low | Removed from AdminPipeline.tsx |

---

## Current Auth Architecture

### Middleware Stack
| Middleware | Protects | Logic |
|------------|----------|-------|
| `requireAuth` | User routes | JWT verification |
| `requireUserAuth` | `/users/:id` routes (22) | JWT + user ID match + admin bypass |
| `requireAdmin` | `/admin/*` routes (65) | JWT + email whitelist (ADMIN_EMAILS) |

### Public Routes (no auth)
`/cities`, `/enum-options`, `/login`, `/register`, `/auth/*`, `/health`

### Rate Limiters
| Limiter | Scope | Limit |
|---------|-------|-------|
| General | All routes (excl. admin) | 1000 req/15min per IP |
| AI | OpenAI routes | 30 req/min per IP |
| Auth | /register, /auth/exchange-code | 30 req/10min per IP |

---

## Error Monitoring
- `error_logs` table in DB
- Frontend: auto-reports non-2xx API responses + JS errors
- Backend: logs unhandledRejection/uncaughtException
- Admin: "שגיאות" tab with filtering + cleanup
- Response body captured in `extra.response` field

---

## Open Items (Non-Urgent)

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | **Signed URLs for /uploads** | Medium | Only real security gap. Photos accessible without auth if URL known. Filenames are 10^19 combinations (not guessable). Needs planning: Android app, cache, open tabs |
| 2 | **NaN param validation** | Low | app.param() ready locally, not pushed |
| 3 | **Per-user rate limit on messaging** | Low | IP-based exists |
| 4 | **Separate APP_JWT_SECRET for OTP** | Low | From July audit |
| 5 | **Shorten OTP token expiry** | Low | From July audit |
| 6 | **CLAUDE.md rate limit docs** | Low | Says 300, code says 1000 |

---

## IDOR Test Script
`Management/Dev Agents/Security/test-idor.ts` — 25 tests covering all user endpoints.

Usage:
```bash
npx tsx test-idor.ts <TOKEN_A> <TOKEN_B> [BASE_URL]
```
Token format: `userId|JWT` or just JWT (auto-resolves via /auth/sync).
Tests: profile read/write, photos, conversations, insights, DMs, match cards, match history, account deletion, data reset, chat-as-other-user.

---

## Important Coding Rules

### match_card_sent_at Filter
Any query showing cancelled matches to users MUST filter by `match_card_sent_at IS NOT NULL` — otherwise admin-cancelled potential_matches appear as "past matches".

### Notification Staging Block
Railway staging runs with `NODE_ENV=production`. Must check `process.env.STAGING_URL` to block notifications on staging. Every new notification function needs this guard.

### Admin Route Registration
All admin routes must be defined AFTER `app.use("/admin", requireAdmin)` in index.ts, or have explicit `requireAdmin` middleware. The `set-primary` bug was caused by route order.

---

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/auth.ts` | Auth middleware, ADMIN_EMAILS, JWT verification |
| `backend/src/index.ts` | Rate limiters, route registration order |
| `backend/src/notifications.ts` | STAGING_URL guard |
| `Management/Docs/security-hardening-plan.md` | Full audit plan with pulse details |
| `Management/Dev Agents/Security/test-idor.ts` | IDOR test script (25 tests) |

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `Management/Docs/security-hardening-plan.md` — full pulse-by-pulse audit plan
4. `Management/claude-working-guidelines.md` — deploy/staging rules
5. `backend/src/auth.ts` — auth middleware source

## Rules
- **NEVER test write operations on real user accounts**
- **NEVER deploy security changes to production without explicit instruction**
- **Staging first** — smoke test, monitor error logs, verify no side effects
- **Every admin endpoint must have requireAdmin** — check route registration order
- **STAGING_URL check** in every new notification function
- **Signed URLs**: if implementing, must test Android app, PWA cache, open tabs, admin panel
