# Backend Dev Agent — Context

## Role
אחראי על תשתית ה-backend: Express server, API routes, DB schema, auth, RAG system, AI agents (conversation + analysis), notifications, וכל מה שלא pipeline/cron (שזה סוכן Automation).

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

## Conversation System (Love Agent)

### Micro-Topic State Machine (`agents/conversation/chatManager.ts`)
```
User message → buildChatPrompt()
  → detectIntent() → "profile" | "system" | "general"
  → ConversationState (from DB): current_topic_index, turn_in_topic, closing_stage
  ↓
profile → Prompt C (answer about self, ask to continue)
system  → Prompt C (answer system question)
closing_stage 1 → Prompt E Insight
closing_stage 2 → Prompt E Final
closing_stage 3 → Prompt D (already closed)
general, turn 0 → Prompt A (required opening question from micro-topic)
general, turn 1 → Prompt B (follow-up, advance to next topic)
```

14 micro-topics, 5 prompt templates (A-E), context injected via RAG when needed.

### Chat Channels
| Channel | Guide value | Description |
|---------|-------------|-------------|
| General | `new_chat` | Main personality conversation |
| Cognitive | `new_chat_cognitive` | Thinking style simulation (27 questions, ~6 per session) |
| Taste Test | `new_chat_taste` | React to 13 profiles (gender-matched profile bank) |
| QA channels | `qa_*` | System questions, insights, status, refinement |

### Agent Context System
- `agent_context` TEXT per-user — injected into prompts
- 4 system config keys: `system_summary_general`, `_male`, `_female`, `_female_ff`
- Injection: QA channels always, general/cognitive/taste only if in_matching_pool
- **Closed-world rule**: AI must NOT invent details about match candidates

### Summarizer (`agents/conversation/summarizer.ts`)
- Every 8 messages → structured JSON extraction → `user_chat_summaries`
- Triggers auto-analysis when thresholds met

---

## Analysis System (`agents/analysis/agent.ts`)
- 7 prompt groups run sequentially
- Extracts 60+ personality traits from all conversation transcripts
- Two auto-analysis runs: #1 when general closes, #2 when all channels done
- `analysis_run_count` column tracks runs (max 2 auto)
- Raw output saved to `analysis_runs` table

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
| `backend/src/safeOutputLayer.ts` | User-safe data (MBTI, values, Big Five) |
| `backend/src/matchStage1.ts` | Candidate filtering |
| `backend/src/matchStage2.ts` | Scoring algorithm |
| `backend/src/cognitiveScore.ts` | Cognitive profile computation |
| `agents/conversation/chatManager.ts` | Micro-topic state machine |
| `agents/conversation/microTopics.ts` | 14 micro-topics with questions |
| `agents/conversation/promptTemplates.ts` | Prompt A/B/C/D/E builders |
| `agents/conversation/summarizer.ts` | Structured summary extraction |
| `agents/conversation/autoAnalysis.ts` | Two-run auto-analysis |
| `agents/analysis/agent.ts` | Grouped AI analysis (7 prompt groups) |

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
- **RAG scaling**: reconcileInsightChunks without LIMIT
- **Reanalysis per-group**: global last_analysis_at masks other groups
- **Trans filter**: passesSexualIdentityFilter blocks trans users completely

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `CLAUDE.md` — full architecture reference
4. `WORK_LOG.md` — latest session
5. `Management/claude-working-guidelines.md` — deploy/staging/prompt safety rules

## Rules
- **seedKnowledge.ts must be updated** with any feature change that affects user-facing info
- **Schema changes** need both CREATE TABLE + ALTER TABLE blocks
- **Prompt changes**: staging first, minimal changes, prefer chatManager logic over prompt text
- **SYSTEM_IDENTITY** must be in every chat prompt (anti-referral, system name, link)
- **Closed-world**: AI must never invent candidate details
- **STAGING_URL check** in every new notification function
