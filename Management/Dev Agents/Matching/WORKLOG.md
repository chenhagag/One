# Matching Algorithm Agent — Work Log

## Latest: 2026-10-03 — Agent Created
- Full algorithm documentation: Stage 1 filtering, Stage 2 scoring, profile scores, categories
- All formulas extracted from source code (Gaussian, WW external, gender adjustments)
- Known issues documented: trans filter, score gap, style prompt (17 traits pending)

---

## History

### 2026-09-27 — WW External Scoring
- New formula: 70% femininity match (minimum of both directions) + 30% appeal
- One side no photo: partial score, max 35
- No fem data: fallback to standard external
- No data at all: external=null → final=100% internal

### 2026-09-27 — Deal Breakers + Femininity Preference
- `deal_breakers TEXT` column on users
- femininity_preference extracted from chat → user_look_traits desired_value (trait id:13)
- General Info prompt updated, ran on 61 WW users in prod

### 2026-08-31 — Expanded Matches
- `expanded_potential_match` status for age/location-exceeding matches
- location_expanded bug fixed (was never true)
- Admin: blue badge, filter, bulk delete

### 2026-07-27 — Style Prompt Work Started
- geekiness: max 35 without explicit gaming/SF/fantasy signals
- mainstreamness: counter-mainstream signals weigh more
- 17 traits still pending review

### 2026-09-28 — Trans Filter Issue Identified
- passesSexualIdentityFilter blocks trans users completely
- Only 1 user with doesnt_matter in pool of 61
- Workaround: identity_override + special attention tab

### Score Gap — Ongoing
- Gap between category match scores and individual trait scores
- No fix implemented yet — needs product decision
