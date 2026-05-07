# WORK_LOG.md — MatchMe Development Log

## Latest Session: 2026-05-07

### What We Worked On

#### 1. Separate Chat Histories Per Channel
- **Each bubble (general, cognitive, taste test) now has its own independent chat history**
- Frontend state changed from single `Message[]` to `Record<string, Message[]>` keyed by channel
- History loading on mount splits messages by `chat_type` into per-channel arrays
- `sendMessage` sends only the current channel's history to the backend
- "חזרה לשיחה" and "בוא נמשיך" always return to `new_chat` (general) channel
- Sidebar "חזרה לשיחה" visibility based on any channel having messages

#### 2. Removed Mid-Conversation Cognitive Switch
- **Deleted** `detectCognitiveAgreement()` function and `COGNITIVE_AGREE_PATTERNS`
- **Deleted** `switchToCognitive` from `ChatPromptResult` and backend response
- No more automatic channel switching mid-conversation
- Instead: when enough data collected, AI suggests navigating to the cognitive bubble on home screen
- After cognitive is done, AI suggests navigating to taste test bubble

#### 3. Navigation Suggestions (Replace Mid-Chat Switching)
- `COGNITIVE_SUGGESTION_INSTRUCTION` — now says "click on 'בוא נבין את סגנון החשיבה שלי' on the home screen"
- New `TASTE_SUGGESTION_INSTRUCTION` — after cognitive done, suggests "click on 'נתח את הטעם שלי' on the home screen"
- New `shouldSuggestTaste()` — checks if cognitive done (≥3 msgs) and taste not done (<3 msgs)
- Suggestion flow: general chat suggests cognitive → cognitive done, general chat suggests taste

#### 4. Chat Flow Improvements (from user testing feedback)
- **Separated intros**: Both taste test and cognitive now explain what's about to happen, ask "מוכן/ה?" and wait for confirmation before starting questions/profiles
- **Taste test follow-up questions**: After each profile reaction, AI asks 1-2 follow-up questions (what did you like? what didn't work?) to understand both attraction and repulsion. Skips if answer already detailed. Max 2 follow-ups per profile.
- **Taste test expanded to 13 profiles** (was 8): covers more diverse styles for better data
- **Taste test summary validates**: After all profiles, summarizes patterns and asks user "קלטתי נכון?" to let them correct/refine
- **Cognitive closes after ~10 questions**: Tells user "I feel I've captured your thinking style" and navigates to next step
- **Dynamic navigation at end of each chat**: Both cognitive and taste test check what the user still needs (cognitive done? taste done? general chat complete?) and suggest the right next step
- **Culture topic shortened**: Less deep-diving into hobbies/music — 1-2 questions per sub-topic, enough for general picture

#### 5. Suggestion Timing Fix (found during edge-case testing)
- **Problem**: Suggestions to navigate to cognitive/taste never appeared in fresh conversations because summarizer runs async and summary_fields was still 0 when buildChatPrompt checked
- **Fix**: Added fallback trigger — if `history.length >= 12` (6+ exchanges), suggest cognitive even without waiting for summarizer
- **Problem**: Cognitive closing appeared one message too late because DB count doesn't include current message
- **Fix**: Threshold lowered to `cogUserMsgCount >= 9` (current msg not yet in DB)
- **Strengthened suggestion text**: Changed from soft "הצע" to "חובה" so AI doesn't skip the suggestion
- **Strengthened cognitive intro**: Explicit "מוכן/ה להתחיל?" + "אל תשאל שאלת סימולציה בהודעה הזו" to prevent AI from jumping ahead

#### 6. Edge Case Testing (5 scenarios)
- **Verbose user**: AI doesn't repeat questions, progresses topics correctly
- **Terse user**: AI asks focused follow-ups, tries to draw out details
- **User asks questions back**: AI answers system questions then steers back to conversation
- **Confused user**: AI explains gently and guides into conversation
- **Channel hopper**: Each channel preserves its own history, no cross-contamination, returning to general continues where it left off

#### 7. Admin: Re-analyze Buttons Always Visible
- Re-analyze, Reset analysis, Cognitive Test, and per-group analysis buttons no longer gated by `profile` existence
- Fixes issue where users who only used new_chat (no old chat) had no way to trigger analysis

### Files Modified
- `frontend/src/NewChat.tsx` — Per-channel message state, channel-aware sendMessage, navigation buttons always go to new_chat
- `backend/src/agents/conversation/chatManager.ts` — Removed cognitive agreement detection, added taste suggestion, dynamic navigation at end of cognitive/taste, separated intro phases, follow-up questions, 13 profiles
- `backend/src/agents/conversation/prompts/taste-test-chat.txt` — Follow-up questions after each profile reaction
- `backend/src/agents/conversation/prompts/cognitive-chat.txt` — Ask "ready?" before starting, ~10 questions target
- `backend/src/agents/conversation/prompts/topic-culture.txt` — Shortened, less deep-diving
- `backend/src/index.ts` — Removed switchToCognitive handling, simplified guide logic
- `frontend/src/AdminView.tsx` — Analysis toolbar always visible (not gated by profile)

### Decisions Made
- Each channel = separate conversation with separate history (user experience of independent chats)
- No mid-conversation channel switching — user navigates via home screen bubbles
- AI guides user to the right bubble at the right time via natural suggestion
- Same base prompt for all channels, channel-specific behavior via RAG injection
- Intro → confirm → start pattern: always explain first, never surprise user with questions/profiles
- Dynamic navigation: code checks DB for what's done, injects the right suggestion — no hardcoded flows
- 13 taste profiles for better coverage; ~10 cognitive questions for sufficient thinking style data

### Open Questions
- When to trigger a second auto-analysis (after more conversation data)?
- Should taste test responses get a separate analysis prompt group (taste-specific traits)?
- "פרופיל" sidebar button still not connected

---

## Previous Session: 2026-05-05/06

### What We Worked On

#### 1. Conversation System — Topic-Based RAG (replaced Phase-Based)
- **Replaced** message-count-based phases (opening/middle/deep) with **topic-based flow** driven by summary coverage
- Topic order: `intro` → `relationships` → `values` → `culture`
- `getCurrentTopic()` checks summary fields → returns first uncovered topic → injects only that topic's prompt
- Each topic prompt is slim (~100 tokens) — only what the AI needs right now
- Deleted `phase-opening.txt`, `phase-middle.txt`, `phase-deep.txt` — replaced by topic files
- Base prompt updated: emphasis on active steering ("אתה מוביל — לא רק זורם"), cover all topics, don't linger on general stuff
- Removed rigid "2-3 questions per topic" rule — AI should draw out concise users and flow with expressive ones

#### 2. Taste Test Feature (Full Implementation)
- **New channel**: `new_chat_taste` — separate conversation mode for taste profiling
- **Profile bank**: 24 synthetic profiles per gender (male + female), parsed into arrays at startup
- **Smart RAG**: injects **one profile at a time** based on message count (~80 tokens per profile), not entire bank (~5000 tokens)
- **Curated selection**: 8 diverse profiles per session (intellectual, street, spiritual, mainstream, family, artsy, sensitive, formal)
- **3 phases**:
  1. Intro (msg 0) — opening message + first profile (or ask gender preference if not set)
  2. Profile presentation (msg 1-7) — react briefly + show next profile + ask 1-10 rating
  3. Summary (msg 8+) — summarize taste patterns in 2-3 sentences
- **Gender handling**: `looking_for_gender` = man/woman → matching profiles; "both" → alternating male/female selection order; not set → asks user first
- **Re-entry support**: if user leaves and comes back, reminds them of last unanswered profile (same pattern as cognitive)
- **Frontend**: "נתח את הטעם שלי" button (home screen + sidebar) switches to `new_chat_taste` channel
- **Analysis**: taste test messages (`guide = 'new_chat_taste'`) automatically included via `guide LIKE 'new_chat%'`
- **Status endpoint**: `has_taste_info` now checks taste test messages count (≥5) in addition to summary field

#### 3. Smart Topic Detection — Follow the User + History Scan
- **Problem**: Chat ignored user's topic requests and repeated topics already discussed
- **Root cause**: Topic selection relied solely on summary (updates every 8 msgs) — blind to what actually happened in conversation
- **Solution — 3-layer topic detection in `getCurrentTopic()`**:
  1. `detectUserRequestedTopic(currentMessage)` — if user's current message mentions a topic (keywords), follow them there (highest priority)
  2. `detectTopicsInHistory(history)` — scan conversation history for keywords to find topics already discussed (even before summarizer ran)
  3. Fallback — first uncovered topic in default order (intro → relationships → values → culture)
- **Keyword patterns per topic**: `relationships` matches מחפש/זוגיות/מערכת יחסים/אקס etc., `intro` matches עובד/לומד/תואר etc.
- **History passed from index.ts** — `buildChatPrompt` now receives `history` array to enable scanning without extra DB queries
- **Relationships prompt improved** — explicit instruction to ask about past relationships (what worked, what didn't, why it ended)
- **Prompts stay slim** — no "topics covered/missing" lists injected; code handles the logic, prompt just guides the current topic

#### 4. Frontend Bug Fixes
- **Fixed channel race condition**: `sendMessage()` now accepts `channelOverride` parameter — sends correct channel immediately instead of relying on async React state update. Fixes both cognitive and taste test channel switching.
- **Fixed `setTopicsOpen` reference error**: removed call to non-existent state setter in overlay click handler
- **Removed taste_test placeholder screen**: taste test now runs through the chat, not a separate placeholder

### Files Created
- `backend/src/agents/conversation/prompts/topic-intro.txt` — Topic: background, occupation, education
- `backend/src/agents/conversation/prompts/topic-relationships.txt` — Topic: what looking for, past relationships
- `backend/src/agents/conversation/prompts/topic-values.txt` — Topic: values, positions, what matters
- `backend/src/agents/conversation/prompts/topic-culture.txt` — Topic: taste, culture, hobbies, social style
- `backend/src/agents/conversation/prompts/taste-test-chat.txt` — Taste test system prompt (slim, no profiles)
- `backend/src/agents/conversation/prompts/taste-profiles-female.txt` — 24 female profiles (from Docs)
- `backend/src/agents/conversation/prompts/taste-profiles-male.txt` — 24 male profiles (from Docs)

### Files Modified
- `backend/src/agents/conversation/chatManager.ts` — Major rewrite: topic-based flow, taste test channel handling, profile parsing, curated selection, re-entry detection
- `backend/src/agents/conversation/prompts/new-chat-base.txt` — Active steering emphasis, topic coverage requirements, draw out concise users
- `backend/src/index.ts` — `has_taste_info` now checks taste test message count
- `frontend/src/NewChat.tsx` — `sendMessage` accepts `channelOverride`, taste test via chat channel, removed placeholder, fixed bugs

### Files Deleted
- `backend/src/agents/conversation/prompts/phase-opening.txt` (replaced by topic-intro.txt)
- `backend/src/agents/conversation/prompts/phase-middle.txt` (replaced by topic-relationships.txt + topic-values.txt)
- `backend/src/agents/conversation/prompts/phase-deep.txt` (replaced by topic-culture.txt)

### Decisions Made
- Topic-based RAG over phase-based: flow driven by actual coverage (summary), not arbitrary message counts
- One profile per prompt: ~80 tokens instead of ~5000 — massive token savings
- 8 profiles per session: enough diversity without fatigue
- Draw out concise users instead of skipping ahead — more data = better matching
- Taste test messages included in analysis (via existing `guide LIKE 'new_chat%'` query)
- Code handles topic routing logic, not the prompt — keeps prompts slim and natural
- User's current message has priority over default topic order — follow the user, don't fight them
- History-based keyword scan solves the "summarizer lag" problem without adding DB queries

### Open Questions
- When to trigger a second auto-analysis (after more conversation data)?
- Should taste test responses get a separate analysis prompt group (taste-specific traits)?
- "פרופיל" sidebar button still not connected

---

## Previous Session: 2026-05-05 (morning)

### What We Worked On

#### 1. Guided Conversation System (New Chat Overhaul)
- Rewrote `new-chat-base.txt` — expert-led conversation with specific, interesting questions instead of generic ones
- Created 3 phase-based guidance prompts (RAG injection based on message count):
  - `phase-opening.txt` (0-6 msgs) — light intro, basic background
  - `phase-middle.txt` (7-20 msgs) — taste, style, social world, culture
  - `phase-deep.txt` (21+ msgs) — values, relationships, identity
- Base prompt slimmed from ~1,034 to ~504 tokens — all specific questions moved to phase files
- Phase guidance injected via RAG (only the relevant phase is sent to OpenAI)

#### 2. Cognitive/Simulation Chat Mode
- Created `cognitive-chat.txt` prompt with 27 simulation questions across 7 categories
- Added "בוא נבין את סגנון החשיבה שלי" bubble in NewChat home screen
- Frontend tracks `channel` state (`new_chat` vs `new_chat_cognitive`)
- Messages saved with `guide = 'new_chat_cognitive'` for separate tracking
- Chat naturally suggests cognitive mode when summary is complete + no cognitive done yet
- Agreement detection: when user says "כן"/"יאללה"/"בוא" after suggestion → auto-switches to cognitive prompt
- Backend returns `switch_to_cognitive: true` → frontend updates channel automatically

#### 3. Conversation Summarization System
- Created `summarizer.ts` — extracts structured user info from chat history
- Uses GPT-4o-mini (async, non-blocking, cheap)
- Triggers every 8 user messages (first at 6)
- 9 fields: general_info, occupation, background_culture, social_style, taste_and_style, relationships, values, intellectual_world, notable_quotes
- Updates existing summary (doesn't rebuild from scratch)
- New DB table: `user_chat_summaries` (JSONB, per-user)
- Summary used in profile intent when no formal analysis exists

#### 4. Auto-Analysis System
- Created `autoAnalysis.ts` — triggers full analysis when conditions met:
  - Summary ≥5 of 8 fields filled
  - ≥5 user messages in cognitive chat
  - `auto_analyzed` flag is false
- Runs in background (non-blocking), sets `users.auto_analyzed = TRUE`
- New DB column: `users.auto_analyzed BOOLEAN`

#### 5. Analysis Now Includes All 3 Chat Types
- Updated `buildAnalysisTranscript()` in `orchestrator.ts`
- Part 1: Interviewer (lab/personality) — as before
- Part 2: Psychologist (depth chat) — as before
- Part 3: New chat (general + cognitive) — NEW, `guide LIKE 'new_chat%'`
- Each part only included if it exists for the user

#### 6. Frontend Improvements
- Home screen expert recommendations when cognitive or taste info is missing
- New API endpoint: `GET /new-chat/status/:user_id` for recommendation flags
- Insights empty state: improved message directing user to ask chat "מה למדת עליי"
- Added `emptySubtext` style for secondary hint text

#### 7. Data Cleanup
- Deleted 18 test `new_chat` messages for user 14 (Noy) — preserved interviewer (41) + psychologist (46)
- Ran successful reanalysis for Noy with updated transcript builder

---

## Previous Session: 2026-05-03 / 2026-05-04

### What We Worked On

#### 1. Per-Category Matching Scores
- Added 11 category-specific match scores (cognitive, emotional-social, emotionality, communication, vibe, popularity, big_five, schwartz, style, general, mbti)
- Each category computes similarity only on its own traits
- Added `profile_score` — weighted average of category scores
- Displayed all scores in Candidate Matches admin table

#### 2. Matching Algorithm Improvements
- Changed similarity formula from linear to **Gaussian** (σ=12): `100 × e^(-(diff²)/(2×144))`
- Gender adjustments for emotionality (+10 male) and emotional-social (+4 male) in male-female pairs — uses 50/50 hybrid (trait-by-trait + profile average)
- External score: real visual similarity (was placeholder returning 100)
- External weights: Appeal×3, Fitness×3, Femininity×2, rest×1
- Ratios: 70/30 internal/external (65/35 for appearance-sensitive users)
- Appearance sensitivity threshold: score≥70 AND confidence≥0.7
- Cognitive score normalization: range 10-90 → 0-100

#### 3. MBTI System
- Added 6 MBTI traits (sensing, intuition, thinking, feeling, judging, perceiving)
- Created `mbti-system.txt` prompt
- MBTI type displayed in admin profile + Insights screen
- Thinking gets +10 before comparing with Feeling
- Migration script: `addMbtiTraits.ts`

#### 4. Communication Tone Restructure
- Removed old 8 traits, replaced with 3: energetic_intensity, assertiveness_forcefulness, charismatic_presence
- Moved theatricality to Personal Style
- Migration script: `restructureCommTone.ts`

#### 5. External/Visual Traits
- Added 8 manual visual traits (appeal, warmth_visual, femininity_masculinity, glamour, naturalness, fitness_aesthetic, style_polish, skin_tone_range)
- Editable in admin user detail
- Manual traits survive reset-analysis and reanalyze
- Migration script: `updateLookTraits.ts`

#### 6. New Chat Frontend (NewChat.tsx)
- Complete new user-facing UI: sidebar + chat + sub-screens
- Screens: home (welcome), chat, profile_edit, insights, bug_report, settings (placeholder)
- Sidebar with mobile toggle (☰)
- Set as default screen after login/registration

#### 7. RAG-Based Chat Manager
- `chatManager.ts` — intent detection via regex patterns
- Three intents: profile, system, general
- Injects context only when relevant (not fat prompt)
- Prompts split into: `new-chat-base.txt`, `context-profile.txt`, `context-system-info.txt`
- Safe Output Layer (`safeOutputLayer.ts`) — returns only user-safe data

#### 8. Insights Screen
- Shows MBTI type with description
- Strong Schwartz values (>60) with explanations
- Big Five highlights (>60, excluding neuroticism) with explanations
- Gender-appropriate Hebrew language

#### 9. User Profiles Tab (Admin)
- Updated from 4 old categories to 9 new categories
- Cognitive profile uses DB value only (no local fallback)
