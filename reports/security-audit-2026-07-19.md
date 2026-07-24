# Security Audit Report — One Platform
**Date:** 2026-07-19
**Auditor:** Claude (automated code review)
**Scope:** Full system — Backend, Frontend, Database, Infrastructure, Mobile

---

## Executive Summary

The system has a **solid foundation** — parameterized SQL queries throughout, proper JWT verification, working admin middleware, and no committed secrets. However, there are **several significant gaps** in authorization, input validation, CORS configuration, and data handling that should be addressed before scaling.

**Overall Assessment:** The system meets a *basic* standard for a beta with known users, but has gaps that would be unacceptable for a public-facing production system with unknown users.

---

## 1. Authentication & Authorization

### What Works Well
- `requireAdmin` middleware (line 1205) properly protects ALL `/admin/*` routes (verified: all admin routes are registered after the middleware)
- `requireUserAuth` middleware correctly validates JWT + verifies user owns the resource via `:id` param
- JWT verification uses proper JWKS (ES256) with HS256 fallback
- Token expiry delegated to Supabase (standard 1-hour tokens with refresh)

### Findings

| # | Severity | Finding | File:Line | Verified |
|---|----------|---------|-----------|----------|
| 1.1 | **HIGH** | `/login` returns full user object (all DB fields) without authentication | index.ts:138-148 | Yes - code confirmed |
| 1.2 | **HIGH** | `/analyze` has `requireAuth` but no owner check — any authenticated user can submit analysis for any `user_id` in body | index.ts:647-670 | Yes - code confirmed |
| 1.3 | **MEDIUM** | `/new-chat/message` has owner check but `if (req.auth?.sub)` condition means if `sub` is somehow missing, check is skipped. In practice `requireAuth` guarantees `sub` exists, so exploitability is very low | index.ts:4031 | Low risk in practice |
| 1.4 | **MEDIUM** | Admin access controlled by single hardcoded email. No role-based access, no audit log of admin actions | auth.ts:180 | Yes |
| 1.5 | **LOW** | `/system-question/answer` — `requireAuth` but no verification that the question belongs to the authenticated user | index.ts:3421 | Yes - but requires knowing question_id |

### Recommendations
1. **Fix `/login`**: Either remove this legacy endpoint or return only `{ id, email }` — not `SELECT *`
2. **Fix `/analyze`**: Add owner verification (resolve JWT user → compare to `user_id` in body)
3. **Move admin emails to env var**: `ADMIN_EMAILS=chen.hagag@gmail.com` instead of hardcoded
4. **Add admin audit log table**: Track who did what and when

---

## 2. Secrets & Credentials

### What Works Well
- `.env` is in `.gitignore` — not committed to git
- `VITE_SUPABASE_ANON_KEY` in frontend is intentionally public (Supabase design)
- No hardcoded API keys found in source code
- Production secrets managed via Railway environment variables

### Findings

| # | Severity | Finding | Verified |
|---|----------|---------|----------|
| 2.1 | **MEDIUM** | Local `.env` contains both staging AND production DATABASE_URL. If the machine is compromised, prod DB is accessible | Yes - both connection strings present |
| 2.2 | **LOW** | No evidence of secret rotation schedule. OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY have unknown age | Cannot verify from code |
| 2.3 | **INFO** | Admin email hardcoded in source (auth.ts:180) — visible in git history to anyone with repo access | Yes |

### Recommendations
1. **Remove production DATABASE_URL from local .env** — use staging only for development
2. **Establish rotation schedule** for API keys (quarterly recommended)
3. **Consider using `.env.local`** (not committed) for production connection strings vs `.env.example` for templates

---

## 3. Database Security

### What Works Well
- PostgreSQL on Railway with SSL enforced in production (`NODE_ENV=production`)
- All queries use parameterized statements (`$1, $2, $3`) — **zero SQL injection risk found**
- Database accessed only through backend server (no direct frontend access)

### Findings

| # | Severity | Finding | Verified |
|---|----------|---------|----------|
| 3.1 | **MEDIUM** | Supabase is used only for auth — no RLS policies needed on the Railway PostgreSQL (data lives in Railway, not Supabase) | Verified from schema.pg.ts |
| 3.2 | **MEDIUM** | Single `postgres` superuser for all connections (typical Railway setup). No read-only users for analytics | Cannot verify without Railway dashboard |
| 3.3 | **LOW** | No column-level encryption for sensitive fields (phone, email, conversations) — standard for this scale | Verified from schema |

### Recommendations
1. **Confirm Railway DB is not publicly accessible** (verify in Railway dashboard — should be private network only)
2. **Consider read-only DB user** if adding analytics/reporting tools later
3. For future: encrypt `whatsapp_phone` at application level if user base grows

---

## 4. Data Protection

### What Works Well
- Railway deployment enforces HTTPS at proxy level
- Account deletion (`DELETE /users/:id/account`) removes data from all main tables
- `safeOutputLayer.ts` exists to filter sensitive data for user-facing endpoints

### Findings

| # | Severity | Finding | File:Line | Verified |
|---|----------|---------|-----------|----------|
| 4.1 | **HIGH** | Account deletion does NOT delete physical photo files from disk. Only DB records removed. Photos remain accessible via `/uploads/{filename}` | index.ts:1191 (vs line 756 which does delete files) | Yes - confirmed by comparing single photo delete vs account delete |
| 4.2 | **HIGH** | `GET /users/:id` returns ALL columns (`SELECT *`) including admin_notes, devices_seen, whatsapp_phone to the user themselves | index.ts:545-550 | Yes |
| 4.3 | **MEDIUM** | `deleted_users` archive retains email + first_name + city indefinitely. No retention policy or auto-anonymization | index.ts:1175-1179, schema.pg.ts:890 | Yes |
| 4.4 | **MEDIUM** | No HSTS header set at application level (relies on Railway proxy) | index.ts:62-67 | Yes - no helmet.js |
| 4.5 | **LOW** | `devices_seen` field tracks all user devices — unclear business purpose, potential privacy concern | schema.pg.ts:608 | Yes |

### Recommendations
1. **Critical fix**: Add file deletion loop in account deletion (same pattern as single photo delete)
2. **Filter user endpoint**: Don't return `admin_notes`, `devices_seen`, internal fields to users
3. **Add data retention policy**: Auto-delete `deleted_users` records after 90 days
4. **Install helmet.js**: Adds HSTS, X-Frame-Options, CSP headers automatically

---

## 5. Logging

### What Works Well
- Message content is NOT logged (only length): `console.log(...message (${message.length} chars)...)`
- OTP codes themselves are NOT logged
- No access tokens or session tokens in logs

### Findings

| # | Severity | Finding | File:Line | Verified |
|---|----------|---------|-----------|----------|
| 5.1 | **MEDIUM** | Email addresses logged: `[otp] Code sent to ${normalizedEmail}` | index.ts:410 | Yes |
| 5.2 | **MEDIUM** | Admin deletion logs name + email: `Deleted user ${userId} (${user.first_name} <${user.email}>)` | index.ts:1661 | Yes |
| 5.3 | **MEDIUM** | Analysis transcript preview logged: `transcript.slice(0, 300)` — contains conversation content | index.ts:2333 | Yes |
| 5.4 | **LOW** | Error messages sometimes expose internal state: `Cannot rate a match in status '${match.status}'` | index.ts:2617 | Yes |
| 5.5 | **LOW** | No structured logging (Winston/Pino) — just console.log, no log levels | Entire backend | Yes |

### Recommendations
1. **Remove email from OTP log** — log only `[otp] Code sent successfully` (you can trace via DB if needed)
2. **Remove transcript from reanalyze log** — or truncate to 50 chars
3. **Adopt structured logging** (Pino recommended) with PII redaction middleware
4. **Sanitize error messages** returned to client — don't expose internal field names/values

---

## 6. Input Validation

### What Works Well
- **Zero SQL injection risk** — all queries parameterized
- **No command injection** — no `child_process.exec` with user input
- Direct messages validated: type check + 2000 char limit
- File upload: MIME type filter (`image/*`) + 10MB size limit

### Findings

| # | Severity | Finding | File:Line | Verified |
|---|----------|---------|-----------|----------|
| 6.1 | **MEDIUM** | `PATCH /users/:id` accepts arbitrary values without validation — no age bounds, no string length limits, no enum validation | index.ts:554-617 | Yes |
| 6.2 | **MEDIUM** | File extension taken from `file.originalname` — user can upload `malicious.svg` (SVGs can contain JS). MIME check mitigates but doesn't prevent | index.ts:684 | Yes |
| 6.3 | **MEDIUM** | `/analyze` has no length limit on `answer` field — could send huge payload to OpenAI (cost risk) | index.ts:648-651 | Yes |
| 6.4 | **LOW** | `original_name` stored unsanitized in DB. If displayed in admin without escaping → stored XSS | index.ts:708 | Yes but admin-only |
| 6.5 | **LOW** | No Content-Security-Policy header → if XSS exists, no mitigation layer | No helmet.js | Yes |

### Recommendations
1. **Add validation to profile updates**: Age 18-120, string lengths, enum whitelist for gender/religion/etc.
2. **Whitelist file extensions**: Only `.jpg`, `.jpeg`, `.png`, `.webp` — reject `.svg`, `.gif`
3. **Add payload size limit**: `app.use(express.json({ limit: '1mb' }))` (Express default is 100kb, but verify)
4. **Install helmet.js** with CSP policy

---

## 7. Abuse Protection

### What Works Well
- General rate limiter: 300 req/15 min per IP
- AI-specific limiter: 30 req/min per IP on OpenAI routes
- Rate limiter correctly skips admin routes (admin is authenticated)

### Findings

| # | Severity | Finding | File:Line | Verified |
|---|----------|---------|-----------|----------|
| 7.1 | **HIGH** | `/login`, `/auth/send-otp`, `/auth/verify-otp`, `/register` have NO dedicated rate limiting | index.ts:138, 367, 419, 474 | Yes — only generalLimiter (300/15min) applies |
| 7.2 | **HIGH** | OTP brute force: 6-digit code, 10-minute window, no failed-attempt lockout. At 300 req/15min rate limit = 300 guesses per window. Odds: 300/1,000,000 per window = low, but automated attackers can use multiple IPs | index.ts:381-382, 429 | Yes |
| 7.3 | **MEDIUM** | `/login` enables email enumeration (404 vs 200) with no rate limit beyond general | index.ts:147 | Yes |
| 7.4 | **MEDIUM** | `trust proxy` set to 1 (line 65) — rate limiting uses X-Forwarded-For. Attackers behind rotating proxies can bypass per-IP limits | index.ts:65 | Yes |
| 7.5 | **LOW** | Messaging endpoints excluded from rate limiting (direct-messages, typing-status) — intentional for UX but could be abused | index.ts:76-78 | Yes — authenticated only |

### Recommendations
1. **Add auth-specific rate limiter**: 5 OTP sends per email per hour, 10 verify attempts per email per 10 min
2. **Add failed-attempt counter**: Lock OTP verification after 5 wrong attempts for that email
3. **Normalize login response**: Return same response for "email not found" and "email found" (or add rate limit)
4. **Add per-user rate limiting** for messaging: e.g., 60 messages/min per authenticated user

---

## 8. Infrastructure

### What Works Well (from code perspective)
- Railway auto-deploy from GitHub (no manual SSH access needed)
- PostgreSQL SSL enforced in production
- Static frontend served by Express (no separate CDN needed for beta)
- Package-lock.json exists for both backend and frontend (reproducible builds)

### Findings

| # | Severity | Finding | Verified |
|---|----------|---------|----------|
| 8.1 | **HIGH** | No `helmet.js` — missing security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) | Verified: not in package.json |
| 8.2 | **HIGH** | CORS set to `app.use(cors())` with no options — allows ANY origin to make requests | index.ts:66 |
| 8.3 | **MEDIUM** | No monitoring/alerting visible in code. If server goes down or gets attacked, no notification system | No alerting code found |
| 8.4 | **MEDIUM** | `/uploads` served via `express.static()` with no auth — anyone who knows filename can access photos | index.ts:696 |
| 8.5 | **LOW** | OpenAI package (4.20.0) significantly behind latest (4.68+). No security CVEs known, but missing improvements | package.json |

### Recommendations
1. **Install helmet.js**: `npm i helmet` + `app.use(helmet())` — instant security headers
2. **Configure CORS properly**: `app.use(cors({ origin: ['https://joinone.io'] }))` — or use env var for flexibility
3. **Add Railway monitoring**: Set up health check alerts (Railway has built-in options)
4. **Consider signed photo URLs**: Generate time-limited tokens instead of public static serving (future improvement)

---

## 9. Operational Security

### Assessment (cannot fully verify from code — requires checking external services)

| Service | 2FA Status | Notes |
|---------|------------|-------|
| GitHub | **Check manually** | Repo access = code + git history access |
| Railway | **Check manually** | Railway access = env vars + DB + deploys |
| Supabase | **Check manually** | Supabase access = auth system + user emails |
| Google (admin email) | **Check manually** | Admin email compromise = full system admin |
| Resend | **Check manually** | Resend access = ability to send emails as your domain |
| Domain registrar | **Check manually** | Domain compromise = SSL + redirect attacks |

### Findings from Code

| # | Severity | Finding | Verified |
|---|----------|---------|----------|
| 9.1 | **MEDIUM** | Single admin user (chen.hagag@gmail.com). If compromised, full system access. No backup admin | auth.ts:180 |
| 9.2 | **MEDIUM** | No admin action audit log. Cannot track who did what | No audit table in schema |
| 9.3 | **LOW** | No IP allowlist for admin access — admin can log in from anywhere | No IP check in requireAdmin |

### Recommendations
1. **Enable 2FA on ALL services** (GitHub, Railway, Supabase, Google, Resend, domain registrar)
2. **Add second admin email** as backup (separate from personal email)
3. **Create `admin_audit_log` table**: Log every admin action with timestamp + target user

---

## 10. Privacy Review

### Data Collected
| Category | Fields | Necessary? |
|----------|--------|------------|
| Identity | first_name, email, age, city, gender | Yes |
| Contact | whatsapp_phone | Yes (optional, user-controlled) |
| Preferences | looking_for_gender, desired_age/height/location | Yes |
| Conversations | Full chat transcript (all channels) | Yes — core product |
| Analysis | 60+ personality traits with scores | Yes — core product |
| Photos | Up to N photos per user | Yes |
| Tracking | devices_seen, page_views | Questionable |
| Matching | candidate_matches, matches, scores | Yes |

### Findings

| # | Severity | Finding | Verified |
|---|----------|---------|----------|
| 10.1 | **HIGH** | Full conversation content + personality analysis sent to OpenAI API. No explicit user consent for third-party AI data sharing beyond general terms | Verified in chatManager.ts |
| 10.2 | **MEDIUM** | `devices_seen` JSONB tracks all devices ever used — no clear product purpose, potential privacy concern | schema.pg.ts:608 |
| 10.3 | **MEDIUM** | Deleted user archive retains PII (email, name) indefinitely | schema:890 |
| 10.4 | **MEDIUM** | `page_views` table tracks every screen visit per user — useful for analytics but retains indefinitely | schema.pg.ts |
| 10.5 | **LOW** | No data export feature ("right to access" / GDPR Article 15 equivalent) | Not found in code |

### Recommendations
1. **Add privacy notice** about OpenAI data sharing (or set `store: false` on OpenAI API calls)
2. **Add retention policy**: Auto-delete page_views > 90 days, deleted_users > 90 days
3. **Consider removing devices_seen** or clarifying its purpose
4. **Future**: Add data export endpoint for user profile download

---

## 11. Threat Review (Attacker Perspective)

### Realistic Attack Scenarios

| # | Attack | Feasibility | Impact | Current Protection |
|---|--------|-------------|--------|-------------------|
| 11.1 | **Email enumeration via `/login`** — discover which emails are registered | Easy | Medium — privacy leak | None (404 vs 200 response) |
| 11.2 | **IDOR on `/analyze`** — submit analysis answers for another user to corrupt their profile | Easy | High — data corruption | Only `requireAuth` (no owner check) |
| 11.3 | **Photo scraping via `/uploads`** — brute-force filenames (timestamp-based) to access all user photos | Medium | High — privacy breach | Filenames are timestamp+random (hard to guess) |
| 11.4 | **XSS → token theft** — if XSS found anywhere, localStorage tokens can be stolen | Medium (needs XSS vector) | Critical — full account takeover | No CSP header, tokens in localStorage |
| 11.5 | **CORS abuse** — malicious site makes authenticated API calls on behalf of visiting user | Medium | High — depends on what user has open | CORS allows ALL origins |
| 11.6 | **Prompt injection** — user crafts message to make AI reveal system prompts or act inappropriately | Easy to attempt, hard to exploit for data leak | Low-Medium — AI has only current user's data | No input sanitization, but data isolation exists |
| 11.7 | **OTP brute force from multiple IPs** — attempt all 6-digit codes using proxy rotation | Hard (1M combinations, time-limited) | High — account takeover | 10-min expiry + rate limit (but per-IP only) |
| 11.8 | **Open redirect via `redirectTo` in magic link** — trick user into clicking link that redirects to attacker site | Easy | Medium — phishing | `redirectTo` parameter not validated |
| 11.9 | **Orphaned photo access after deletion** — user deletes account but photos remain on disk | Easy (if filename known) | Medium — privacy violation | No file cleanup on account deletion |

---

## Summary Table

| Severity | # | Finding | Risk | Solution |
|----------|---|---------|------|----------|
| **CRITICAL** | 8.2 | CORS allows ALL origins | Cross-origin attacks, CSRF | `cors({ origin: ['https://joinone.io'] })` |
| **HIGH** | 1.1 | `/login` returns full user object without auth | Privacy leak, enumeration | Return only `{ exists: true }` or remove endpoint |
| **HIGH** | 1.2 | `/analyze` — no owner verification | Data corruption via IDOR | Add JWT user → user_id comparison |
| **HIGH** | 4.1 | Photo files not deleted on account deletion | Privacy violation after deletion | Add file deletion loop in account delete handler |
| **HIGH** | 7.1 | Auth endpoints lack dedicated rate limiting | Brute force, spam | Add per-email rate limit (5 OTP/hour, 10 verify/10min) |
| **HIGH** | 8.1 | No security headers (helmet.js) | XSS amplification, clickjacking | `npm i helmet` + `app.use(helmet())` |
| **HIGH** | 4.2 | `GET /users/:id` returns all fields including internal ones | Data over-exposure | Filter response to user-safe fields only |
| **HIGH** | 11.8 | Open redirect in magic link `redirectTo` | Phishing | Validate against allowlist of domains |
| **MEDIUM** | 1.4 | Single hardcoded admin email | Single point of failure | Move to env var, add backup admin |
| **MEDIUM** | 4.3 | Deleted users archive retains PII indefinitely | Privacy compliance risk | Add 90-day auto-purge |
| **MEDIUM** | 5.1-5.3 | PII in console.log (emails, transcript snippets) | Log exposure risk | Redact PII from logs |
| **MEDIUM** | 6.1 | No validation on profile updates | Data integrity | Add age bounds, string length, enum checks |
| **MEDIUM** | 6.2 | File extension from user input (.svg allowed) | Stored XSS via SVG | Whitelist: .jpg, .jpeg, .png, .webp only |
| **MEDIUM** | 7.3 | Email enumeration via `/login` 404 vs 200 | Privacy | Normalize response |
| **MEDIUM** | 8.4 | Uploaded photos publicly accessible (no auth on static serve) | Privacy | Accept risk for beta or add signed URLs |
| **MEDIUM** | 9.2 | No admin audit log | Accountability gap | Add admin_audit_log table |
| **MEDIUM** | 10.1 | User data sent to OpenAI without explicit consent | Privacy compliance | Add notice + consider `store: false` |
| **MEDIUM** | 10.2 | `devices_seen` — unclear purpose | Data minimization | Remove or document purpose |
| **LOW** | 1.5 | `/system-question/answer` — no question ownership check | Minor IDOR | Add user_id verification |
| **LOW** | 5.4-5.5 | No structured logging | Operations | Migrate to Pino/Winston |
| **LOW** | 6.4 | Original filename stored unsanitized | Stored XSS (admin only) | Sanitize on display |
| **LOW** | 7.5 | Messaging endpoints exempt from rate limit | Spam risk | Add per-user limit |
| **LOW** | 8.5 | OpenAI SDK outdated (4.20 vs 4.68) | Missing fixes | Update when convenient |
| **LOW** | 10.5 | No data export feature | Compliance gap | Future feature |

---

## Scoring by Severity

| Level | Count | Examples |
|-------|-------|---------|
| **Critical** | 1 | Unrestricted CORS |
| **High** | 7 | IDOR, missing rate limits, no security headers, photo deletion, open redirect |
| **Medium** | 12 | Logging PII, validation gaps, privacy concerns |
| **Low** | 7 | Minor IDORs, outdated packages, operational improvements |

---

## Final Assessment

**Does the system meet a reasonable security standard for a beta with real users?**

**Partially — with caveats.**

**What's solid:**
- Authentication architecture (JWT + Supabase) is sound
- Zero SQL injection risk (all queries parameterized)
- Admin middleware properly protects all admin routes
- No secrets committed to git
- File uploads have basic protections

**What must be fixed before scaling:**
1. CORS configuration (trivial fix, critical impact)
2. `/login` endpoint data leak (trivial fix)
3. `/analyze` IDOR (trivial fix)
4. Security headers via helmet.js (5-minute fix)
5. Auth rate limiting (30-minute fix)
6. Photo file cleanup on deletion (30-minute fix)
7. Open redirect validation (15-minute fix)

**Estimated time for all Critical + High fixes: 3-4 hours of focused work.**

The system is acceptable for a *closed beta* with known users you trust, but the CORS and IDOR issues make it vulnerable if anyone with technical knowledge decides to probe the API. I recommend fixing the Critical + High items before any public launch or marketing push.

---

*Report generated from static code analysis. Does not include dynamic penetration testing, dependency vulnerability scanning (npm audit), or infrastructure configuration review (Railway dashboard, Supabase dashboard settings).*
