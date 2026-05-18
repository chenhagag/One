# CLAUDE.md — One Project Context

## Project Purpose
One (formerly MatchMe) is a matchmaking platform that uses AI conversations to build deep personality profiles, then matches users based on multi-dimensional compatibility scoring. Users chat naturally (in Hebrew), the system analyzes their personality traits, values, and communication style, then runs a matching algorithm to find compatible partners.

## Tech Stack
- **Backend**: Node.js + Express + TypeScript (port 3001 dev / PORT env in prod)
- **Frontend**: React 18 + Vite + inline styles (port 3000 dev, served statically by backend in prod)
- **Mobile**: PWA (Progressive Web App) — manifest.json + service worker
- **AI**: OpenAI GPT-4o for conversation and trait analysis, GPT-4o-mini for summarization
- **Database**: PostgreSQL (production, Railway)
- **Deployment**: Railway (auto-deploy from GitHub push)
- **File Storage**: Railway Volume at `/app/data/uploads` (production), local `uploads/` (dev)

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
- `View` type: "landing" | "register" | "login" | "welcome" | "pwa_install" | "new_chat" | "admin" | etc.
- Admin access: URL hash `#admin-secure-access-2026-chen`

### New Chat (Primary User Interface)
- `NewChat.tsx` — Main user-facing screen with sidebar + chat
- Sub-screens: ProfileEdit, Insights, BugReport, Settings, ProfileView, CoupleInsights
- Sidebar always visible (toggle on mobile)
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
| `ProfileEdit.tsx` | Personal details form |
| `Register.tsx` | Registration form |

## Database Tables (Key)
- `users` — Registration + system fields (is_matchable, cognitive_score, auto_analyzed, analysis_run_count, couple_insights, partner_name, etc.)
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

## Environment Variables
- `OPENAI_API_KEY` — Required
- `DATABASE_URL` — PostgreSQL connection string (Railway)
- `PORT` — Server port (default 5000)
- `NODE_ENV` — production enables SSL for PG + Railway Volume path

## Common Issues
- Node version must be 18+ (nvm: `nvm use 22`)
- Frontend build must run from `frontend/` directory
- New DB columns require both: schema.pg.ts CREATE TABLE + ALTER TABLE migration block
- Prompt files loaded at startup via `fs.readFileSync` — restart needed after changes
- Uploads proxy needed in vite.config.ts for dev (`/uploads` → localhost:3001)
- `saveConversationState` must be awaited or closing_stage gets lost

## Version History
- `v0.9-pre-mvp` — Last stable version before MVP UI overhaul (tag on GitHub)
