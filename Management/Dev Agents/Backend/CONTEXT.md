# Backend Dev Agent — Context

## Role
אחראי על תשתית ה-backend: Express server, API routes, DB schema, auth, RAG infrastructure, notifications, וכל מה שלא pipeline/cron (סוכן Automation), לא conversation/chat (סוכן Conversation), לא analysis (סוכן Analysis), ולא matching (סוכן Matching).

**לא כולל**: Conversation system (סוכן Conversation), Analysis system (סוכן Analysis), Pipeline/cron (סוכן Automation), Matching algorithm (סוכן Matching).

---

## Architecture Overview
- **Server**: Node.js + Express + TypeScript (port 3001 dev / PORT env prod)
- **DB**: PostgreSQL (Railway) — schema at `schema.pg.ts`
- **Auth**: Supabase (Google OAuth + Magic Link + OTP) — JWT verified on backend
- **AI**: OpenAI GPT-4o (conversation + analysis), GPT-4o-mini (summarization)
- **Deployment**: Railway auto-deploy from GitHub — `main` → production, `staging` → staging
- **File Storage**: Railway Volume `/app/data/uploads` (prod), local `uploads/` (dev)
- **Rate Limiting**: express-rate-limit — 300 req/15min general, 30 req/min AI routes

---

## RAG System

### Architecture — 3 Context Sources
1. **One Knowledge RAG** (scope=system) — 53 chunks: identity, process, analysis, matching, appearance, models, UI, support
2. **User Memory RAG** (scope=user) — scoped by user_id. Currently: insight chunks auto-upserted. Future: conversation memory, preferences
3. **Live State** — `getAgentSafeLiveState()` from DB (match status, profile completion, etc.)

### Key Files
| File | Purpose |
|------|---------|
| `backend/src/rag.ts` | embedText, searchChunks, retrieveContext, getAgentSafeLiveState, formatters |
| `backend/src/seedKnowledge.ts` | Seed/update system chunks. Run: `npx ts-node src/seedKnowledge.ts` |
| `backend/src/schema.pg.ts` | knowledge_chunks table with pgvector |

### How It Works
- Every user message: embed(lastAssistantMsg + userMsg) → parallel search system+user chunks → inject if score > 0.30
- Threshold 0.30 (not 0.72) because text-embedding-3-small returns low scores for Hebrew (0.30-0.65 range)
- Debug log: `[RAG] user=X channel=Y system=N user=M liveState=ok`

### RAG Insights (deployed to staging 2026-09-22)
- When insights written → auto-upsert chunk to knowledge_chunks (one per user, title=`user_insights_full`, category=`insights`, sourceType=`one_inference`)
- Channels with direct injection filter out insight chunks from RAG (prevent duplicates)
- Daily reconciliation fixes upsert failures within 24 hours
- Backfill on first deploy (90s after startup)
- **⚠️ Scaling**: reconcileInsightChunks runs without LIMIT — needs batching before launch (100+ users)

### Maintenance Rule — CRITICAL
**When changing features** that affect settings, user details, process flow, or matching logic → **must update** relevant chunks in seedKnowledge.ts → re-run seed on both staging and prod DBs.

---

## Conversation System
**Full documentation in Conversation agent** (`Management/Dev Agents/Conversation/CONTEXT.md`).

Backend owns the infrastructure that conversation uses:
- RAG system (rag.ts, seedKnowledge.ts) — conversation injects RAG context per message
- DB tables: `conversation_messages`, `user_chat_summaries`, `conversation_state`
- API routes: `POST /new-chat/message`, `GET /new-chat/status/:user_id`
- `safeOutputLayer.ts` — returns user-safe trait data for chat/insights

When changing RAG infrastructure or DB schema, coordinate with Conversation agent.

---

## Analysis System
**Full documentation in Analysis agent** (`Management/Dev Agents/Analysis/CONTEXT.md`).

Backend owns the infrastructure that analysis uses:
- DB tables: `trait_definitions`, `user_traits`, `look_trait_definitions`, `user_look_traits`, `analysis_runs`
- API routes: admin reanalyze endpoints, analysis run viewer
- Token tracking (`tokenTracker.ts`)

When changing trait_definitions schema or adding DB columns, coordinate with Analysis agent.

---

## Auth System
- Supabase: Google OAuth + Apple Sign-In (future) + Magic Link + OTP (6-digit, 10min)
- `requireAuth`: JWT verification for user routes
- `requireUserAuth`: JWT + user ID match + admin bypass
- `requireAdmin`: JWT + email whitelist (ADMIN_EMAILS from auth.ts)
- Public routes: `/cities`, `/enum-options`, `/login`, `/register`, `/auth/*`, `/health`

---

## Database
- Schema: `backend/src/schema.pg.ts` (CREATE TABLE + ALTER TABLE migrations)
- New columns require BOTH: CREATE TABLE definition + ALTER TABLE migration block
- Key tables: users, trait_definitions, user_traits, look_trait_definitions, user_look_traits, conversation_messages, user_chat_summaries, candidate_matches, matches, analysis_runs, knowledge_chunks, pipeline_jobs, system_activity_log, notification_log, error_logs, bug_reports, fcm_tokens

---

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Express server, ALL API routes (~2200 lines) |
| `backend/src/schema.pg.ts` | PostgreSQL schema + migrations |
| `backend/src/db.pg.ts` | Database connection pool |
| `backend/src/auth.ts` | Auth middleware + ADMIN_EMAILS |
| `backend/src/rag.ts` | RAG embedding + search + live state |
| `backend/src/seedKnowledge.ts` | Knowledge chunk management |
| `backend/src/notifications.ts` | notifyUser, sendPushOnly, STAGING_URL guard |
| `backend/src/openai.ts` | OpenAI client wrapper |
| `backend/src/tokenTracker.ts` | Token usage tracking per user/action |
| `backend/src/matchStage1.ts` | Candidate filtering |
| `backend/src/matchStage2.ts` | Scoring algorithm |
| `agents/analysis/*` | **→ Analysis agent** |
| `backend/src/cognitiveScore.ts` | **→ Analysis agent** |
| `backend/src/safeOutputLayer.ts` | **→ Analysis agent** |
| `agents/conversation/*` | **→ Conversation agent** |

---

## Environments
| Environment | Branch | DB | Domain |
|-------------|--------|-----|--------|
| Production | main | nozomi.proxy.rlwy.net:32470 | joinone.io |
| Staging | staging | zephyr.proxy.rlwy.net:19134 | *.up.railway.app |
| Local dev | - | staging DB (zephyr) | localhost:3000/3001 |

---

## HEIC Auto-Conversion
- On photo upload: if ext is .heic/.heif or mimetype is image/heic → convert to JPEG (90% quality via `heic-convert`)
- Replaces original file, updates filename/mimetype in DB
- Existing HEIC files NOT retroactively converted — users need to re-upload
- `sharp` on Railway lacks libheif codec → using `heic-convert` (pure JS) instead

## Security
- All 22 `/users/:id` routes → `requireUserAuth`
- All 65 `/admin/*` routes → `requireAdmin`
- Error logging: `error_logs` table + frontend auto-reports + backend unhandled exceptions
- Input validation: name 1-50, age 18-120, height 100-250, gender enum, message max 5000

### Security Audit (Sep 2026)
- Full audit 2026-09-23/24 + external pentest (0 exploits, 1,483+ requests)
- Fixed: set-primary endpoint unprotected, pending-rating IDOR, profile_complete user-editable, auth rate limiting
- **Open**: signed URLs for /uploads, NaN param validation, per-user rate limit on messaging

---

## Important Coding Rules
- **Cancelled matches shown to users**: any query returning cancelled matches to users MUST filter by `match_card_sent_at IS NOT NULL` — otherwise admin-cancelled potential_matches appear as "past matches"
- **Schema changes**: need both CREATE TABLE definition + ALTER TABLE migration block in schema.pg.ts

## Known Issues
- **Hard delete**: FK constraints block user deletion — workaround via bug report
- **RAG scaling**: reconcileInsightChunks without LIMIT (affects Conversation agent)
- **Trans filter**: passesSexualIdentityFilter blocks trans users completely

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `CLAUDE.md` — full architecture reference
4. `WORK_LOG.md` — latest session
5. `Management/claude-working-guidelines.md` — deploy/staging/prompt safety rules

## Rules
- **seedKnowledge.ts must be updated** with any feature change that affects user-facing info — coordinate with Conversation agent
- **Schema changes** need both CREATE TABLE + ALTER TABLE blocks
- **STAGING_URL check** in every new notification function
- **Conversation/prompt changes** → redirect to Conversation agent (`Management/Dev Agents/Conversation/`)
