/**
 * Match Stage 2 — Score Calculation
 * ==================================
 * For every candidate_match with status = 'pending_score':
 *   1. Calculate internal_score (personality compatibility)
 *   2. Calculate external_score (appearance — placeholder for now)
 *   3. Combine into final_score with weighted ratio
 *   4. Update row: set scores, status = 'scored'
 *
 * Score formulas:
 *   Per trait:  match = 100 - |v1 - v2|
 *               shared_conf = sqrt(c1 * c2)
 *               avg_weight = (w1 + w2) / 2
 *               weighted_weight = avg_weight * shared_conf
 *               weighted_score = weighted_weight * match
 *
 *   Internal:   SUM(weighted_score) / SUM(weighted_weight)  → 0-100
 *
 *   Final:      internal_score * internal_ratio + external_score * external_ratio
 *
 * Weight ratios:
 *   Default:    internal 80%, external 20%
 *   If either user is appearance-sensitive (weighted score > 0.7):
 *               internal 75%, external 25%
 *
 * appearance_sensitivity trait ID = 30, stored on 0-100 scale.
 * "weighted appearance sensitivity > 0.7" means:
 *   (score/100) * confidence > 0.7
 */

import Database from "better-sqlite3";

// ── Constants ────────────────────────────────────────────────────

const APPEARANCE_SENSITIVITY_TRAIT_ID = 30;
const APPEARANCE_SENSITIVITY_THRESHOLD = 0.7; // on 0-1 scale after normalization

const DEFAULT_INTERNAL_RATIO = 0.80;
const DEFAULT_EXTERNAL_RATIO = 0.20;
const SENSITIVE_INTERNAL_RATIO = 0.75;
const SENSITIVE_EXTERNAL_RATIO = 0.25;

// Traits excluded from internal scoring.
// A trait is excluded ONLY if it is truly non-scoreable:
//   - internal_use: system-only metrics (toxicity, trollness, appearance_sensitivity, deal_breakers)
//   - special: uses a separate compatibility table, not score-based (style_type)
//
// Traits with calc_type "filter" (e.g. sexual_identity) are also excluded because
// they have weight=0 and represent identity categories, not scored dimensions.
//
// IMPORTANT: Traits used as stage 1 filters (cognitive_profile, vibe, family_orientation, etc.)
// all have calc_type="normal" and ARE included in scoring. Being a filter does not exclude
// a trait from scoring — only calc_type determines scoring eligibility.
const EXCLUDED_CALC_TYPES = new Set(["internal_use", "special"]);

// ── Types ────────────────────────────────────────────────────────

interface TraitRow {
  trait_definition_id: number;
  score: number;      // 0-100
  confidence: number; // 0-1
  weight_for_match: number;
}

interface TraitDef {
  id: number;
  calc_type: string;
  weight: number;
}

// ── External score placeholder ───────────────────────────────────

/**
 * Placeholder for external (appearance) score calculation.
 * Returns 100 for now. Replace with real logic in a future stage.
 */
function calculateExternalScore(
  _userId1: number,
  _userId2: number,
  _db: Database.Database,
): number {
  return 100;
}

// ── Internal score calculation ───────────────────────────────────

/**
 * Calculates personality compatibility between two users.
 * Only considers traits that exist for BOTH users and are not excluded by calc_type.
 *
 * Returns 0-100, or null if no shared scoreable traits exist (division-by-zero safe).
 */
function calculateInternalScore(
  user1Traits: Map<number, TraitRow>,
  user2Traits: Map<number, TraitRow>,
  traitDefs: Map<number, TraitDef>,
): number | null {
  let sumWeightedScore = 0;
  let sumWeightedWeight = 0;

  for (const [traitId, t1] of user1Traits) {
    const t2 = user2Traits.get(traitId);
    if (!t2) continue;

    // Skip non-scoreable traits:
    // - calc_type is internal_use or special
    // - definition weight is 0 (system/identity traits like sexual_identity)
    const def = traitDefs.get(traitId);
    if (def && (EXCLUDED_CALC_TYPES.has(def.calc_type) || def.weight === 0)) continue;

    // 1. Match score: how close are the two values (0-100)
    const match = 100 - Math.abs(t1.score - t2.score);

    // 2. Shared confidence: geometric mean of both confidences (0-1)
    const sharedConf = Math.sqrt(t1.confidence * t2.confidence);

    // 3. Average weight: mean of both users' weights for this trait
    const avgWeight = (t1.weight_for_match + t2.weight_for_match) / 2;

    // 4. Weighted weight: importance adjusted by confidence
    const weightedWeight = avgWeight * sharedConf;

    // 5. Weighted score: this trait's contribution
    const weightedScore = weightedWeight * match;

    sumWeightedScore += weightedScore;
    sumWeightedWeight += weightedWeight;
  }

  if (sumWeightedWeight === 0) return null;

  // Normalize to 0-100
  return sumWeightedScore / sumWeightedWeight;
}

// ── Appearance sensitivity check ─────────────────────────────────

/**
 * Checks if a user is appearance-sensitive.
 * appearance_sensitivity score is 0-100, confidence is 0-1.
 * Weighted sensitivity = (score/100) * confidence.
 * Threshold: > 0.7
 */
function isAppearanceSensitive(traits: Map<number, TraitRow>): boolean {
  const t = traits.get(APPEARANCE_SENSITIVITY_TRAIT_ID);
  if (!t) return false;
  const weighted = (t.score / 100) * t.confidence;
  return weighted > APPEARANCE_SENSITIVITY_THRESHOLD;
}

// ── Main entry point ─────────────────────────────────────────────

export function runStage2(db: Database.Database): { scored: number; skipped: number } {

  // Load trait definitions for calc_type filtering
  const traitDefRows = db.prepare("SELECT id, calc_type, weight FROM trait_definitions").all() as TraitDef[];
  const traitDefs = new Map<number, TraitDef>();
  for (const td of traitDefRows) traitDefs.set(td.id, td);

  // Get all pending candidates
  const pending = db.prepare(
    "SELECT id, user_id, candidate_user_id FROM candidate_matches WHERE status = 'pending_score'"
  ).all() as { id: number; user_id: number; candidate_user_id: number }[];

  if (pending.length === 0) return { scored: 0, skipped: 0 };

  // Prepare trait loader
  const loadTraitsStmt = db.prepare(
    "SELECT trait_definition_id, score, confidence, weight_for_match FROM user_traits WHERE user_id = ?"
  );

  // Cache trait maps per user
  const traitCache = new Map<number, Map<number, TraitRow>>();

  function getUserTraits(userId: number): Map<number, TraitRow> {
    const cached = traitCache.get(userId);
    if (cached) return cached;
    const rows = loadTraitsStmt.all(userId) as TraitRow[];
    const map = new Map<number, TraitRow>();
    for (const r of rows) map.set(r.trait_definition_id, r);
    traitCache.set(userId, map);
    return map;
  }

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE candidate_matches
    SET internal_score = ?, external_score = ?, final_score = ?,
        status = 'scored', last_evaluated_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);

  let scored = 0;
  let skipped = 0;

  db.transaction(() => {
    for (const row of pending) {
      const u1Traits = getUserTraits(row.user_id);
      const u2Traits = getUserTraits(row.candidate_user_id);

      const internalScore = calculateInternalScore(u1Traits, u2Traits, traitDefs);

      // Division-by-zero safety: if no scoreable shared traits exist,
      // internalScore is null. We store NULL scores and mark as 'scored'
      // so the row isn't reprocessed. These pairs have no usable compatibility data.
      if (internalScore == null) {
        updateStmt.run(null, null, null, row.id);
        skipped++;
        continue;
      }

      const externalScore = calculateExternalScore(row.user_id, row.candidate_user_id, db);

      // Determine weight ratio based on appearance sensitivity
      const sensitive = isAppearanceSensitive(u1Traits) || isAppearanceSensitive(u2Traits);
      const iRatio = sensitive ? SENSITIVE_INTERNAL_RATIO : DEFAULT_INTERNAL_RATIO;
      const eRatio = sensitive ? SENSITIVE_EXTERNAL_RATIO : DEFAULT_EXTERNAL_RATIO;

      const finalScore = internalScore * iRatio + externalScore * eRatio;

      updateStmt.run(
        Math.round(internalScore * 100) / 100,
        Math.round(externalScore * 100) / 100,
        Math.round(finalScore * 100) / 100,
        row.id,
      );
      scored++;
    }
  })();

  // Update per-user match counts
  updateMatchCounts(db);

  return { scored, skipped };
}

// ── Update total_matches and good_matches on users table ─────────

function updateMatchCounts(db: Database.Database) {
  db.exec(`
    UPDATE users SET
      total_matches = (
        SELECT COUNT(*) FROM candidate_matches
        WHERE user_id = users.id OR candidate_user_id = users.id
      ),
      good_matches = (
        SELECT COUNT(*) FROM candidate_matches
        WHERE (user_id = users.id OR candidate_user_id = users.id)
          AND final_score > 75
      )
  `);
}
