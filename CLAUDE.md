# CLAUDE.md — One Project Context

## Project Purpose
One (formerly MatchMe) is a matchmaking platform that uses AI conversations to build deep personality profiles, then matches users based on multi-dimensional compatibility scoring. Users chat naturally (in Hebrew), the system analyzes their personality traits, values, and communication style, then runs a matching algorithm to find compatible partners.

## Tech Stack
- **Backend**: Node.js + Express + TypeScript (port 3001 dev / PORT env in prod)
- **Frontend**: React 18 + Vite + inline styles (port 3000 dev, served statically by backend in prod)
- **Mobile**: PWA (Progressive Web App) — manifest.json + service worker
- **Auth**: Supabase (Google OAuth + Magic Link) — JWT verified on backend
- **AI**: OpenAI GPT-4o for conversation and trait analysis, GPT-4o-mini for summarization
- **Database**: PostgreSQL (production, Railway)
- **Deployment**: Railway (auto-deploy from GitHub push) — `main` → production, `staging` → staging
- **File Storage**: Railway Volume at `/app/data/uploads` (production), local `uploads/` (dev)
- **Rate Limiting**: `express-rate-limit` — 300 req/15min general, 30 req/min AI routes

## Architecture Overview

### Four Main Systems
1. **Conversation System** (`agents/conversation/`) — AI chat with micro-topics + prompt templates, cognitive mode, taste test mode
2. **Summarization System** (`agents/conversation/summarizer.ts`) — Extracts structured user info from chat, triggers auto-analysis
3. **Analysis System** (`agents/analysis/`) — Extracts 60+ personality traits from conversation transcripts (all chat types)
4. **Matching System** (`matchStage1.ts`, `matchStage2.ts`) — Two-stage filtering + scoring algorithm

### Data Flow
```
User chats (new_chat) → conversation_messages (DB)
         ↓
Every 8 msgs → summarizer → user_chat_summaries (structured JSON)
         ↓
User does cognitive chat (new_chat_cognitive) → conversation_messages (DB)
User does taste test (new_chat_taste) → conversation_messages (DB)
         ↓
General chat closes → auto-analysis run #1
All channels done → auto-analysis run #2
         ↓
Analysis agent → user_traits (DB) → matching → candidate_matches → matches
```

### Frontend Routing
No React Router — uses state-based view switching in `App.tsx`:
- `View` type: "landing" | "register" | "welcome" | "pwa_install" | "new_chat" | "admin" | "auth" | "auth_callback" | "profile_setup" | "consent" | etc.
- Admin access: URL hash `#admin-secure-access-2026-chen` + must be logged in as `chen.hagag@gmail.com` (prod/staging only, localhost unrestricted)

### New Chat (Primary User Interface)
- `NewChat.tsx` — Main user-facing screen with sidebar + chat
- Sub-screens: ProfileEdit (includes photos), Insights, Feedback ("עזרו לנו להשתפר"), Settings, CoupleInsights
- Sidebar always visible (toggle on mobile), mobile header has user avatar for logout
- `chatManager.ts` — Micro-topic state machine + prompt templates + intent detection
- **Each channel has separate history** — `Record<string, Message[]>` keyed by channel name
- Home screen shows expert recommendations (reloads on every visit)
- Post-close bubbles for incomplete channels

### Conversation Architecture — Micro-Topics + Prompt Templates
```
User message → buildChatPrompt()
  → detectIntent() → "profile" | "system" | "general"
  → ConversationState (from DB): current_topic_index, turn_in_topic, closing_stage
  ↓
profile → Prompt C (answer about self, ask to continue)
system  → Prompt C (answer system question)
closing_stage 1 → Prompt E Insight (give user insight)
closing_stage 2 → Prompt E Final (farewell)
closing_stage 3 → Prompt D (already closed)
general, turn 0 → Prompt A (required opening question from micro-topic)
general, turn 1 → Prompt B (follow-up, then advance to next topic)
```

**14 Micro-Topics**: general, career_basics, career_deep, relationship_past, relationship_patterns, personality_general, personality_conflict, family, fun_lifestyle, values_beliefs, values_openness, culture, culture_interests, social

**5 Prompt Templates**:
- **A**: New question — AI must ask the specific required question
- **B**: Follow-up — only for clarification/deepening
- **C**: System/meta question — answer briefly, ask to continue
- **D**: Post-close — respond briefly, no new questions
- **E**: Closing insight + final farewell (two stages)

### Cognitive Mode
- Triggered by clicking "בוא נבין את סגנון החשיבה שלי" bubble
- **Separate chat history** — full history sent to OpenAI (prevents question repetition)
- 27 simulation questions in bank, AI picks ~6 per session
- Closing threshold: 7 user messages (6 questions + intro)
- Messages saved with `guide = 'new_chat_cognitive'`

### Taste Test Mode
- Triggered by clicking "נתח את הטעם שלי לעומק" bubble
- **All 13 selected profiles injected into every prompt** — AI picks next from list
- Profile counting: scans history for names matching actual profile bank
- Mid-summary after 6 profiles + "want to continue?" option
- 4 profile files: female, female-ff (same-sex), male, male-mm (same-sex)
- Profile bank selected by `gender` + `looking_for_gender`
- Full history sent to OpenAI always
- Messages saved with `guide = 'new_chat_taste'`

### Conversation Closing
- **State machine**: closing_stage 0→1 (insight)→2 (final)→3 (done)
- **closingStage returned in API response** — frontend shows bubbles
- **saveConversationState is awaited** (not fire-and-forget)
- **General chat**: closing_stage from DB (reliable)
- **Cognitive/taste**: closingStage from threshold logic
- **Post-close bubbles**: show incomplete channels after conversation ends

### Expert Recommendations (Home Screen)
- **Reloads on every home screen visit** (useEffect on `screen === "home"`)
- Priority: (1) "בוא נמשיך" if chat incomplete, (2) cognitive, (3) taste, (4) all-done message
- Respects `closedChannels` — loaded from API on mount
- All-done: thank message + conditional photo/profile prompt

### Auto-Analysis (Two Runs)
- **Run 1**: When general chat closes (closing_stage ≥ 3) — even without cognitive/taste
- **Run 2**: When all channels done (cognitive ≥5 + taste ≥5)
- Max 2 automatic runs (tracked via `analysis_run_count` column)
- Saves raw output to `analysis_runs` table (visible in admin)

### Couple Tester Support
- `COUPLE_TESTER_INSTRUCTION` injected when `test_user_type === "Couple Tester"`
- Adapts questions: "before your current relationship" instead of assuming single
- **Couple Insights**: `couple_insights TEXT` column — long-form relationship insights
- User sees "כרטיס התאמה" button in sidebar when insights exist

### Consent System
- **General consent** (`ConsentScreen.tsx`): shown after registration, before entering app
  - `consent_accepted BOOLEAN DEFAULT FALSE` — blocks access until accepted
  - Gender-adapted Hebrew text (תשתפי/תשתף, מאשרת/מאשר)
- **Photo upload consent** (modal in `ProfileView`): shown on first photo upload
  - Checkbox 1 (required): profile display consent
  - Checkbox 2 (optional): AI analysis consent → `photo_ai_consent` field
  - Changeable later in Settings screen

### Settings Screen
- Photo AI consent toggle (loads from DB)
- Email updates toggle (default: on, `email_updates`)
- WhatsApp updates toggle + phone input (default: off, `whatsapp_updates`, `whatsapp_phone`)
- Delete account with double confirmation
- All toggles auto-save on change (no save button)

### Feedback Screen ("עזרו לנו להשתפר")
- Category chips: 🐛 bug / 💡 idea / 💬 general / ⚙️ request
- Dynamic textarea placeholder per category
- Category stored as `[bug]`/`[idea]`/`[general]`/`[request]` prefix in `report_text`
- Admin: filter by category, badge per report

### Matching Pool
- `in_matching_pool BOOLEAN DEFAULT FALSE` — manual admin control
- `matchStage1.ts` filters by `in_matching_pool = TRUE` (in addition to `is_matchable`)
- Admin: "כניסה למאגר" / "הוצאה מהמאגר" toggle per user
- Future: will auto-set when `is_matchable` becomes true

### Match Card System
- **Consent**: `match_card_consent` ('approved'/'declined'/null) + `match_card_restrictions` (free text) on users table
- **Card data**: `match_card_data` (JSONB), `match_card_approved_by_admin`, `match_card_sent_at` on matches table
- **Card structure**: `{ introSummary, connectionPoints[{title,text}], dateIdea, caveat, closing }`
- **Admin flow**: "שלח התאמה" → pre_match → card entered via API → "בדיקת כרטיס" preview → edit/approve → send
- **User flow**: consent screen in sidebar → home celebration banner when card sent → view card
- **Card writing**: done manually by Claude reading both users' transcripts + traits, NOT auto-generated by GPT
- **IMPORTANT — Before writing a card**: check `match_card_restrictions` for BOTH users. If a user specified restrictions (things they don't want shown), respect them strictly. If a user declined consent (`match_card_consent = 'declined'`), the card must only include basic info: name, age, city, photo — NO conversation-derived content.
- **Card writing style rules**:
  - Use first names (e.g. "נדב", "דנית"), NEVER "הוא"/"היא"
  - introSummary must start with a brief personal intro of each person before describing the connection
  - Never reveal details from past relationships (breakups, lessons learned from exes, relationship history)
- **Direct messaging**: `direct_messages` table, `typing_status` table, `blocked_by` on matches. Reports saved to `bug_reports` with `[match_report]` prefix.

### Location Filtering (Regions)
- 9 regions: גוש דן, שרון, עמקים-חוף, שפלה-מרכז, ירושלים, דרום-מערב, דרום-נגב, כרמל-חיפה, צפון
- Cities can belong to multiple regions (e.g. הרצליה → גוש דן + שרון)
- `my_city` = exact city match, `my_area` = same region, `bit_further` = region + neighbors, `whole_country` = all
- "Run Expanded" button: age +2 years + location bumped one level

### Rate Limiting
- General: 300 requests / 15 min per IP (admin routes excluded)
- AI: 30 requests / min per IP on OpenAI routes (`/new-chat/message`, `/analyze`, `/analyze-profile`, admin reanalyze/cognitive-test)

### PWA Support
- `manifest.json` + minimal `sw.js` for installability
- `PWAInstallFlow` component: Android native prompt / iOS Safari guide
- Desktop: welcome text without install instructions
- Mobile login also shows PWA install screen
- Standalone mode: auto-skip to main app

## Key Folders & Files

### Backend (`backend/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | Express server, ALL API routes (~2200 lines) |
| `matchStage1.ts` | Candidate filtering (age, gender, location, cognitive) |
| `matchStage2.ts` | Scoring: internal (Gaussian σ=12), external (visual traits), per-category |
| `cognitiveScore.ts` | Cognitive profile computation (normalized 10-90 → 0-100) |
| `safeOutputLayer.ts` | Returns only user-safe data (MBTI, values, Big Five) for chat/insights |
| `agents/analysis/agent.ts` | Grouped AI analysis (7 prompt groups run sequentially) |
| `agents/conversation/chatManager.ts` | Micro-topic state machine + prompt templates + taste test |
| `agents/conversation/microTopics.ts` | 14 micro-topics with opening questions + follow-ups |
| `agents/conversation/promptTemplates.ts` | Prompt A/B/C/D/E template builders |
| `agents/conversation/summarizer.ts` | Structured summary extraction from chat history |
| `agents/conversation/autoAnalysis.ts` | Two-run auto-analysis system |
| `agents/conversation/analysisHelpers.ts` | Transcript builder + coverage computation |
| `schema.pg.ts` | PostgreSQL schema + migrations (authoritative) |
| `tokenTracker.ts` | Token usage tracking per user/action |

### Prompt Files
| File | Used by | Injected when |
|------|---------|---------------|
| `conversation/prompts/new-chat-base.txt` | Base conversation prompt | Not used by chatManager (replaced by templates) |
| `conversation/prompts/cognitive-chat.txt` | Cognitive simulation questions | Cognitive channel only |
| `conversation/prompts/taste-test-chat.txt` | Taste test system prompt | Taste channel only |
| `conversation/prompts/taste-profiles-female.txt` | 13 female profiles | Taste test for men seeking women |
| `conversation/prompts/taste-profiles-male.txt` | 13 male profiles | Taste test for women seeking men |
| `conversation/prompts/taste-profiles-female-ff.txt` | Same-sex female profiles | Taste test for women seeking women |
| `conversation/prompts/taste-profiles-male-mm.txt` | Same-sex male profiles | Taste test for men seeking men |
| `conversation/prompts/context-profile.txt` | Profile data context | User asks about self |
| `conversation/prompts/context-system-info.txt` | System info context | User asks about the system |
| `analysis/prompts/*.txt` | 8 analysis prompts | During analysis runs |

### Frontend (`frontend/src/`)
| File | Purpose |
|------|---------|
| `App.tsx` | Main router, auth, view state |
| `NewChat.tsx` | Primary UI: sidebar + chat + sub-screens + recommendations |
| `PWAInstallFlow.tsx` | PWA installation flow (mobile/desktop) |
| `AdminView.tsx` | Admin panel (~3000 lines) |
| `Insights.tsx` | User-facing personality insights |
| `ProfileEdit.tsx` | Personal details + photos + preferences (merged profile screen) |
| `Register.tsx` | Registration form (legacy) |
| `AuthScreen.tsx` | Google + Apple OAuth + Magic Link login |
| `AuthCallback.tsx` | OAuth/Magic Link redirect handler + expired link resend |
| `ProfileSetup.tsx` | Post-OAuth "נתוני פתיחה" — name, age, city, gender, status |
| `ConsentScreen.tsx` | Terms/privacy/AI consent screen |
| `lib/supabase.ts` | Supabase client init |
| `lib/api.ts` | Fetch wrapper with JWT auth |

## Database Tables (Key)
- `users` — Registration + system fields (is_matchable, in_matching_pool, cognitive_score, auto_analyzed, analysis_run_count, couple_insights, partner_name, consent_accepted, photo_ai_consent, email_updates, whatsapp_updates, whatsapp_phone, supabase_uid, auth_provider, profile_complete)
- `trait_definitions` — 60+ trait configs (trait_group, weight, calc_type, sensitivity)
- `user_traits` — Per-user scores (score 0-100, confidence 0-1)
- `look_trait_definitions` — External/visual trait configs
- `user_look_traits` — Manual visual scores (appeal, fitness, etc.)
- `conversation_messages` — All chat history (guide field distinguishes chat types)
- `user_chat_summaries` — Structured JSON summary per user (summary_json JSONB, topic_injection_counts JSONB for conversation state)
- `candidate_matches` — Matching results with per-category scores
- `matches` — Final match pairs with status workflow
- `analysis_runs` — Raw analysis output (stage_a_output, stage_b_output)
- `user_photos` — Uploaded photos (files on Railway Volume)
- `token_usage` — Token tracking per user/action

### Guide Values in conversation_messages
| guide | Chat type | Included in analysis |
|-------|-----------|---------------------|
| `interviewer` | Old lab/personality chat | Yes (Part 1) |
| `psychologist` | Old depth chat | Yes (Part 2) |
| `new_chat` | New general chat | Yes (Part 3) |
| `new_chat_cognitive` | Cognitive simulation questions | Yes (Part 3, with new_chat) |
| `new_chat_taste` | Taste test profile reactions | Yes (Part 3, with new_chat) |

## Matching Algorithm Details

### Score Formula
- **Trait similarity**: Gaussian `100 × e^(-(diff²)/(2×12²))` — σ=12
- **Internal score**: Weighted average across all traits
- **External score**: Weighted visual similarity (Appeal×3, Fitness×3, Femininity×2, rest×1)
- **Final score**: 70% internal + 30% external (65/35 for appearance-sensitive users)

### Profile Score (per-category weighted)
Cognitive(×3), External(×3), Communication(×2), Emotional-Social(×1), Big Five(×1), Schwartz(×1), Style(×1), Emotionality(×0.5), MBTI(×0.5), Popularity(×0.25), Vibe(×0.25)

### Gender Adjustments
- Emotionality: male gets +10 bonus (50% trait-by-trait, 50% profile average comparison)
- Emotional-Social: male gets +4 bonus (same hybrid approach)

## Important Constraints
- **DO NOT modify the analysis agent** when changing conversation flow
- **Manual look traits** (source='manual') must survive reset-analysis and reanalyze
- **All chat types** (interviewer, psychologist, new_chat%) are included in analysis transcripts
- **Cognitive score** is computed only in `cognitiveScore.ts` — single source of truth
- **MBTI Thinking gets +10** before comparing with Feeling (conversation bias correction)
- **Prompts are slim** — prompt templates ~200 tokens each, context injected via RAG only when needed
- **Taste test profiles** — all 13 injected into prompt (~1000 tokens), AI picks from list
- **No mid-conversation channel switching** — each channel is independent
- **DO NOT use real users for testing** — always create fresh test users
- **DO NOT git add/commit/push unless explicitly asked**
- **saveConversationState must be awaited** — fire-and-forget caused lost closing states
- **Frontend fetch calls MUST use `/api/` prefix** — Vite proxy routes `/api/*` to backend; without it, requests go to Vite and return HTML
- **ProfileSetup: don't pre-fill name** from OAuth/email — user must enter their own name
- **`has_profile_details`** requires age + city + at least 1 photo

## API Endpoints (Key)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/new-chat/message` | Send message, get reply + closing_stage |
| GET | `/new-chat/status/:user_id` | Recommendations, closed states, photo count |
| GET | `/users/:id/couple-insights` | Get couple insights text |
| GET | `/users/:id/photos` | List user photos |
| POST | `/users/:id/photos` | Upload photo |
| PATCH | `/admin/users/:id` | Update user fields (partner_name, couple_insights, etc.) |
| POST | `/admin/users/:id/inject-conversation` | Inject test conversation history |

## How to Run
```bash
# Backend
cd backend && cp .env.example .env  # Add OPENAI_API_KEY + DATABASE_URL
npm install && npm run dev          # Runs on :3001 (or PORT)

# Frontend
cd frontend && npm install && npm run dev  # Runs on :3000, proxies /api → :3001

# Production build
cd frontend && npm run build        # Output in dist/, served by backend
```

## Environments
- **Production**: branch `main`, domain `joinone.io`, DB at `nozomi.proxy.rlwy.net`
- **Staging**: branch `staging`, Railway auto-generated URL, DB at `zephyr.proxy.rlwy.net`
- **Local dev**: `backend/.env` points to staging DB by default
- Shared Supabase project for auth across all environments

## Environment Variables
- `OPENAI_API_KEY` — Required
- `DATABASE_URL` — PostgreSQL connection string (Railway)
- `PORT` — Server port (default 5000)
- `NODE_ENV` — production enables SSL for PG + Railway Volume path
- `SUPABASE_JWT_SECRET` — Backend: Supabase JWT verification secret
- `SUPABASE_SERVICE_ROLE_KEY` — Backend: Supabase service role key for Admin API
- `SUPABASE_URL` — Backend: Supabase project URL
- `VITE_SUPABASE_URL` — Frontend: Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Frontend: Supabase anon/public key

## Common Issues
- Node version must be 18+ (nvm: `nvm use 22`)
- Frontend build must run from `frontend/` directory
- New DB columns require both: schema.pg.ts CREATE TABLE + ALTER TABLE migration block
- Prompt files loaded at startup via `fs.readFileSync` — restart needed after changes
- Uploads proxy needed in vite.config.ts for dev (`/uploads` → localhost:3001)
- `saveConversationState` must be awaited or closing_stage gets lost

## Version History
- `v0.9-pre-mvp` — Last stable version before MVP UI overhaul (tag on GitHub)
