# Analysis Dev Agent — Context

## Role
אחראי על מערכת הניתוח: חילוץ 60+ תכונות אישיות מתמלילי שיחה באמצעות AI, שמירה ל-DB, חישובים נגזרים (cognitive score, MBTI, Enneagram, attachment style), ושכבת הפלט הבטוח למשתמשת (safe output layer).

זהו חלק קריטי — הניתוח הוא הבסיס שעליו נבנים ציוני ההתאמה, התובנות למשתמשת, וההחלטות של המערכת (pool entry, matching, recommendations).

**לא כולל**: triggers לריצת ניתוח (סוכן Conversation — autoAnalysis.ts), reanalysis scheduling (סוכן Automation — reanalysisScan.ts), matching algorithm (סוכן Matching), DB schema infrastructure (סוכן Backend).

---

## Architecture — High Level

```
Conversation transcripts (all chat types)
  ↓
buildTranscript() (analysisHelpers.ts — Conversation agent)
  ↓
buildAnalysisInput() (loader.ts) — loads trait definitions from DB
  ↓
runAnalysisAgent() (agent.ts) — core analysis
  ├── Group internal traits by trait_group field
  ├── Run 8 group calls sequentially (GPT-4o, JSON mode)
  │   ├── Cognitive Profile (cognitive-system.txt)
  │   ├── Personality = Big Five + Schwartz (bigfive-schwartz-system.txt)
  │   ├── Communication Tone (communication-tone-system.txt)
  │   ├── Personal Style (personal-style-system.txt)
  │   ├── Attitudes (attitudes-system.txt)
  │   ├── Emotional Profile (emotional-profile-system.txt)
  │   ├── General Info + text traits + career_prestige (general-info-system.txt)
  │   └── MBTI (mbti-system.txt)
  ├── Run external traits call (external-system.txt)
  ├── Validate all results (fuzzy matching, dedup, mirrored value stripping)
  └── Merge into AnalysisAgentOutput
  ↓
saveAnalysisToDb() (loader.ts) — upsert to user_traits + user_look_traits
  ↓
updateCognitiveScore() (cognitiveScore.ts) — weighted average → users.cognitive_score
  ↓
safeOutputLayer.ts — compute MBTI, Enneagram, Attachment, filter safe traits for user
```

---

## Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `backend/src/agents/analysis/agent.ts` | 765 | Main analysis logic: grouping, API calls, validation, merging |
| `backend/src/agents/analysis/loader.ts` | 309 | DB layer: load trait defs, save results, save/get analysis runs |
| `backend/src/agents/analysis/types.ts` | 80 | TypeScript interfaces for input/output |
| `backend/src/agents/analysis/index.ts` | 12 | Public exports |
| `backend/src/agents/analysis/test-run.ts` | — | Test runner with sample transcript |
| `backend/src/agents/analysis/test-incremental.ts` | — | Incremental analysis test |
| `backend/src/agents/analysis/README.md` | 105 | Integration guide, confidence logic, null handling |
| `backend/src/cognitiveScore.ts` | 62 | Cognitive score computation (single source of truth) |
| `backend/src/safeOutputLayer.ts` | 660 | MBTI/Enneagram/Attachment/BigFive/Values for user display |

---

## Prompt Groups — 8 Internal + 1 External

### Group Routing Logic (agent.ts)
Traits are grouped by their `trait_group` field from `trait_definitions` table. Special routing:

| Group | Prompt File | Special Notes |
|-------|-------------|---------------|
| **Cognitive Profile** | `cognitive-system.txt` | Excludes `career_prestige` (moved to General Info) |
| **Personality** | `bigfive-schwartz-system.txt` | Merged from Big Five + Schwartz Values |
| **Communication Tone** | `communication-tone-system.txt` | |
| **Personal Style** | `personal-style-system.txt` | |
| **Attitudes** | `attitudes-system.txt` | |
| **Emotional Profile** | `emotional-profile-system.txt` | |
| **General Info** | `general-info-system.txt` | Includes career_prestige + text traits (deal_breakers, advantages) |
| **MBTI** | `mbti-system.txt` | Also handles Enneagram types |
| **External (Look)** | `external-system.txt` | Separate flow — appearance/look traits |

### Group Execution
- All internal groups run **sequentially** with GPT-4o (rate limit protection)
- External call runs **after** all internal groups complete
- Each call uses `response_format: { type: "json_object" }` for reliable parsing
- Token tracking per group via `trackTokens(userId, action_type, model, usage)`

### Single-Group Reanalysis
Admin can rerun analysis on a single group via `runSingleGroupAnalysis(groupKey, transcript, userId)`:
- Available groups: cognitive, personality, communication, style, attitudes, emotional, general, mbti, external
- `GROUP_PROMPT_MAP` maps group keys to prompt files + trait_groups
- Used by admin "reanalyze [group]" buttons

---

## Prompt System — Philosophy & Rules

### Core Principle: "Accuracy Before Richness"
The main system prompt (`group-system.txt`, 257 lines) establishes critical rules:

#### Anti-Flattery Rule (CRITICAL)
- **Users never see scores** — no reason to be "nice" or "positive"
- AI models naturally inflate positive traits (intelligence, warmth, EQ, humor)
- Score 50 = **average and legitimate** — most people are average on most traits
- Score 30-40 = **completely normal** — not everyone is smart/warm/funny
- **Test**: "Do my scores differentiate between people?" If everyone gets 65-80 → you're flattering, not analyzing

#### Score Anchors (0-100)
- Strong direct evidence → 85-100 or 0-15
- No info / contradictory / truly average → 35-65
- Guess without evidence → 45-55 with low confidence
- **Three cases must look different**: strong evidence, weak evidence, no evidence

#### Specific Trait Anchors
- **career_prestige**: Doctor/engineer/pilot → 85-100; Teacher/nurse → 35-50; Cashier/driver → 5-15; Unemployed → 0-5. Score 50 is **already high**
- **analytical_reasoning**: Brilliant formulation → 85-100; Basic communication → 40-55; Shallow → 15-30
- **toxicity_score**: Misogynistic/racist → 85-100; Normal conversation → 5-15
- **trollness**: Deliberately absurd → 70-100; Honest conversation → 0-15

#### Confidence Rules
- **Confidence is independent of score direction** — low warmth (30) can have HIGH confidence (0.65) if evidence is clear
- **Factual traits** (career, religion): single statement → confidence 0.8-0.95
- **Subjective traits** (humor, warmth, EQ): single statement → confidence max 0.4; clear pattern → 0.65-0.85
- **No evidence** → confidence 0.1-0.15, NOT 0.4+

| Evidence Level | Max Confidence |
|----------------|---------------|
| No info, default score only | 0.1 |
| Guess from general impression | 0.15-0.25 |
| Single indirect signal | 0.2-0.35 |
| Single direct statement (subjective) | 0.3-0.4 |
| 2-3 consistent signals | 0.4-0.6 |
| Multiple sources in conversation | 0.6-0.8 |
| Clear consistent pattern | 0.75-0.9 |
| Direct factual statement | 0.8-0.95 |

#### Additional Intelligence Estimate
The prompt asks for `estimated_general_intelligence` (0-100) — an independent holistic estimate, not an average of cognitive traits.

---

## Validation Logic (agent.ts)

### Internal Traits (`validateInternalTrait`)
- Resolves trait_id from `internal_name` (LLM emits names, not IDs)
- Text-type traits (deal_breakers, advantages): stores `text_value`, score=0
- Numeric traits: validates score 0-100, confidence 0-1
- `weight_for_match`: only allowed for specific traits (`WEIGHT_ALLOWED_TRAITS`: analytical_reasoning, career_prestige)

### External Traits (`validateExternalTrait`)
- **Fuzzy matching** via `guessExternalTraitId()`:
  1. Try direct trait_id/id
  2. Try internal_name match (exact + substring)
  3. Try matching personal_value/desired_value against `possible_values` + `EXTERNAL_TRAIT_SYNONYMS`
- `EXTERNAL_TRAIT_SYNONYMS` dictionary: body_type, skin_color, height, gender_expression, look_style, grooming_level — each with 10-25 synonym terms
- **Mirrored value stripping**: if personal_value == desired_value (within close confidence), clear personal_value (LLM tendency to duplicate)

### Deduplication
External traits are deduped by trait_id — first valid entry wins.

---

## DB Layer (loader.ts)

### Read
- `loadInternalTraitDefs()` — active traits from `trait_definitions`, sorted by `sort_order`
- `loadExternalTraitDefs()` — active traits from `look_trait_definitions`
- `buildAnalysisInput()` — combines transcript + trait definitions + optional existing profile

### Write — COALESCE Logic (CRITICAL)
`saveAnalysisToDb()` uses INSERT ... ON CONFLICT ... DO UPDATE:

**Internal traits (`user_traits`)**:
- `score`, `confidence` — **always overwritten** with new values
- `weight_for_match`, `weight_confidence` — **COALESCE** — new non-null overwrites, null does NOT clear existing
- `source` always set to 'ai'

**External traits (`user_look_traits`)**:
- `personal_value`, `personal_value_confidence` — **direct assignment** (to allow mirrored-value clearing)
- `desired_value`, `desired_value_confidence` — **COALESCE** — preserves existing if new is null
- `weight_for_match`, `weight_confidence` — **COALESCE**
- `source` set to 'ai'
- **IMPORTANT**: `source='manual'` traits must NOT be overwritten — the ON CONFLICT handles this via source column check

**Special saves**:
- `deal_breakers_text` → `users.deal_breakers` (UPDATE, not upsert)
- `femininity_preference` → `user_look_traits` desired_value for femininity_masculinity (trait id:13), with manual source protection

### Analysis Runs
- `saveAnalysisRun()` — saves generated_prompt + stage_a_output (raw) + stage_b_output (parsed) as JSONB
- `getLatestAnalysisRun()` — returns latest run for admin debug view, with legacy `{ raw: "..." }` unwrapping

---

## Cognitive Score (`cognitiveScore.ts`)

**Single source of truth** for cognitive score computation.

### Formula
Confidence-weighted average with trait-specific weights:
- `analytical_reasoning` × **3** (dominant factor)
- All others × 1: abstract_thinking, cognitive_flexibility, conceptual_precision, verbal_articulation, verbal_reasoning, depth_of_thought, intellectualism, career_prestige, eq

### Normalization
Raw range (10-90) → normalized to 0-100: `((raw - 10) / 80) * 100`

### Usage
- `computeCognitiveScore(traits)` — pure computation from trait map
- `updateCognitiveScore(userId)` — reads from DB, computes, saves to `users.cognitive_score`
- Called by: reanalyze endpoint, analysis completion
- Used by: matchStage1 cognitive filter (±15 between users)

---

## Safe Output Layer (`safeOutputLayer.ts`)

Transforms raw trait scores into user-safe formats. **Users never see raw scores.**

### Exported Functions

| Function | Used By | Returns |
|----------|---------|---------|
| `getSafeUserProfile(userId)` | Chat prompt injection | MBTI + strong values + strong Big Five |
| `getDetailedUserProfile(userId)` | Insights screen (frontend) | Full MBTI + Enneagram + Attachment + all values + all Big Five |
| `formatRichProfileForChat(userId)` | qa_about_me channel | Descriptive text with internal scores (for AI, not user) |
| `formatSafeProfileForPrompt(profile)` | Prompt injection | Text block from SafeUserProfile |

### Computed Types

**MBTI** (`computeMbtiType`):
- Built from 7 traits: extraversion, sensing, intuition, thinking, feeling, judging, perceiving
- **Thinking +10 adjustment** before comparing with Feeling (conversation bias correction — chat inflates Feeling)
- Borderline E/I (50-55): shows "ENFP/INFP" style dual label
- Alternate type: flips most borderline dimension (difference ≤ 5)
- 16 type descriptions in Hebrew

**Enneagram** (`computeEnneagramType`):
- 9 traits: `enneagram_type_1` through `enneagram_type_9`
- Primary = highest score
- Wing = adjacent type with highest score (type 1 → wing 9 or 2; type 9 → wing 1 or 8)
- Display: "4w5" format

**Attachment Style** (`computeAttachmentLabel`):
- 3 traits: attachment_secure, attachment_anxious, attachment_avoidant
- Dominant = highest score
- Compound labels: if secure is dominant AND second ≥ 50 → "בטוח-חרדתי" or "בטוח-נמנע" with dedicated descriptions
- Custom relationship descriptions per style + compound

**Safe Positive Traits**:
- 15 traits deemed safe to show when score ≥ 65
- Includes: analytical_reasoning, abstract_thinking, eq, warmth, self_awareness, etc.
- Score → level: "גבוה מאוד" (80+), "גבוה" (65+), "בינוני" (45+), "נמוך" (30+), "נמוך מאוד"

### Display Data Tables
The file contains full Hebrew descriptions + relationship context for:
- 16 MBTI types (MBTI_DESCRIPTIONS)
- 11 Schwartz Values (VALUE_INFO) with he/desc/relationship
- 5 Big Five traits (BIG_FIVE_INFO) with he/desc/relationship
- 9 Enneagram types (ENNEAGRAM_INFO) with name/desc/relationship
- 3 Attachment styles (ATTACHMENT_INFO) + 2 compound styles (COMPOUND_ATTACHMENT_DESC)

---

## Trait Definitions (DB-Driven)

### Internal Traits (`trait_definitions` table)
- 60+ active traits
- Key fields: `internal_name`, `display_name_he`, `ai_description`, `weight`, `calc_type`, `trait_group`, `sensitivity`, `required_confidence`, `sort_order`
- `calc_type`: "numeric" (score 0-100) or "text" (text_value only)
- `trait_group`: determines which prompt group handles the trait
- Groups: Cognitive Profile, Big Five, Schwartz Values, Communication Tone, Personal Style, Attitudes, Emotional Profile, General Info, MBTI

### External/Look Traits (`look_trait_definitions` table)
- ~15 traits: appeal, warmth_visual, femininity_masculinity, glamour, naturalness, fitness_aesthetic, style_polish, skin_tone_range, hair_color, eye_color, hair_type, etc.
- `possible_values`: JSONB array of allowed categorical values
- Numeric traits: 0-100 scale
- Categorical traits: text values (e.g., hair_color: "brown", "blonde", "black")
- **source='manual'** traits must survive reanalysis — never overwritten by AI

### User Traits Storage
- `user_traits`: user_id + trait_definition_id + score + confidence + weight_for_match + weight_confidence + source
- `user_look_traits`: user_id + look_trait_definition_id + personal_value + desired_value + confidences + weight + source

---

## Guide Values in Analysis

All chat types are included in analysis transcripts:

| Guide | Chat Type | Analysis Part |
|-------|-----------|---------------|
| `interviewer` | Old lab/personality chat | Part 1 |
| `psychologist` | Old depth chat | Part 2 |
| `new_chat` | New general chat | Part 3 |
| `new_chat_cognitive` | Cognitive simulation | Part 3 (with new_chat) |
| `new_chat_taste` | Taste test reactions | Part 3 (with new_chat) |

---

## Triggers (Owned by Other Agents)

### Auto-Analysis (Conversation agent → `autoAnalysis.ts`)
- **Run 1**: When general chat closes (closing_stage ≥ 3) — runs even without cognitive/taste
- **Run 2**: When all channels done (cognitive ≥ 5 msgs + taste ≥ 5 msgs)
- Max 2 automatic runs tracked via `analysis_run_count` column

### Reanalysis (Automation agent → `reanalysisScan.ts`)
- `qa_about_me`: 5-8 msgs → reanalyze MBTI only, 8+ → full reanalysis
- `qa_refine`: 3-8 msgs → reanalyze general only, 8+ → full reanalysis
- **Known issue**: global `last_analysis_at` masks unprocessed messages from other groups — needs per-group tracking

### Admin Manual (Backend API routes)
- Full reanalysis button per user
- Single-group reanalysis buttons (8 groups + external)
- Cognitive test analysis (separate prompt: `coginitive-test.txt`)

---

## Token Tracking

Every analysis call is tracked via `tokenTracker.ts`:
- Action types: `analysis_cognitive`, `analysis_communication`, `analysis_big_five`, etc.
- Per-user tracking with model name and usage stats
- Stored in `token_usage` table

---

## Known Issues

- **AI flattery bias**: Despite extensive anti-flattery prompting, scores still tend to cluster 55-75. Ongoing calibration.
- **Reanalysis per-group**: global `last_analysis_at` masks other groups — needs per-group timestamp tracking
- **Score gap**: Gap between per-category match scores and individual trait scores (product decision needed)
- **Style prompt**: 17 style traits pending (geekiness + mainstreamness done, 15 remaining)
- **MBTI Thinking +10**: Hardcoded bias correction — may need calibration as conversation system evolves

---

## Coordination with Other Agents

| Agent | Coordination Point |
|-------|-------------------|
| **Conversation** | Builds transcripts (`analysisHelpers.ts`), triggers auto-analysis (`autoAnalysis.ts`). Changes to conversation flow may affect transcript quality. |
| **Automation** | Triggers reanalysis (`reanalysisScan.ts`). Changes to analysis groups must update reanalysis group mapping. |
| **Matching** | Consumes `user_traits` + `user_look_traits` for scoring. New traits need corresponding matching logic. `cognitiveScore` used in Stage 1 filtering. |
| **Backend** | Owns DB schema (`schema.pg.ts`), trait_definitions tables. Schema changes need coordination. |
| **Insights Writer** | Reads traits for writing insights. Trait interpretation must be consistent. |
| **Frontend** | Insights.tsx displays `getDetailedUserProfile()` output. New personality systems need frontend components. |

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `backend/src/agents/analysis/README.md` — integration guide
4. `backend/src/agents/analysis/prompts/group-system.txt` — main analysis prompt (scoring + confidence rules)
5. `CLAUDE.md` — full architecture reference
6. `Management/claude-working-guidelines.md` — deploy/staging rules
7. `Management/Dev Agents/Matching/CONTEXT.md` — how traits feed into matching scores

## Rules

### Prompt Changes
- **Staging first** — never push prompt changes directly to production
- **Minimal changes** — don't rewrite what works
- **Anti-flattery calibration** is critical — any change that touches scoring or confidence guidelines must be tested against at least 3 diverse transcripts
- **Test with `test-run.ts`** before deploying: `cd backend && npx ts-node src/agents/analysis/test-run.ts`

### Trait Management
- **Manual look traits** (`source='manual'`) must NEVER be overwritten by AI analysis — COALESCE logic protects this
- **New traits** require: trait_definitions row + prompt group handling + matching integration + potentially safeOutputLayer
- **Trait removal** requires checking all consumers: matching, insights, safe output, frontend display

### Score Integrity
- **MBTI Thinking gets +10** before comparing with Feeling — this is intentional bias correction
- **Cognitive score** is computed ONLY in `cognitiveScore.ts` — do not compute elsewhere
- **deal_breakers** saved to `users.deal_breakers`, not `user_traits` — separate storage path
- **femininity_preference** saved as desired_value on trait id:13 — respects manual source

### General
- **DO NOT modify conversation flow** when changing analysis logic (coordinate with Conversation agent)
- **Neuroticism** = "עוצמת תגובה רגשית" — never "רגישות רגשית" or "נוירוטיות" in user-facing contexts
