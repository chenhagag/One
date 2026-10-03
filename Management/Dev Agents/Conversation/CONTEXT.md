# Conversation Dev Agent — Context

## Role
אחראי על כל מערכת השיחה: צד backend (state machine, prompts, summarizer, auto-analysis, RAG injection, agent context) וצד frontend (NewChat.tsx, ערוצי צ'אט, recommendations, closing flow). זהו הדומיין הכי גדול והכי רגיש בפרויקט — שינוי לא זהיר כאן יכול לשבור את חוויית המשתמשת.

**לא כולל**: RAG infrastructure (rag.ts, seedKnowledge.ts — סוכן Backend), Analysis agent (agents/analysis/ — סוכן Backend), Matching algorithm, DB schema, Auth.

---

## Architecture — High Level

```
User message (frontend NewChat.tsx)
  → POST /api/new-chat/message
  → buildChatPrompt() (chatManager.ts)
    → detectIntent() → "profile" | "system" | "general"
    → ConversationState (from DB): current_topic_index, turn_in_topic, closing_stage
    → Select prompt template (A/B/C/D/E)
    → Inject RAG context (system + user chunks + live state)
    → Inject agent_context (if applicable)
  → OpenAI GPT-4o → response
  → Save to conversation_messages (DB)
  → Every 8 msgs → summarizer → user_chat_summaries
  → Closing detection → auto-analysis trigger
  → Response + closingStage → frontend
  → Frontend updates UI, shows post-close bubbles / recommendations
```

---

## Backend — Conversation System

### Micro-Topic State Machine (`agents/conversation/chatManager.ts`)

The core logic. Each user message goes through:

1. **detectIntent()** — classifies as "profile" (asking about self), "system" (asking about One), or "general" (normal conversation)
2. **ConversationState** — loaded from DB: `current_topic_index`, `turn_in_topic`, `closing_stage`
3. **Prompt selection** based on intent + state:

```
profile → Prompt C (answer about self, ask to continue)
system  → Prompt C (answer system question)
closing_stage 1 → Prompt E Insight (give user insight)
closing_stage 2 → Prompt E Final (farewell)
closing_stage 3 → Prompt D (already closed)
general, turn 0 → Prompt A (required opening question from micro-topic)
general, turn 1 → Prompt B (follow-up, then advance to next topic)
```

### 14 Micro-Topics (`agents/conversation/microTopics.ts`)
general, career_basics, career_deep, relationship_past, relationship_patterns, personality_general, personality_conflict, family, fun_lifestyle, values_beliefs, values_openness, culture, culture_interests, social

Each topic has a required opening question + follow-up guidance.

### 5 Prompt Templates (`agents/conversation/promptTemplates.ts`)
| Template | When | Behavior |
|----------|------|----------|
| **A** | New topic, turn 0 | AI must ask the specific required question |
| **B** | Follow-up, turn 1 | Only for clarification/deepening, then advance |
| **C** | System/meta question | Answer briefly, ask to continue |
| **D** | Post-close | Respond briefly, no new questions |
| **E** | Closing (2 stages) | Stage 1: insight, Stage 2: farewell |

- `SYSTEM_IDENTITY` constant shared across all templates — contains system name (One), link (joinone.io), MVP status, social links, and prohibitions
- **CRITICAL**: Every prompt must include SYSTEM_IDENTITY (anti-referral, system identity)

### Conversation Closing
- **State machine**: closing_stage 0→1 (insight)→2 (final)→3 (done)
- **closingStage returned in API response** — frontend uses it to show bubbles
- **saveConversationState is AWAITED** (not fire-and-forget) — fire-and-forget caused lost closing states
- **General chat**: closing_stage from DB (reliable)
- **Cognitive/taste**: closingStage from threshold logic (message count)

### Chat Channels
| Channel | Guide Value | Full History | Description |
|---------|-------------|--------------|-------------|
| General | `new_chat` | No (sliding window) | Main personality conversation, micro-topics |
| Cognitive | `new_chat_cognitive` | Yes (full) | Thinking style simulation questions |
| Taste Test | `new_chat_taste` | Yes (full) | React to profiles from gender-matched bank |
| QA Status | `qa_status` | Yes | "מה הסטטוס שלי" |
| QA Search | `qa_search` | Yes | "מה את מחפשת לי" |
| QA System | `qa_system` | Yes | "איך המערכת עובדת" |
| QA General | `qa_general` | Yes | "שאלה על התהליך" |
| QA About Me | `qa_about_me` | Yes | "מה למדת עליי" |

### Cognitive Mode
- Triggered by clicking "בוא נבין את סגנון החשיבה שלי" bubble
- **Separate chat history** — full history sent to OpenAI (prevents question repetition)
- 27 simulation questions in bank, AI picks ~6 per session
- Closing threshold: 7 user messages (6 questions + intro)
- Messages saved with `guide = 'new_chat_cognitive'`
- Prompt file: `agents/conversation/prompts/cognitive-chat.txt`

### Taste Test Mode
- Triggered by clicking "נתח את הטעם שלי לעומק" bubble
- **All 13 selected profiles injected into every prompt** (~1000 tokens) — AI picks next from list
- Profile counting: scans history for names matching actual profile bank
- Mid-summary after 6 profiles + "want to continue?" option
- 4 profile files selected by `gender` + `looking_for_gender`:
  - `taste-profiles-female.txt` — for men seeking women
  - `taste-profiles-male.txt` — for women seeking men
  - `taste-profiles-female-ff.txt` — for women seeking women
  - `taste-profiles-male-mm.txt` — for men seeking men
- Full history sent to OpenAI always
- Messages saved with `guide = 'new_chat_taste'`

### Couple Tester Support
- `COUPLE_TESTER_INSTRUCTION` injected when `test_user_type === "Couple Tester"`
- Adapts questions: "before your current relationship" instead of assuming single

### Summarizer (`agents/conversation/summarizer.ts`)
- Every 8 messages → structured JSON extraction → `user_chat_summaries`
- Extracts: demographics, personality, values, relationship history, preferences
- Stored as `summary_json JSONB` + `topic_injection_counts JSONB`
- Triggers auto-analysis when thresholds met

### Auto-Analysis (`agents/conversation/autoAnalysis.ts`)
- **Run 1**: When general chat closes (closing_stage >= 3) — even without cognitive/taste
- **Run 2**: When all channels done (cognitive >= 5 msgs + taste >= 5 msgs)
- Max 2 automatic runs (tracked via `analysis_run_count` column)
- Saves raw output to `analysis_runs` table
- **IMPORTANT**: Do NOT modify the analysis agent (`agents/analysis/`) when changing conversation flow

### Analysis Helpers (`agents/conversation/analysisHelpers.ts`)
- `buildTranscript()` — builds analysis transcript from all chat types
- Coverage computation for analysis quality
- All guide values included: `interviewer`, `psychologist`, `new_chat`, `new_chat_cognitive`, `new_chat_taste`

### Agent Context System
- `agent_context` TEXT per-user — injected into prompts
- 4 system config keys: `system_summary_general`, `_male`, `_female`, `_female_ff`
- **Injection rules**:
  - QA channels: always inject
  - General/cognitive/taste: only if `in_matching_pool`
- **Closed-world rule**: AI must NEVER invent details about match candidates — only use info explicitly given

### RAG Integration (uses Backend's RAG infrastructure)
- Every user message: embed(lastAssistantMsg + userMsg) → parallel search system+user chunks
- Inject if score > 0.30 (threshold low because Hebrew embeddings return 0.30-0.65)
- RAG insights: direct injection for personal QA channels, RAG-only for technical channels
- **When changing conversation features**: must update relevant chunks in `seedKnowledge.ts` (coordinate with Backend agent)

---

## Frontend — NewChat & Chat UI

### NewChat.tsx (~3000 lines)
The primary user-facing screen. Contains:
- **Sidebar** (always visible, toggle on mobile) with navigation items
- **Main area**: chat OR sub-screen (ProfileEdit, Insights, Feedback, Settings, CoupleInsights)
- **Mobile header** with user avatar for logout
- **Home screen** with expert recommendations

### Chat Message Flow (Frontend)
1. User types message → POST `/api/new-chat/message`
2. Response includes `closingStage` + AI message
3. Frontend updates `channelMessages[currentChannel]`
4. If `closingStage >= 3` → show post-close bubbles for incomplete channels

### Channel State Management
- **Separate message history per channel**: `Record<string, Message[]>` keyed by channel name
- Channel list in sidebar with display names (Hebrew)
- Each channel loads its own history from API on first visit
- `closedChannels` loaded from API on mount — tracks which channels are complete

### Expert Recommendations (Home Screen)
- **Reloads on every home screen visit** (useEffect on `screen === "home"`)
- Priority logic:
  1. "בוא נמשיך" if general chat incomplete
  2. Cognitive channel recommendation
  3. Taste test recommendation
  4. All-done message (thank + conditional photo/profile prompt)
- Respects `closedChannels`
- Post-close bubbles for incomplete channels after conversation ends

### Sub-Screens (inside NewChat)
| Screen | Trigger | Notes |
|--------|---------|-------|
| ProfileEdit | Sidebar "פרופיל" | Personal details + photos + preferences |
| Insights | Sidebar "תובנות על עצמי" | **Always resets to main view** on click |
| Feedback | Sidebar "עזרו לנו להשתפר" | Category chips + textarea |
| Settings | Sidebar "הגדרות" | Photo consent, email, WhatsApp, delete |
| CoupleInsights | Sidebar "כרטיס התאמה" | When couple_insights exists |

### isWW in Chat Context
- `gender === "woman" && looking_for_gender !== "man"`
- Affects: text throughout chat, recommendations text, channel descriptions
- `wwRel()` helper converts masculine → feminine Hebrew

---

## Prompt Files

| File | Used by | Injected when |
|------|---------|---------------|
| `conversation/prompts/cognitive-chat.txt` | Cognitive simulation | Cognitive channel only |
| `conversation/prompts/taste-test-chat.txt` | Taste test system prompt | Taste channel only |
| `conversation/prompts/taste-profiles-female.txt` | 13 female profiles | Men seeking women |
| `conversation/prompts/taste-profiles-male.txt` | 13 male profiles | Women seeking men |
| `conversation/prompts/taste-profiles-female-ff.txt` | Same-sex female profiles | Women seeking women |
| `conversation/prompts/taste-profiles-male-mm.txt` | Same-sex male profiles | Men seeking men |
| `conversation/prompts/context-profile.txt` | Profile data context | User asks about self |
| `conversation/prompts/context-system-info.txt` | System info context | User asks about the system |
| `conversation/prompts/new-chat-base.txt` | Base conversation prompt | Legacy — not used by chatManager (replaced by templates) |

**All prompts loaded at startup via `fs.readFileSync`** — restart required after changes.

---

## Key Backend Files

| File | Purpose |
|------|---------|
| `backend/src/agents/conversation/chatManager.ts` | Micro-topic state machine + prompt building |
| `backend/src/agents/conversation/microTopics.ts` | 14 micro-topics with opening questions |
| `backend/src/agents/conversation/promptTemplates.ts` | Prompt A/B/C/D/E builders + SYSTEM_IDENTITY |
| `backend/src/agents/conversation/summarizer.ts` | Structured summary extraction from chat |
| `backend/src/agents/conversation/autoAnalysis.ts` | Two-run auto-analysis trigger logic |
| `backend/src/agents/conversation/analysisHelpers.ts` | Transcript builder + coverage computation |
| `backend/src/agents/conversation/index.ts` | Agent exports |
| `backend/src/index.ts` | API routes (POST /new-chat/message, GET /new-chat/status, etc.) |
| `backend/src/safeOutputLayer.ts` | User-safe trait data for chat/insights |

## Key Frontend Files

| File | Purpose |
|------|---------|
| `frontend/src/NewChat.tsx` | Primary UI: sidebar + chat + sub-screens + recommendations |
| `frontend/src/App.tsx` | View routing — renders NewChat when view === "new_chat" |

---

## API Endpoints (Conversation-Related)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/new-chat/message` | Send message, get reply + closingStage |
| GET | `/api/new-chat/status/:user_id` | Recommendations, closed states, photo count |
| GET | `/api/new-chat/history/:user_id` | Load chat history for a channel |
| POST | `/api/admin/users/:id/inject-conversation` | Inject test conversation history |

---

## Reanalysis (Coordinate with Automation Agent)

When QA channels accumulate enough messages, the Automation agent's reanalysis system triggers:
- `qa_about_me`: 5-8 msgs → reanalyze MBTI, 8+ → full reanalysis
- `qa_refine`: 3-8 msgs → reanalyze general, 8+ → full reanalysis
- Known issue: global `last_analysis_at` masks other groups — needs per-group tracking

---

## Planned Features

### Chat History Menu (Priority)
Replace "חזרה לשיחה" with GPT/Gemini-style conversation list:
- Show all channels sorted by last update
- Channel name + preview of last message
- `channelMessages` state already has per-channel history
- Need `last_updated` tracking per channel
- Must work in PWA + native Android (Capacitor with server.url)
- Mobile: drawer/panel that slides in, not permanent sidebar

### LGBTQ+ Profiles
- `taste-profiles-female-ff.txt` needs authentic rewrite for WW audience
- Current profiles may not feel natural for same-sex context

---

## Known Issues
- **Taste test**: profiles that feel generic for WW audience
- **Reanalysis per-group**: global last_analysis_at masks unprocessed messages
- **RAG scaling**: reconcileInsightChunks without LIMIT (coordinate with Backend)
- **Chat history menu**: "חזרה לשיחה" is placeholder — needs GPT-style list

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `CLAUDE.md` — full architecture reference
4. `Management/claude-working-guidelines.md` — **especially sections on prompt safety, taste test bugs, and staging rules**
5. `Management/Dev Agents/Backend/CONTEXT.md` — for RAG infrastructure, DB schema, API patterns
6. `Management/Dev Agents/Frontend/CONTEXT.md` — for general frontend patterns, design system
7. `frontend/src/NewChat.tsx` — primary user interface code
8. `backend/src/agents/conversation/chatManager.ts` — core conversation logic

## Rules

### Prompt Safety (CRITICAL)
- **SYSTEM_IDENTITY must be in every chat prompt** — system name, link, MVP status, social, prohibitions
- **Never refer to competing apps** (Tinder, Bumble, etc.)
- **Taste test profiles = "כלי אבחוני"** or "דוגמאות בסגנונות שונים" — NEVER "פיקטיביים" or "בדויים"
- **Staging first** for any prompt change — never push prompt changes directly to production
- **Minimal changes** — don't rewrite what works
- **Prefer chatManager logic over prompt weight** — implement behavior through code, not instructions in text. Lighter prompts = more predictable AI

### Conversation Flow
- **saveConversationState must be AWAITED** — fire-and-forget caused lost closing states
- **No mid-conversation channel switching** — each channel is independent
- **Each channel has separate history** — never mix histories
- **DO NOT modify the analysis agent** when changing conversation flow
- **Prompt files loaded at startup** — restart needed after changes

### Coordination
- **RAG changes**: coordinate with Backend agent (seedKnowledge.ts, rag.ts)
- **Analysis changes**: coordinate with Backend agent (agents/analysis/)
- **Reanalysis**: coordinate with Automation agent (reanalysisScan.ts)
- **UI patterns**: follow Design agent guidelines (colors, fonts, patterns)
- **API prefix**: frontend fetch calls MUST use `/api/` prefix

### Testing
- **DO NOT use real users** — always create fresh test users
- **What is NOT a bug in taste test**: user doesn't give numeric score, not all 13 profiles shown, early summary
- **What IS a bug**: repeated profiles, wrong info, channel cross-contamination
