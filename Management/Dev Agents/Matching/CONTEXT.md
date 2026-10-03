# Matching Algorithm Agent — Context

## Role
אחראי על אלגוריתם ההתאמות: filtering (Stage 1), scoring (Stage 2), profile scores, category weights, expanded matches, gender adjustments, וכל מה שקשור לאיכות ודיוק ציוני ההתאמה.

---

## Architecture Overview

### Two-Stage Process
```
Stage 1 (matchStage1.ts) — Candidate Filtering
  → eligible users × eligible users
  → fixed filters (gender, age, location, cognitive, toxicity, identity)
  → writes passing pairs to candidate_matches (status = 'pending_score')

Stage 2 (matchStage2.ts) — Scoring
  → for each pending_score pair:
  → internal_score (personality traits, Gaussian similarity)
  → external_score (appearance, look traits)
  → final_score (weighted combination)
  → per-category scores (13 categories)
  → profile_score (weighted avg of categories)
  → status = 'scored'

Promotion
  → scored candidates with internal_score > 70 AND internal_profile_score > 70
  → OR (internal_score + internal_profile_score) / 2 > 70
  → → potential_match (or expanded_potential_match if age/location exceeded)
```

### Trigger
- Daily matching cron at 4:00 AM Israel time (`pipeline/dailyMatching.ts`)
- Manual: admin button, "Run Expanded" (age +2, location +1 level)

---

## Stage 1 — Filtering (`matchStage1.ts`)

### Fixed Filters (always applied)
| Filter | Logic |
|--------|-------|
| **Gender** | Mutual compatibility (looking_for_gender matches other's gender) |
| **In pool** | Both users must have `in_matching_pool = TRUE` |
| **Matchable** | Both must have `is_matchable = 1` |
| **Not already matched** | No existing match pair in matches table |
| **Cognitive** | `cognitive_score` within ±15 of each other |
| **Toxicity** | Score < 70 OR confidence < 0.6 (or `toxicity_override = FALSE` → approved) |
| **Trollness** | Score < 70 OR confidence < 0.6 |

### Personal Filters (applied when effective_weight > 80)
| Filter | Tolerance |
|--------|-----------|
| **Age** | not_flexible: ±1yr, slightly: ±3yr, very: ±5yr |
| **Height** | not_flexible: ±2cm, slightly: ±5cm, very: ±10cm |
| **Location** | my_city / my_area / bit_further / whole_country |
| **Approval rate** | ±30 on 0-100 scale |

### Sexual Identity Filter — KNOWN ISSUE
`passesSexualIdentityFilter`: if user is "special" (trans score > 50, confidence > 0.6):
- Can only match with users who have `looking_for_gender = 'doesnt_matter'` or who are also "special"
- **Problem**: In WW pool of ~61, only 1 has `doesnt_matter`, only 2 are special → trans users get **0 matches**
- **Affected**: אמיר אביטל (#297, trans=100), ענבר (#212, trans=100)
- **Workaround**: `identity_override = FALSE` on users table + special attention tab
- **Decision pending**: remove/relax filter vs. keep with manual matching

### Location System (9 Regions)
גוש דן, שרון, עמקים-חוף, שפלה-מרכז, ירושלים, דרום-מערב, דרום-נגב, כרמל-חיפה, צפון
- Cities can belong to multiple regions (e.g. הרצליה → גוש דן + שרון)
- `my_city` = exact city, `my_area` = same region, `bit_further` = region + neighbors, `whole_country` = all

### "Run Expanded" Mode
- Age tolerance +2 years beyond preference
- Location bumped one level (my_city→my_area, my_area→bit_further, etc.)
- Results tagged with `age_expanded` / `location_expanded` booleans
- Creates `expanded_potential_match` status (not `potential_match`)

---

## Stage 2 — Scoring (`matchStage2.ts`)

### Internal Score (Personality Compatibility)
```
Per trait:
  diff = |score_A - score_B|
  rawMatch = 100 × e^(-(diff²)/(2×12²))        ← Gaussian, σ=12
  sharedConf = √(confidence_A × confidence_B)
  confFactor = min(1, sharedConf / 0.3)          ← blend toward 50 at very low confidence
  match = rawMatch × confFactor + 50 × (1 - confFactor)
  avgWeight = (weight_A + weight_B) / 2           ← falls back to trait_definition.weight
  weightedWeight = avgWeight × sharedConf

Internal Score = Σ(weightedWeight × match) / Σ(weightedWeight)    → 0-100
```

**Gaussian reference**: diff=5→92, diff=15→46, diff=30→5

**Excluded from scoring**: traits with `calc_type = 'internal_use'` or `'special'`, or `weight = 0`

### External Score (Appearance)

**Non-WW (standard):**
```
Per look trait: traitScore = 100 - |value_A - value_B|
Weights: appeal×3, fitness×3, femininity×2, warmth×1, glamour×1, naturalness×1, style_polish×1, skin_tone×1
External = Σ(traitScore × weight) / Σ(weight)
```

**WW:**
```
70% femininity match + 30% appeal similarity

Femininity match (asymmetric):
  fem_match_A→B = 100 - |desired_A - personal_B|
  fem_match_B→A = 100 - |desired_B - personal_A|
  femininity_score = MINIMUM of both sides (weakest link)

Appeal: appealScore = 100 - |appeal_A - appeal_B|

External = femScore × 0.7 + appealScore × 0.3

One side no photo: partial score, max 35 (one direction × 0.35)
No fem data: fallback to standard external
No data at all: external = null → final = 100% internal
```

### Final Score
```
Default:              final = internal × 0.70 + external × 0.30
Appearance-sensitive: final = internal × 0.65 + external × 0.35

Appearance-sensitive = appearance_sensitivity score ≥ 70 AND confidence ≥ 0.7
If external = null:   final = internal (100%)
```

---

## Profile Score (Per-Category Weighted Average)

13 categories with weights:

| Category | Weight | Key Traits |
|----------|--------|------------|
| **Cognitive** | ×3 | analytical_reasoning, abstract_thinking, cognitive_flexibility, conceptual_precision, verbal_articulation, verbal_reasoning, depth_of_thought, intellectualism, career_prestige, eq |
| **External** | ×3 | (from look traits, not personality) |
| **Communication** | ×2 | energetic_intensity, assertiveness_forcefulness, charismatic_presence |
| **Style** | ×2 | 19 traits: mainstreamness, oriental, broad_appeal, family_closeness, childishness, humor, party, hipster, geek, hippie, theatricality, soviet, gender_conformity, metropolitan, achievement, cultural_currency, style_polish, high_culture, rural |
| **Schwartz** | ×1.5 | hedonism, achievement, power, self_direction, stimulation, security, conformity, tradition, benevolence, universalism, spirituality |
| **Attitudes** | ×1.5 | right_wing, left_wing, social_activism, religiosity, secularity, value_rigidity |
| **Emotional-Social** | ×1 | social_intuitive_intelligence, eq, self_awareness, positivity, warmth |
| **Big Five** | ×1 | extraversion, conscientiousness, agreeableness, neuroticism (×0.5 weight), openness |
| **Emotionality** | ×0.5 | neuroticism, emotional_intensity, emotional_expressiveness, attachment_secure/anxious/avoidant |
| **MBTI** | ×0.5 | extraversion, sensing, intuition, thinking, feeling, judging, perceiving |
| **Enneagram** | ×0.5 | 9 type scores |
| **Popularity** | ×0.25 | oriental, mainstreamness, broad_appeal |
| **Vibe** | ×0.25 | mainstreamness, conformity, openness_to_experience, gender_conformity |

Category weight scaled by average confidence of its traits (confFactor = min(1, avgConf/0.3))

### Promotion Threshold
Candidate promoted to match if:
- `internal_score > 70 AND internal_profile_score > 70`
- OR `(internal_score + internal_profile_score) / 2 > 70`

---

## Gender Adjustments

### Emotionality (male-female pairs)
50% trait-by-trait comparison (standard) + 50% profile average comparison (male gets +10 bonus)

### Emotional-Social (male-female pairs)
Same hybrid: 50% trait-by-trait + 50% profile average (male gets +4 bonus)

### MBTI Thinking/Feeling Correction
Thinking score gets +10 before comparing with Feeling (conversation bias correction — AI tends to underrate Thinking)

---

## Expanded Matches

- Status `expanded_potential_match` for matches exceeding user's age/location preferences
- `location_expanded` / `age_expanded` BOOLEAN on candidate_matches + matches tables
- `promoteToMatches()` reads these flags to set correct status
- Admin: blue badge "התאמה מורחבת" + 📍/🔞 icons, filter option, "מחק מורחבות" bulk delete
- **Bug fixed**: `location_expanded` was never true because original check used `expanded=true` (always passed). Fix: uses `expanded=false`
- **Any new status handling must include `expanded_potential_match` alongside `potential_match`** (rating lock, send-for-rating, reconcile, etc.)

---

## Style Prompt Refinement — In Progress

Prompt file: `backend/src/agents/analysis/prompts/personal-style-system.txt`

**Done (2026-07-27):**
- **geekiness**: academic/scientific interests ≠ geek culture, max 35 without explicit gaming/SF/fantasy
- **mainstreamness**: counter-mainstream signals weigh more, generic hobbies don't indicate mainstream

**Pending: 17 traits still need review:**
oriental, broad_appeal, family_of_origin_closeness, childishness, humor, party_orientation, hipsterishness, hippie_style, theatricality, soviet_style, gender_conformity, metropolitan_orientation, achievement_status_orientation, cultural_currency, style_polish, high_culture_orientation, rural_communal_style

**Process**: Go trait by trait, test on real users, compare before/after. Run style reanalysis after each prompt change.

**Why**: Chen found AI was giving inflated geekiness scores for programmers/scientists.

---

## Score Gap — Known Issue

Gap between per-category general scores (e.g., "emotionality score") and individual trait scores within those categories.

**Cause**: Category scores = weighted averages of trait **similarities** between two users. Individual trait scores = raw AI-assigned values per user. Adding new traits to a category changes the matching score but not the individual "profile" score.

**Open question**: Should admin show category-level aggregates of individual trait scores, or only raw traits? Should "profile score" per category be decoupled from matching category score?

---

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/matchStage1.ts` | Candidate filtering (all fixed + personal filters) |
| `backend/src/matchStage2.ts` | Scoring: internal, external, final, categories, profile score |
| `backend/src/cognitiveScore.ts` | Cognitive profile computation (normalized 10-90 → 0-100) |
| `backend/src/agents/analysis/agent.ts` | Grouped AI analysis (7 prompt groups) |
| `backend/src/agents/analysis/prompts/personal-style-system.txt` | Style traits prompt |
| `backend/src/pipeline/dailyMatching.ts` | 4AM daily matching cron |

---

## Special Attention System (relevant to matching)
- `special_attention` column on users: NULL=auto, TRUE=manual, FALSE=override
- Auto-detect: trans≥50, trollness≥50, photo_flags, deal_breakers keywords
- `identity_override`: NULL=auto, TRUE=forced, FALSE=cleared
- `toxicity_override`: FALSE = approved not toxic (bypasses Stage 1 exclusion)
- "התאמות על הפרק" tab: WW + potential_match + both unlocked + both not special

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `CLAUDE.md` — general architecture
4. `Management/claude-working-guidelines.md` — deploy/staging rules
5. `backend/src/matchStage1.ts` — filtering code
6. `backend/src/matchStage2.ts` — scoring code
7. `backend/src/cognitiveScore.ts` — cognitive computation

## Rules
- **σ=12 is the Gaussian constant** — don't change without explicit instruction
- **MBTI Thinking +10** before comparing with Feeling (bias correction)
- **Manual look traits (source=manual) must survive reset-analysis and reanalyze**
- **Any new status handling must include expanded_potential_match alongside potential_match**
- **Style prompt changes: staging first, test on real users, compare before/after**
- **match_card_sent_at IS NOT NULL** — required filter when showing cancelled matches to users
