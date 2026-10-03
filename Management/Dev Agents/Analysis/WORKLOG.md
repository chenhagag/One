# Analysis Dev Agent — Work Log

## Latest: 2026-10-03 — Agent Created
- Analysis agent created, split from Backend agent
- Full documentation: 8 prompt groups, validation logic, fuzzy matching, COALESCE DB layer, cognitive score, safe output layer (MBTI/Enneagram/Attachment), coordination points
- Covers: agent.ts (765 lines), loader.ts (309 lines), cognitiveScore.ts (62 lines), safeOutputLayer.ts (660 lines), 12 prompt files (~1,600 lines), types, tests, README

---

## History

### 2026-09-27 — Deal Breakers + Femininity Preference
- `deal_breakers TEXT` column on users table
- femininity_preference extracted from chat → user_look_traits desired_value (trait id:13)
- General Info prompt updated with deal_breakers + femininity extraction
- Ran on 61 WW users in production

### 2026-09-27 — WW External Scoring (Matching side)
- New WW formula for external scoring: 70% femininity match + 30% appeal
- Analysis feeds the femininity_masculinity trait that matching now uses
- Coordinated with Matching agent

### 2026-09 — Grouped Analysis Architecture
- Migrated from single-call to 8 grouped calls (sequential for GPT-4o rate limits)
- Each group has dedicated system prompt optimized for its trait category
- Special routing: career_prestige from Cognitive → General Info, Big Five + Schwartz merged into Personality
- Text traits integrated into General Info group
- Single-group reanalysis support for admin

### 2026-09 — Anti-Flattery Calibration (Ongoing)
- Extensive anti-flattery rules added to group-system.txt
- Specific trait anchors: career_prestige, analytical_reasoning, toxicity, trollness
- Confidence independence rule: confidence not tied to score direction
- Behavioral pattern detection: trollness signals affect confidence for other traits
- **Issue persists**: scores still cluster 55-75 for many users

### 2026-08 — Safe Output Layer Expansion
- Enneagram support: 9 types + wing computation
- Attachment style: 3 styles + compound labels (בטוח-חרדתי, בטוח-נמנע)
- Rich profile for qa_about_me: full trait dump with descriptive levels
- MBTI borderline handling: dual labels for E/I 50-55, alternate type for all borderline dimensions

### 2026-07 — Cognitive Score + MBTI Corrections
- Cognitive score: confidence-weighted average with analytical_reasoning ×3
- Normalization: 10-90 raw → 0-100
- MBTI Thinking +10 bias correction (conversation inflates Feeling)
- Single source of truth in cognitiveScore.ts

### 2026-06 — Initial Analysis System
- 7 prompt groups, GPT-4o, JSON mode
- 60+ personality traits extracted
- Validation + fuzzy matching for external traits
- COALESCE upsert logic for accumulating data across runs
- Token tracking per group

### Prompt Calibration Incidents
- AI gave everyone 65-80 in positive traits → anti-flattery rules added
- Warmth scores uniformly high → specific anchor guidance added
- career_prestige inflated for "happy" workers → explicit job-based anchoring
- Confidence too high on weak signals → subjective vs factual trait distinction added
