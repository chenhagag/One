/**
 * Match Stage 1 — Candidate Array Builder
 * ========================================
 * Finds all eligible users, applies fixed + personal filters,
 * and writes passing pairs to candidate_matches with status = 'pending_score'.
 *
 * Field mapping (spec term → actual DB column):
 *   ready_for_match          → is_matchable (INTEGER: 1 = ready, 0 = not)
 *   status = waiting_for_match → user_status = 'waiting_match'
 *   toxic / troll score      → user_traits for toxicity_score (id=32) / trollness (id=33)
 *   valid and real user      → valid_person = 1 AND is_real_user = 1
 *   approval_rate            → initial_attraction_signal (on users table)
 *   "לא גמיש"               → not_flexible
 *   "אפשר להרחיב קצת"       → slightly_flexible
 *   "גמיש"                   → very_flexible
 *   "לא יוצא מהעיר"          → my_city
 *   "באזור שלי"              → my_area
 *   "מוכן לנסוע קצת יותר"    → bit_further
 *   "כל הארץ"                → whole_country
 *   "גם וגם"                 → both
 *   "לא משנה לי"             → doesnt_matter
 *
 * ── Scale reference ──────────────────────────────────────────────
 *   is_matchable               → INTEGER 0/1 (boolean). Spec threshold 0.8 → must be 1.
 *   user_traits.score          → REAL 0–100. Spec threshold 0.6 → 60.
 *   user_traits.confidence     → REAL 0–1. Compared directly.
 *   initial_attraction_signal  → REAL 0–100. Approval filter uses ±30 on this scale.
 *   weight_for_match           → REAL, varies (trait_defs: 1–10, look_trait_defs: 0–100).
 *   weight_confidence          → REAL 0–1. Compared directly.
 *   desired_value_confidence   → REAL 0–1. Compared directly.
 *   personal_value_confidence  → REAL 0–1. Compared directly.
 */

import Database from "better-sqlite3";

// ══════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════

// Trait definition IDs (from sort_order / seedDefinitions)
const TRAIT_IDS = {
  cognitive_profile: 1,
  vibe: 2,
  emotional_stability: 3,
  family_orientation: 6,
  party_orientation: 7,
  religiosity: 14,
  value_rigidity: 23,
  toxicity_score: 32,
  trollness: 33,
  sexual_identity: 34,
} as const;

const LOOK_TRAIT_IDS = {
  body_type: 4,
  gender_expression: 10,
} as const;

// ── Thresholds ───────────────────────────────────────────────────
// All thresholds are documented with their storage scale.

// user_traits.score is 0–100. Spec "< 0.6" means < 60 on this scale.
const TOXICITY_THRESHOLD = 60;   // score 0–100; users with score >= 60 are excluded
const TROLLNESS_THRESHOLD = 60;  // score 0–100; users with score >= 60 are excluded

// sexual_identity: score 0–100, "special" if > 50; confidence is 0–1, threshold 0.6
const SEXUAL_IDENTITY_SCORE_THRESHOLD = 50;  // score 0–100
const SEXUAL_IDENTITY_CONF_THRESHOLD = 0.6;  // confidence 0–1

// personal_value_confidence is 0–1; filter only applies when >= 0.8
const LOOK_TRAIT_CONFIDENCE_THRESHOLD = 0.8; // confidence 0–1

// Effective preference weight threshold for applying personal filters.
// effective_weight = weight_for_match * weight_confidence * confidence
// For personality traits: weight_for_match is 1–10, weight_confidence 0–1, confidence 0–1 → max ~10
// For look traits: weight_for_match is 0–100, weight_confidence 0–1, desired_value_confidence 0–1 → max ~100
// The spec says > 80 — this applies to look traits on the 0–100 scale.
// For personality traits, effective max is ~10, so this threshold effectively never triggers
// unless weight_for_match is on a different scale. We keep 80 as stated in the spec.
const EFFECTIVE_WEIGHT_THRESHOLD = 80;

// Flexibility tolerances (years / cm)
const AGE_TOL: Record<string, number> = { not_flexible: 1, slightly_flexible: 3, very_flexible: 5 };
const HEIGHT_TOL: Record<string, number> = { not_flexible: 2, slightly_flexible: 5, very_flexible: 10 };

// Approval rate tolerance (on 0–100 scale, same as initial_attraction_signal)
const APPROVAL_RATE_TOLERANCE = 30;

// cognitive_profile is a FIXED filter — always applied, no effective_weight gate.
// Score is 0–100, tolerance ±20.
const COGNITIVE_PROFILE_TOLERANCE = 20;

// Personal filter traits: [trait_definition_id, allowed_score_range on 0–100 scale]
const PERSONAL_FILTER_TRAITS: [number, number][] = [
  [TRAIT_IDS.vibe, 30],
  [TRAIT_IDS.emotional_stability, 15],
  [TRAIT_IDS.family_orientation, 20],
  [TRAIT_IDS.party_orientation, 20],
  [TRAIT_IDS.religiosity, 20],
  [TRAIT_IDS.value_rigidity, 20],
];

// Acceptable body types when user desires slim/toned/muscular
const ACCEPTABLE_BODY_TYPES = new Set(["slim", "toned", "muscular"]);

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

interface User {
  id: number;
  age: number | null;
  gender: string | null;
  looking_for_gender: string | null;
  city: string | null;
  height: number | null;
  desired_age_min: number | null;
  desired_age_max: number | null;
  age_flexibility: string;
  desired_height_min: number | null;
  desired_height_max: number | null;
  height_flexibility: string;
  desired_location_range: string;
  initial_attraction_signal: number | null; // 0–100 scale
  updated_at: string;
}

interface TraitScore {
  score: number;      // 0–100
  confidence: number; // 0–1
  weight_for_match: number;
  weight_confidence: number; // 0–1
}

interface LookTrait {
  personal_value: string | null;
  personal_value_confidence: number | null;  // 0–1
  desired_value: string | null;
  desired_value_confidence: number | null;   // 0–1
  weight_for_match: number | null;           // 0–100
  weight_confidence: number | null;          // 0–1
}

// ══════════════════════════════════════════════════════════════════
// THRESHOLD HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * Checks if a user passes the toxicity/trollness eligibility check.
 * Both scores are on the 0–100 scale. Spec threshold "< 0.6" = < 60.
 */
function passesToxicityCheck(
  userId: number,
  getTrait: (uid: number, tid: number) => TraitScore | null,
): boolean {
  const tox = getTrait(userId, TRAIT_IDS.toxicity_score);
  if (tox && tox.score >= TOXICITY_THRESHOLD) return false;

  const troll = getTrait(userId, TRAIT_IDS.trollness);
  if (troll && troll.score >= TROLLNESS_THRESHOLD) return false;

  return true;
}

/**
 * Returns whether a user has a "special" sexual identity.
 * score is 0–100 (threshold: > 50), confidence is 0–1 (threshold: >= 0.6).
 */
function hasSpecialSexualIdentity(
  userId: number,
  getTrait: (uid: number, tid: number) => TraitScore | null,
): boolean {
  const t = getTrait(userId, TRAIT_IDS.sexual_identity);
  return !!(t && t.score > SEXUAL_IDENTITY_SCORE_THRESHOLD && t.confidence >= SEXUAL_IDENTITY_CONF_THRESHOLD);
}

// ══════════════════════════════════════════════════════════════════
// FRESHNESS — getUserLastMatchRelevantUpdate
// ══════════════════════════════════════════════════════════════════

/**
 * Returns the latest timestamp across all data sources used by stage 1 filtering
 * for a given user. This is the MAX of:
 *   - users.updated_at          (age, gender, preferences, city, height, etc.)
 *   - MAX(user_traits.updated_at)  (personality trait scores used in filtering)
 *   - MAX(user_look_traits.updated_at) (look trait values used in filtering)
 *   - MAX(profiles.created_at)  (profiles table has no updated_at; created_at is best available)
 *
 * All timestamps are ISO strings (datetime format), so MAX via string comparison works.
 */
function makeGetUserLastMatchRelevantUpdate(db: Database.Database): (userId: number) => string {
  const stmt = db.prepare(`
    SELECT MAX(ts) as latest FROM (
      SELECT updated_at as ts FROM users WHERE id = ?
      UNION ALL
      SELECT MAX(updated_at) as ts FROM user_traits WHERE user_id = ?
      UNION ALL
      SELECT MAX(updated_at) as ts FROM user_look_traits WHERE user_id = ?
      UNION ALL
      SELECT MAX(created_at) as ts FROM profiles WHERE user_id = ?
    )
  `);

  // Cache results within a single stage 1 run
  const cache = new Map<number, string>();

  return (userId: number): string => {
    const cached = cache.get(userId);
    if (cached) return cached;
    const row = stmt.get(userId, userId, userId, userId) as { latest: string | null };
    const result = row.latest ?? "1970-01-01 00:00:00";
    cache.set(userId, result);
    return result;
  };
}

// ══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ══════════════════════════════════════════════════════════════════

export function runStage1(db: Database.Database): { pairs: number; skipped: number; users: number } {

  // 1. Load eligible users
  //    - is_matchable = 1 (INTEGER boolean; spec "ready_for_match > 0.8" → must be 1)
  //    - valid_person = 1 (INTEGER boolean)
  //    - user_status = 'waiting_match' (TEXT enum)
  //    - toxicity / trollness checked separately below (score 0–100, threshold 60)
  const allCandidateUsers = db.prepare(`
    SELECT u.id, u.age, u.gender, u.looking_for_gender, u.city, u.height,
           u.desired_age_min, u.desired_age_max, u.age_flexibility,
           u.desired_height_min, u.desired_height_max, u.height_flexibility,
           u.desired_location_range, u.initial_attraction_signal, u.updated_at
    FROM users u
    WHERE u.is_matchable = 1
      AND u.valid_person = 1
      AND u.user_status = 'waiting_match'
  `).all() as User[];

  // 2. Pre-load trait/look-trait accessors
  const traitStmt = db.prepare(
    "SELECT score, confidence, weight_for_match, weight_confidence FROM user_traits WHERE user_id = ? AND trait_definition_id = ?"
  );
  const lookTraitStmt = db.prepare(
    "SELECT personal_value, personal_value_confidence, desired_value, desired_value_confidence, weight_for_match, weight_confidence FROM user_look_traits WHERE user_id = ? AND look_trait_definition_id = ?"
  );

  function getUserTrait(userId: number, traitId: number): TraitScore | null {
    return (traitStmt.get(userId, traitId) as TraitScore) || null;
  }
  function getUserLookTrait(userId: number, lookTraitId: number): LookTrait | null {
    return (lookTraitStmt.get(userId, lookTraitId) as LookTrait) || null;
  }

  // 3. Filter out users with high toxicity or trollness (score 0–100, threshold 60)
  const users = allCandidateUsers.filter((u) => passesToxicityCheck(u.id, getUserTrait));

  // 4. Pre-load geography lookups
  const cityRegionStmt = db.prepare("SELECT region FROM cities WHERE city_name = ?");
  const adjacencyStmt = db.prepare("SELECT nearby_region FROM region_adjacency WHERE region = ?");

  function getRegion(city: string | null): string | null {
    if (!city) return null;
    const row = cityRegionStmt.get(city) as { region: string } | undefined;
    return row?.region ?? null;
  }
  function getNearbyRegions(region: string): Set<string> {
    const rows = adjacencyStmt.all(region) as { nearby_region: string }[];
    const set = new Set(rows.map((r) => r.nearby_region));
    set.add(region);
    return set;
  }

  // 5. Freshness helper
  const getUserLastUpdate = makeGetUserLastMatchRelevantUpdate(db);

  // 6. Check existing candidate_matches
  const existingStmt = db.prepare(
    "SELECT id, updated_at FROM candidate_matches WHERE user_id = ? AND candidate_user_id = ?"
  );

  // 7. Prepare insert/update/delete statements
  const insertStmt = db.prepare(`
    INSERT INTO candidate_matches (user_id, candidate_user_id, status, filtering_passed, last_evaluated_at, user1_last_source_update, user2_last_source_update)
    VALUES (?, ?, 'pending_score', 1, datetime('now'), ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE candidate_matches
    SET status = 'pending_score', filtering_passed = 1, last_evaluated_at = datetime('now'),
        user1_last_source_update = ?, user2_last_source_update = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const deleteStaleStmt = db.prepare(
    "DELETE FROM candidate_matches WHERE user_id = ? AND candidate_user_id = ? AND filtering_passed = 1 AND status = 'pending_score'"
  );

  // 8. Run filtering for all pairs
  let pairsCreated = 0;
  let pairsSkipped = 0;

  db.transaction(() => {
    for (const a of users) {
      for (const b of users) {
        if (a.id >= b.id) continue; // avoid duplicates and self-match

        // Freshness check: is the existing row newer than both users' latest relevant updates?
        const existing = existingStmt.get(a.id, b.id) as { id: number; updated_at: string } | undefined;
        if (existing) {
          const aLastUpdate = getUserLastUpdate(a.id);
          const bLastUpdate = getUserLastUpdate(b.id);
          if (existing.updated_at >= aLastUpdate && existing.updated_at >= bLastUpdate) {
            pairsSkipped++;
            continue; // existing row is still fresh
          }
        }

        // Apply all filters (bidirectional)
        const passes = passesAllFilters(a, b, getUserTrait, getUserLookTrait, getRegion, getNearbyRegions);

        const aLastUpdate = getUserLastUpdate(a.id);
        const bLastUpdate = getUserLastUpdate(b.id);

        if (passes) {
          if (existing) {
            updateStmt.run(aLastUpdate, bLastUpdate, existing.id);
          } else {
            insertStmt.run(a.id, b.id, aLastUpdate, bLastUpdate);
          }
          pairsCreated++;
        } else {
          // Remove stale passing row that no longer passes filters
          if (existing) {
            deleteStaleStmt.run(a.id, b.id);
          }
        }
      }
    }
  })();

  return { pairs: pairsCreated, skipped: pairsSkipped, users: users.length };
}

// ══════════════════════════════════════════════════════════════════
// FILTER FUNCTIONS
// ══════════════════════════════════════════════════════════════════

function passesAllFilters(
  a: User,
  b: User,
  getTrait: (uid: number, tid: number) => TraitScore | null,
  getLookTrait: (uid: number, ltid: number) => LookTrait | null,
  getRegion: (city: string | null) => string | null,
  getNearbyRegions: (region: string) => Set<string>,
): boolean {
  if (!passesGenderFilter(a, b)) return false;
  if (!passesGenderFilter(b, a)) return false;

  if (!passesAgeFilter(a, b)) return false;
  if (!passesAgeFilter(b, a)) return false;

  if (!passesLocationFilter(a, b, getRegion, getNearbyRegions)) return false;
  if (!passesLocationFilter(b, a, getRegion, getNearbyRegions)) return false;

  if (!passesHeightFilter(a, b)) return false;
  if (!passesHeightFilter(b, a)) return false;

  if (!passesApprovalFilter(a, b)) return false;

  // Fixed filter: cognitive_profile ±20 (always applied, no effective_weight gate)
  if (!passesCognitiveFilter(a, b, getTrait)) return false;

  if (!passesSexualIdentityFilter(a, b, getTrait)) return false;

  if (!passesPersonalTraitFilters(a, b, getTrait)) return false;

  if (!passesBodyTypeFilter(a, b, getLookTrait)) return false;
  if (!passesBodyTypeFilter(b, a, getLookTrait)) return false;

  if (!passesGenderExpressionFilter(a, b, getLookTrait)) return false;
  if (!passesGenderExpressionFilter(b, a, getLookTrait)) return false;

  return true;
}

// ── 1. Gender ────────────────────────────────────────────────────
function passesGenderFilter(from: User, to: User): boolean {
  const pref = from.looking_for_gender;
  if (!pref || pref === "both" || pref === "doesnt_matter") return true;
  if (!to.gender) return true;
  return pref === to.gender;
}

// ── 2. Age ───────────────────────────────────────────────────────
function passesAgeFilter(from: User, to: User): boolean {
  if (to.age == null) return true;
  if (from.desired_age_min == null && from.desired_age_max == null) return true;
  const tol = AGE_TOL[from.age_flexibility] ?? 3;
  const min = (from.desired_age_min ?? 0) - tol;
  const max = (from.desired_age_max ?? 999) + tol;
  return to.age >= min && to.age <= max;
}

// ── 3. Location ──────────────────────────────────────────────────
function passesLocationFilter(
  from: User, to: User,
  getRegion: (city: string | null) => string | null,
  getNearbyRegions: (region: string) => Set<string>,
): boolean {
  const pref = from.desired_location_range;
  if (pref === "whole_country") return true;

  const fromRegion = getRegion(from.city);
  const toRegion = getRegion(to.city);
  if (!fromRegion || !toRegion) return true;

  if (pref === "my_city") return from.city === to.city;
  if (pref === "my_area") return fromRegion === toRegion;
  if (pref === "bit_further") return getNearbyRegions(fromRegion).has(toRegion);
  return true;
}

// ── 4. Height ────────────────────────────────────────────────────
function passesHeightFilter(from: User, to: User): boolean {
  if (to.height == null) return true;
  if (from.desired_height_min == null && from.desired_height_max == null) return true;
  const tol = HEIGHT_TOL[from.height_flexibility] ?? 5;
  const min = (from.desired_height_min ?? 0) - tol;
  const max = (from.desired_height_max ?? 999) + tol;
  return to.height >= min && to.height <= max;
}

// ── 5. Approval rate ─────────────────────────────────────────────
// initial_attraction_signal is on 0–100 scale. Tolerance is ±30 on same scale.
function passesApprovalFilter(a: User, b: User): boolean {
  if (a.initial_attraction_signal == null || b.initial_attraction_signal == null) return true;
  return Math.abs(a.initial_attraction_signal - b.initial_attraction_signal) <= APPROVAL_RATE_TOLERANCE;
}

// ── 5b. Cognitive profile (FIXED filter — always applied) ────────
// Score is 0–100. Candidates must be within ±20 of each other.
// This is a fixed compatibility filter, not gated by effective_weight.
function passesCognitiveFilter(
  a: User, b: User,
  getTrait: (uid: number, tid: number) => TraitScore | null,
): boolean {
  const aT = getTrait(a.id, TRAIT_IDS.cognitive_profile);
  const bT = getTrait(b.id, TRAIT_IDS.cognitive_profile);
  if (!aT || !bT) return true; // no data → don't filter out
  return Math.abs(aT.score - bT.score) <= COGNITIVE_PROFILE_TOLERANCE;
}

// ── 6. Sexual identity ──────────────────────────────────────────
function passesSexualIdentityFilter(
  a: User, b: User,
  getTrait: (uid: number, tid: number) => TraitScore | null,
): boolean {
  const aSpecial = hasSpecialSexualIdentity(a.id, getTrait);
  const bSpecial = hasSpecialSexualIdentity(b.id, getTrait);

  if (aSpecial && bSpecial) return true;
  if (aSpecial && !bSpecial) return b.looking_for_gender === "doesnt_matter";
  if (!aSpecial && bSpecial) return a.looking_for_gender === "doesnt_matter";
  return true;
}

// ── 7. Personal filter traits ────────────────────────────────────
// effective_weight = weight_for_match * weight_confidence * confidence
// All three are on mixed scales (see threshold comment above).
// Threshold: > EFFECTIVE_WEIGHT_THRESHOLD (80).
// Score difference is on the 0–100 scale.
function passesPersonalTraitFilters(
  a: User, b: User,
  getTrait: (uid: number, tid: number) => TraitScore | null,
): boolean {
  for (const [traitId, range] of PERSONAL_FILTER_TRAITS) {
    const aTrait = getTrait(a.id, traitId);
    const bTrait = getTrait(b.id, traitId);
    if (!aTrait || !bTrait) continue;

    const aEff = (aTrait.weight_for_match ?? 0) * (aTrait.weight_confidence ?? 1) * (aTrait.confidence ?? 1);
    const bEff = (bTrait.weight_for_match ?? 0) * (bTrait.weight_confidence ?? 1) * (bTrait.confidence ?? 1);

    if (aEff > EFFECTIVE_WEIGHT_THRESHOLD || bEff > EFFECTIVE_WEIGHT_THRESHOLD) {
      // score is 0–100; range is on the same scale
      if (Math.abs(aTrait.score - bTrait.score) > range) return false;
    }
  }
  return true;
}

// ── 8. Body type ─────────────────────────────────────────────────
// weight_for_match (0–100) * weight_confidence (0–1) * desired_value_confidence (0–1)
// personal_value_confidence is 0–1, threshold 0.8
function passesBodyTypeFilter(
  from: User, to: User,
  getLookTrait: (uid: number, ltid: number) => LookTrait | null,
): boolean {
  const fromLT = getLookTrait(from.id, LOOK_TRAIT_IDS.body_type);
  if (!fromLT || !fromLT.desired_value) return true;
  if (!ACCEPTABLE_BODY_TYPES.has(fromLT.desired_value)) return true;

  const eff = (fromLT.weight_for_match ?? 0) * (fromLT.weight_confidence ?? 1) * (fromLT.desired_value_confidence ?? 1);
  if (eff <= EFFECTIVE_WEIGHT_THRESHOLD) return true;

  const toLT = getLookTrait(to.id, LOOK_TRAIT_IDS.body_type);
  if (!toLT || !toLT.personal_value) return true;
  if ((toLT.personal_value_confidence ?? 0) < LOOK_TRAIT_CONFIDENCE_THRESHOLD) return true;

  return ACCEPTABLE_BODY_TYPES.has(toLT.personal_value);
}

// ── 9. Gender expression ─────────────────────────────────────────
// Same scale logic as body type
function passesGenderExpressionFilter(
  from: User, to: User,
  getLookTrait: (uid: number, ltid: number) => LookTrait | null,
): boolean {
  const fromLT = getLookTrait(from.id, LOOK_TRAIT_IDS.gender_expression);
  if (!fromLT || !fromLT.desired_value) return true;

  const eff = (fromLT.weight_for_match ?? 0) * (fromLT.weight_confidence ?? 1) * (fromLT.desired_value_confidence ?? 1);
  if (eff <= EFFECTIVE_WEIGHT_THRESHOLD) return true;

  const toLT = getLookTrait(to.id, LOOK_TRAIT_IDS.gender_expression);
  if (!toLT || !toLT.personal_value) return true;
  if ((toLT.personal_value_confidence ?? 0) < LOOK_TRAIT_CONFIDENCE_THRESHOLD) return true;

  return fromLT.desired_value === toLT.personal_value;
}
