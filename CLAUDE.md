# CLAUDE.md — MatchMe Project Context

## Project Purpose
MatchMe is a matchmaking platform that uses AI conversations to build deep personality profiles, then matches users based on multi-dimensional compatibility scoring. Users chat naturally (in Hebrew), the system analyzes their personality traits, values, and communication style, then runs a matching algorithm to find compatible partners.

## Tech Stack
- **Backend**: Node.js + Express + TypeScript (port 3001 dev / PORT env in prod)
- **Frontend**: React 18 + Vite (port 3000 dev, served statically by backend in prod)
- **Mobile**: React Native / Expo (separate app, shares backend)
- **AI**: OpenAI GPT-4o for conversation and trait analysis, GPT-4o-mini for summarization
- **Database**: PostgreSQL (production, Railway) + SQLite (legacy dev, being phased out)
- **Deployment**: Railway

## Architecture Overview

### Four Main Systems
1. **Conversation System** (`agents/conversation/`) — AI chat with users, RAG-based topic flow, cognitive mode, taste test mode
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
Summary complete (≥5 fields) + cognitive (≥5 msgs) → auto-analysis triggers
         ↓
Analysis agent → user_traits (DB) → matching → candidate_matches → matches
```

### Frontend Routing
No React Router — uses state-based view switching in `App.tsx`:
- `View` type: "landing" | "register" | "login" | "welcome" | "dashboard" | "new_chat" | "admin" | etc.
- Admin access: URL hash `#admin-secure-access-2026-chen`

### New Chat (Primary User Interface)
- `NewChat.tsx` — Main user-facing screen with sidebar + chat
- Sub-screens rendered inside NewChat: ProfileEdit, Insights, BugReport, Settings
- Sidebar always visible (toggle on mobile)
- `chatManager.ts` — RAG-based intent detection + topic flow + taste test
- **Each channel has separate history** — `Record<string, Message[]>` keyed by channel name
- Channel state tracks current mode: `new_chat` (general), `new_chat_cognitive`, or `new_chat_taste`
- Home screen shows expert recommendations when cognitive or taste info is missing
- No mid-conversation channel switching — user navigates via home screen bubbles
- AI suggests navigating to cognitive/taste bubbles when conditions are met

### Chat Manager (RAG Architecture)
```
User message → detectIntent() → "profile" | "system" | "general"
                    +
              getCurrentTopic(summary, history, message) → "intro" | "relationships" | "values" | "culture"
  ↓
profile → inject safe profile data OR conversation summary (if no analysis yet)
system  → inject system info
general → base prompt + current topic guidance (one topic at a time) + suggest cognitive/taste bubble
cognitive channel → cognitive prompt (separate history)
taste channel → taste prompt + one profile from bank (separate history)
```

### Topic-Based Conversation Flow
Driven by summary coverage (not message count). Each topic's prompt injected only when active:
- **intro** → covers: general_info, occupation → then moves to relationships
- **relationships** → covers: relationships field → then moves to values
- **values** → covers: values field → then moves to culture
- **culture** → covers: background_culture, social_style, taste_and_style → suggest cognitive when done

### Cognitive Mode
- Triggered by clicking "בוא נבין את סגנון החשיבה שלי" bubble on home screen
- General chat suggests navigating to this bubble when summary has ≥5 fields + no cognitive done yet
- **Separate chat history** — independent from general chat
- 27 simulation/thinking questions across 7 categories
- Messages saved with `guide = 'new_chat_cognitive'`
- Re-entry support: if user leaves and comes back, reminds of last unanswered question

### Taste Test Mode
- Triggered by clicking "נתח את הטעם שלי" bubble on home screen or sidebar
- General chat suggests navigating to this bubble after cognitive is done
- **Separate chat history** — independent from general chat
- Channel: `new_chat_taste`, messages saved with `guide = 'new_chat_taste'`
- 24 synthetic profiles per gender, parsed into arrays at startup
- **One profile per prompt** (~80 tokens) — not entire bank (~5000 tokens)
- Curated diverse selection: 8 profiles per session covering different styles
- 3 phases: intro (msg 0) → profile presentation (msg 1-7) → summary (msg 8+)
- Gender handling: matches `looking_for_gender`; "both" alternates male/female; unset → asks user
- Re-entry support: if user leaves and comes back, reminds of last unanswered profile

### Summarization System
- **`summarizer.ts`** — Runs every 8 user messages (first at 6)
- Uses GPT-4o-mini (cheap, fast, async — non-blocking)
- Extracts 9 fields: general_info, occupation, background_culture, social_style, taste_and_style, relationships, values, intellectual_world, notable_quotes
- Updates existing summary (doesn't rebuild from scratch)
- Stored in `user_chat_summaries` table (JSONB)

### Auto-Analysis
- **`autoAnalysis.ts`** — Triggers once when conditions met:
  1. Summary has ≥5 of 8 content fields filled
  2. ≥5 user messages in cognitive chat
  3. `auto_analyzed` flag is false
- Runs full analysis in background (all 8 prompt groups)
- Sets `users.auto_analyzed = TRUE` to prevent re-runs
- Includes all chat types in transcript (interviewer + psychologist + new_chat%)

## Key Folders & Files

### Backend (`backend/src/`)
| File | Purpose |
|------|---------|
| `index.ts` | Express server, ALL API routes (~2100 lines) |
| `matchStage1.ts` | Candidate filtering (age, gender, location, cognitive) |
| `matchStage2.ts` | Scoring: internal (Gaussian σ=12), external (visual traits), per-category |
| `cognitiveScore.ts` | Cognitive profile computation (normalized 10-90 → 0-100) |
| `safeOutputLayer.ts` | Returns only user-safe data (MBTI, values, Big Five) for chat/insights |
| `agents/analysis/agent.ts` | Grouped AI analysis (7 prompt groups run sequentially) |
| `agents/conversation/chatManager.ts` | RAG router: intent + topic flow + cognitive + taste test |
| `agents/conversation/summarizer.ts` | Structured summary extraction from chat history |
| `agents/conversation/autoAnalysis.ts` | Auto-triggers full analysis when conditions met |
| `agents/conversation/orchestrator.ts` | Conversation orchestrator + transcript builder (all chat types) |
| `schema.pg.ts` | PostgreSQL schema + migrations (authoritative) |
| `seedNewTraits.ts` | Trait definitions source of truth |

### Prompt Files
| File | Used by | Injected when |
|------|---------|---------------|
| `conversation/prompts/new-chat-base.txt` | Base conversation prompt | Always (slim — ~500 tokens) |
| `conversation/prompts/topic-intro.txt` | Topic: background, occupation | Summary missing general_info/occupation |
| `conversation/prompts/topic-relationships.txt` | Topic: what looking for, past | Summary missing relationships |
| `conversation/prompts/topic-values.txt` | Topic: values, positions | Summary missing values |
| `conversation/prompts/topic-culture.txt` | Topic: taste, culture, social | Summary missing culture fields |
| `conversation/prompts/cognitive-chat.txt` | Cognitive simulation questions | Cognitive channel only |
| `conversation/prompts/taste-test-chat.txt` | Taste test system prompt | Taste channel only |
| `conversation/prompts/taste-profiles-female.txt` | 24 female profiles (parsed) | One per taste test turn |
| `conversation/prompts/taste-profiles-male.txt` | 24 male profiles (parsed) | One per taste test turn |
| `conversation/prompts/context-profile.txt` | Profile data context | User asks about self |
| `conversation/prompts/context-system-info.txt` | System info context | User asks about the system |
| `analysis/prompts/*.txt` | 8 analysis prompts | During analysis runs |

### Frontend (`frontend/src/`)
| File | Purpose |
|------|---------|
| `App.tsx` | Main router, auth, view state |
| `NewChat.tsx` | Primary UI: sidebar + chat + sub-screens + channel state + recommendations |
| `AdminView.tsx` | Admin panel (~2800 lines) |
| `Insights.tsx` | User-facing personality insights (with empty state message) |
| `ProfileEdit.tsx` | Personal details form |

## Database Tables (Key)
- `users` — Registration + system fields (is_matchable, cognitive_score, auto_analyzed, etc.)
- `trait_definitions` — 60+ trait configs (trait_group, weight, calc_type, sensitivity)
- `user_traits` — Per-user scores (score 0-100, confidence 0-1)
- `look_trait_definitions` — External/visual trait configs
- `user_look_traits` — Manual visual scores (appeal, fitness, etc.)
- `conversation_messages` — All chat history (guide field distinguishes chat types)
- `user_chat_summaries` — Structured JSON summary per user (summary_json JSONB, message_count_at)
- `candidate_matches` — Matching results with per-category scores
- `matches` — Final match pairs with status workflow

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
- **DO NOT modify the old frontend/dashboard/chat** — it still exists alongside NewChat
- **DO NOT modify the analysis agent** when changing conversation flow
- **Manual look traits** (source='manual') must survive reset-analysis and reanalyze
- **All chat types** (interviewer, psychologist, new_chat%) are now included in analysis transcripts
- **Cognitive score** is computed only in `cognitiveScore.ts` — single source of truth
- **MBTI Thinking gets +10** before comparing with Feeling (conversation bias correction)
- **auto_analyzed flag** prevents auto-analysis from running more than once
- **Prompts are slim** — base prompt ~500 tokens, topic/context injected via RAG only when needed
- **Taste test profiles** — one per prompt turn (~80 tokens), never inject entire bank
- **No mid-conversation channel switching** — each channel is independent; AI suggests navigating to bubbles
- **DO NOT use real users for testing** — always create fresh test users via `/api/register`

## API Endpoints (New Chat)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/new-chat/message` | Send message, get reply. Channel determines guide (no auto-switching) |
| GET | `/new-chat/status/:user_id` | Returns `has_cognitive`, `has_taste_info` for home screen recommendations |

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
- `NODE_ENV` — production enables SSL for PG

## Common Issues
- Node version must be 18+ (nvm: `nvm use 22`)
- `npx tsc` may fail if wrong Node version active — use `node_modules/.bin/tsc`
- Frontend build must run from `frontend/` directory
- New DB columns require both: schema.pg.ts CREATE TABLE + ALTER TABLE migration block
- Prompt files loaded at startup via `fs.readFileSync` — restart needed after changes
