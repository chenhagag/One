# Matching Algorithm Agent — Work Log

## Latest: 2026-10-18 — Scoring Overhaul + Age Tolerance

### Scoring: Option C — Shrink-to-Neutral + Confidence-as-Weight
Changed how confidence affects matching scores (matchStage2.ts):
- **Match value**: below conf 0.4 → shrink toward 50 (`match = 50 + sharedConf * (rawMatch - 50)`)
  - Prevents two guesses at 60/conf=0.4 from scoring as perfect 100% match
  - Above conf 0.4: no shrink, full rawMatch preserved
- **Weight**: sharedConf used as weight multiplier (low-conf traits take less space in weighted average)
- **Skip threshold**: traits with sharedConf < 0.15 skipped entirely (eliminates false 100% from default 50/0.1 traits like oriental, soviet_style)
- **Salience boost**: identity-defining traits get extra weight
- Replaced old `confFactor = min(1, sharedConf/0.3)` blend formula

### Age-Dependent Tolerance (matchStage1.ts)
- Base: not_flexible=±1, slightly_flexible=±2, very_flexible=±3
- Multiplier by decade: 20s ×1, 30s ×1.5, 40s ×2, 50s ×2.5
- Example: 30s slightly_flexible = ±3, 40s very_flexible = ±6
- 12 missing cities added to production DB with correct region mappings

### Style Trait Weight Rebalance
- DB weights changed directly in prod: w=5→2 for background traits, w=1→2 for lifestyle
- Detailed comparison document: `style-comparison.md` (עדי, נוי, טלי)

---

## 2026-10-03 — Agent Created
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

### 📋 TODO: שילוב deal breakers + מאפיינים בציון (2026-10-20)
**עדיפות: גבוהה**

**מצב נוכחי:**
- matchStage1 מסנן לפי gender, age, location, cognitive, toxicity
- matchStage2 מחשב ציון לפי trait similarity (Gaussian) + external score
- deal breakers (עישון, ילדים, דת, דרישות ספציפיות) לא משתקפים בציון

**מה צריך:**
1. **Deal breaker filtering ב-Stage 1** — אם X מעשנת ו-Y כתבה "לא מעשנת" כ-deal breaker → לא להתאים
2. **Deal breaker penalty ב-Stage 2** — אם יש התנגשות חלקית (למשל ילדים כשהצד השני מעדיף בלי) → הורדת ציון
3. **התאמה חיצונית** — ציון חיצוני לא מספיק טוב, צריך לבחון משקלים ושיטת חישוב
4. **Traits חדשים מ-WW taste** — נשיות-גבריות, פתיחות לארון → שילוב בציון

**תלות:** Analysis agent מגדיר traits חדשים, סוכן זה משלב אותם בחישוב
