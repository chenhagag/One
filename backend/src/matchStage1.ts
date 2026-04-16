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
import { queryAll, withTransaction } from "./db.pg";

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

// ══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT (pg-only, async)
// ══════════════════════════════════════════════════════════════════

export async function runStage1(_db: Database.Database): Promise<{ pairs: number; skipped: number; users: number }> {

  // 1. Load eligible users from pg
  const allCandidateUsers = await queryAll<User>(`
    SELECT u.id, u.age, u.gender, u.looking_for_gender, u.city, u.height,
           u.desired_age_min, u.desired_age_max, u.age_flexibility,
           u.desired_height_min, u.desired_height_max, u.height_flexibility,
           u.desired_location_range, u.initial_attraction_signal, u.updated_at
    FROM users u
    WHERE u.is_matchable = TRUE
      AND u.valid_person = TRUE
      AND u.user_status = 'waiting_match'
  `);

  // 2. Load ALL user_traits into a keyed map — avoids N*M per-pair queries
  const traitRows = await queryAll<{
    user_id: number; trait_definition_id: number;
    score: number; confidence: number; weight_for_match: number; weight_confidence: number;
  }>(`SELECT user_id, trait_definition_id, score, confidence, weight_for_match, weight_confidence FROM user_traits`);
  const traitMap = new Map<string, TraitScore>();
  for (const t of traitRows) {
    traitMap.set(`${t.user_id}:${t.trait_definition_id}`, {
      score: t.score, confidence: t.confidence,
      weight_for_match: t.weight_for_match, weight_confidence: t.weight_confidence,
    });
  }
  const getUserTrait = (uid: number, tid: number): TraitScore | null =>
    traitMap.get(`${uid}:${tid}`) ?? null;

  const lookRows = await queryAll<{
    user_id: number; look_trait_definition_id: number;
    personal_value: string | null; personal_value_confidence: number | null;
    desired_value: string | null; desired_value_confidence: number | null;
    weight_for_match: number | null; weight_confidence: number | null;
  }>(`SELECT user_id, look_trait_definition_id, personal_value, personal_value_confidence,
             desired_value, desired_value_confidence, weight_for_match, weight_confidence
      FROM user_look_traits`);
  const lookMap = new Map<string, LookTrait>();
  for (const l of lookRows) {
    lookMap.set(`${l.user_id}:${l.look_trait_definition_id}`, {
      personal_value: l.personal_value, personal_value_confidence: l.personal_value_confidence,
      desired_value: l.desired_value, desired_value_confidence: l.desired_value_confidence,
      weight_for_match: l.weight_for_match, weight_confidence: l.weight_confidence,
    });
  }
  const getUserLookTrait = (uid: number, lid: number): LookTrait | null =>
    lookMap.get(`${uid}:${lid}`) ?? null;

  // 3. Filter out toxic / trollish users
  const users = allCandidateUsers.filter((u) => passesToxicityCheck(u.id, getUserTrait));

  // 4. Load cities + region_adjacency into maps
  const cityRows = await queryAll<{ city_name: string; region: string }>(
    `SELECT city_name, region FROM cities`
  );
  const cityRegionMap = new Map(cityRows.map(c => [c.city_name, c.region]));
  const adjRows = await queryAll<{ region: string; nearby_region: string }>(
    `SELECT region, nearby_region FROM region_adjacency`
  );
  const nearbyMap = new Map<string, Set<string>>();
  for (const a of adjRows) {
    if (!nearbyMap.has(a.region)) nearbyMap.set(a.region, new Set<string>([a.region]));
    nearbyMap.get(a.region)!.add(a.nearby_region);
  }
  const getRegion = (city: string | null): string | null =>
    city ? (cityRegionMap.get(city) ?? null) : null;
  const getNearbyRegions = (region: string): Set<string> =>
    nearbyMap.get(region) ?? new Set([region]);

  // 5. Freshness map — one pg query, pre-grouped per user
  const tsRows = await queryAll<{ user_id: number; latest: string }>(`
    SELECT user_id, MAX(ts)::text AS latest FROM (
      SELECT id AS user_id, updated_at AS ts FROM users
      UNION ALL
      SELECT user_id, updated_at FROM user_traits
      UNION ALL
      SELECT user_id, updated_at FROM user_look_traits
      UNION ALL
      SELECT user_id, created_at FROM profiles
    ) x
    GROUP BY user_id
  `);
  const lastUpdateMap = new Map(tsRows.map(r => [r.user_id, r.latest ?? "1970-01-01 00:00:00"]));
  const getUserLastUpdate = (uid: number) => lastUpdateMap.get(uid) ?? "1970-01-01 00:00:00";

  // 6. Load existing candidate_matches for all pairs we care about
  const existingRows = await queryAll<{ id: number; user_id: number; candidate_user_id: number; updated_at: string }>(
    `SELECT id, user_id, candidate_user_id, updated_at FROM candidate_matches`
  );
  const existingMap = new Map<string, { id: number; updated_at: string }>();
  for (const e of existingRows) {
    existingMap.set(`${e.user_id}:${e.candidate_user_id}`, { id: e.id, updated_at: e.updated_at });
  }

  // 7. Compute filter results in-memory
  type Action =
    | { kind: "insert"; aId: number; bId: number; aTs: string; bTs: string }
    | { kind: "update"; id: number; aTs: string; bTs: string }
    | { kind: "delete"; id: number };
  const actions: Action[] = [];
  let pairsCreated = 0;
  let pairsSkipped = 0;

  for (const a of users) {
    for (const b of users) {
      if (a.id >= b.id) continue;

      const existing = existingMap.get(`${a.id}:${b.id}`);
      const aTs = getUserLastUpdate(a.id);
      const bTs = getUserLastUpdate(b.id);

      if (existing && existing.updated_at >= aTs && existing.updated_at >= bTs) {
        pairsSkipped++;
        continue;
      }

      const passes = passesAllFilters(a, b, getUserTrait, getUserLookTrait, getRegion, getNearbyRegions);

      if (passes) {
        if (existing) actions.push({ kind: "update", id: existing.id, aTs, bTs });
        else actions.push({ kind: "insert", aId: a.id, bId: b.id, aTs, bTs });
        pairsCreated++;
      } else if (existing) {
        actions.push({ kind: "delete", id: existing.id });
      }
    }
  }

  // 8. Apply writes in a single pg transaction
  await withTransaction(async (client) => {
    for (const act of actions) {
      if (act.kind === "insert") {
        await client.query(
          `INSERT INTO candidate_matches
             (user_id, candidate_user_id, status, filtering_passed, last_evaluated_at,
              user1_last_source_update, user2_last_source_update)
           VALUES ($1, $2, 'pending_score', TRUE, NOW(), $3, $4)`,
          [act.aId, act.bId, act.aTs, act.bTs]
        );
      } else if (act.kind === "update") {
        await client.query(
          `UPDATE candidate_matches
           SET status = 'pending_score', filtering_passed = TRUE, last_evaluated_at = NOW(),
               user1_last_source_update = $1, user2_last_source_update = $2, updated_at = NOW()
           WHERE id = $3`,
          [act.aTs, act.bTs, act.id]
        );
      } else {
        await client.query(
          `DELETE FROM candidate_matches
           WHERE id = $1 AND filtering_passed = TRUE AND status = 'pending_score'`,
          [act.id]
        );
      }
    }
  });

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
