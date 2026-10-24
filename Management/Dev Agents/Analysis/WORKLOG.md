# Analysis Dev Agent — Work Log

## Latest: 2026-10-18 — Cognitive + Style Prompt Improvements

### Cognitive Scoring Accuracy
- Academic careers (medicine, engineering, law) set floor of 60 for analytical/verbal/depth traits
- Conscious self-criticism recognized as positive signal (high self_awareness), not weakness
- Sharp/precise answers added as analytical_reasoning signal
- `self_awareness` (×1) added to cognitive score calculation in `cognitiveScore.ts`

### Emotional Profile
- `self_awareness` distinction: conscious critique = high score, superficial apology = low

### Group Prompt (General)
- `career_prestige` for academic lecturer → 40-55 (was incorrectly falling into 15-30)

### Style Prompt — Major Overhaul (personal-style-system.txt)
- **Differentiating rules**: absent evidence → score 20-35 (not 50); negative evidence (no mention of parties) counts
- **Key distinctions added**:
  - Yoga/meditation = mainstream urban, NOT hippie/rural
  - Theater (mainstream attendance) ≠ urban scene ≠ high culture
  - Life constraints (baby, workload) ≠ personality traits
- **Salience**: identify 2-3 defining traits per user with higher confidence
- **Combination signals**: geekiness requires 3+ signals → 75+
- **DB weight rebalance**: w=5→2 for background traits, w=1→2 for lifestyle traits (done directly in prod)

---

## 2026-10-03 — Agent Created
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

### 📋 TODO: שיפור ניתוח והתאמה — 3 תחומים (2026-10-20)
**עדיפות: גבוהה**

**1. ניתוח חיצוני + התאמה חיצונית**
- הניתוח החיצוני (AI look traits) והציון החיצוני בהתאמה לא מספיק טובים
- צריך לבחון: האם הprompt מספיק מדויק? האם ההשוואה (Gaussian) מתאימה? האם המשקלים נכונים?

**2. ניתוח סגנון + התאמת סגנון**
- Style traits עדיין לא מספיק מבדילים
- הprompt שופר (2026-10-18) אבל צריך מוניטור ושיפור נוסף

**3. Deal breakers + מאפיינים ספציפיים**
- יש traits כמו deal_breakers (text), has_children, smoker, religion
- אלה לא באים לידי ביטוי בציון ההתאמה — צריך שיבואו
- התחלנו לבנות ניתוח של זה (general-info prompt) אבל חסרה אינטגרציה עם Matching

**4. Traits חדשים מ-taste test WW (תלות בסוכן Conversation)**
- נשיות-גבריות (fem_personal, fem_desired כבר קיימים אבל רק כ-look traits)
- פתיחות לארון (closeted_openness)
- ניסיון עם נשים (ww_experience)
- צריך להגדיר trait_definitions חדשים ולשלב ב-analysis prompts

**קבצים רלוונטיים:**
- `agents/analysis/prompts/*.txt` — כל הprompts
- `agents/analysis/agent.ts` — ריצת הניתוח
- `schema.pg.ts` — trait_definitions, deal_breaker_definitions
- `matchStage2.ts` — הציון שמשתמש ב-traits (סוכן Matching)
