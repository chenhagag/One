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

export function runStage2(db: Database.Database): { scored: number; skipped: number; promoted_to_matches: number } {

  // Load trait definitions for calc_type filtering
  const traitDefRows = db.prepare("SELECT id, calc_type, weight FROM trait_definitions").all() as TraitDef[];
  const traitDefs = new Map<number, TraitDef>();
  for (const td of traitDefRows) traitDefs.set(td.id, td);

  // Get all pending candidates
  const pending = db.prepare(
    "SELECT id, user_id, candidate_user_id FROM candidate_matches WHERE status = 'pending_score'"
  ).all() as { id: number; user_id: number; candidate_user_id: number }[];

  if (pending.length === 0) {
    // No new scoring needed, but still run promotion + counts
    updateMatchCounts(db);
    const promoted_to_matches = promoteToMatches(db);
    updateSystemMatchPriority(db);
    return { scored: 0, skipped: 0, promoted_to_matches };
  }

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

  // Update per-user match counts, promote qualifying candidates to matches,
  // then recalculate system priority. Does NOT select or freeze.
  updateMatchCounts(db);
  const promoted_to_matches = promoteToMatches(db);
  updateSystemMatchPriority(db);

  return { scored, skipped, promoted_to_matches };
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

// ── Promote scored candidates to matches table ──────────────────
//
// For each scored candidate_match with final_score >= min_match_score:
//   - If no matches row exists for this pair, create one with status = 'waiting_first_rating'.
//   - Skip pairs that already have a match record (any status, including cancelled/rejected).
//   - Update candidate_matches status to 'matched'.
//
// This bridges candidate_matches (algorithm output) → matches (lifecycle table).
// New matches begin the rating flow; they do NOT start as approved_by_both.

function promoteToMatches(db: Database.Database): number {
  const minScoreRow = db.prepare("SELECT value FROM config WHERE key = 'matching.min_match_score'").get() as { value: string } | undefined;
  const minScore = minScoreRow ? parseFloat(minScoreRow.value) : 50;

  const candidates = db.prepare(`
    SELECT id, user_id, candidate_user_id, final_score
    FROM candidate_matches
    WHERE status = 'scored' AND final_score IS NOT NULL AND final_score >= ?
  `).all(minScore) as { id: number; user_id: number; candidate_user_id: number; final_score: number }[];

  if (candidates.length === 0) return 0;

  // Check ANY existing match for this pair — including cancelled/rejected.
  // A pair that was already rejected or cancelled must not be re-created.
  const existsStmt = db.prepare(`
    SELECT id FROM matches
    WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
  `);

  const insertStmt = db.prepare(`
    INSERT INTO matches (user1_id, user2_id, match_score, status)
    VALUES (?, ?, ?, 'waiting_first_rating')
  `);

  const markStmt = db.prepare(`
    UPDATE candidate_matches SET status = 'matched', updated_at = datetime('now') WHERE id = ?
  `);

  let created = 0;

  db.transaction(() => {
    for (const c of candidates) {
      const exists = existsStmt.get(c.user_id, c.candidate_user_id, c.candidate_user_id, c.user_id);
      if (exists) {
        markStmt.run(c.id);
        continue;
      }
      insertStmt.run(c.user_id, c.candidate_user_id, Math.round(c.final_score * 100) / 100);
      markStmt.run(c.id);
      created++;
    }
  })();

  return created;
}

// ── System match priority ───────────────────────────────────────
//
// Formula:
//   waitingDaysScore     = MIN(waitingDays * 5, 100)
//   generalMatchesScore  = MAX(0, 100 - totalMatches * 10)
//   goodMatchesScore     = MAX(0, 100 - goodMatches * 10)
//   system_match_priority = 0.4 * waitingDaysScore
//                         + 0.2 * generalMatchesScore
//                         + 0.4 * goodMatchesScore
//
// waiting_since = NULL means user has an active match → priority 0.

function updateSystemMatchPriority(db: Database.Database) {
  const users = db.prepare(`
    SELECT id, waiting_since, total_matches, good_matches FROM users
  `).all() as {
    id: number;
    waiting_since: string | null;
    total_matches: number;
    good_matches: number;
  }[];

  const updateStmt = db.prepare(`
    UPDATE users SET system_match_priority = ?, updated_at = datetime('now') WHERE id = ?
  `);

  const now = Date.now();

  db.transaction(() => {
    for (const u of users) {
      // Not waiting (has active match) → priority 0
      if (!u.waiting_since) {
        updateStmt.run(0, u.id);
        continue;
      }

      const ms = now - new Date(u.waiting_since + "Z").getTime();
      const waitingDays = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));

      const waitingDaysScore = Math.min(waitingDays * 5, 100);
      const generalMatchesScore = Math.max(0, 100 - (u.total_matches ?? 0) * 10);
      const goodMatchesScore = Math.max(0, 100 - (u.good_matches ?? 0) * 10);

      const priority =
        0.4 * waitingDaysScore +
        0.2 * generalMatchesScore +
        0.4 * goodMatchesScore;

      updateStmt.run(Math.round(priority * 100) / 100, u.id);
    }
  })();
}

// ══════════════════════════════════════════════════════════════════
// MATCHMAKING — Selection and freeze (separate from scoring)
// ══════════════════════════════════════════════════════════════════

/**
 * Runs the matchmaking selection flow on existing matches.
 * Does NOT regenerate candidates or re-score.
 *
 * Steps:
 *   1. Recalculate system_match_priority for all users (uses current waiting_days + counts)
 *   2. Calculate pair_priority + final_match_priority for approved_by_both matches
 *   3. Select top matches → pre_match, freeze competing matches
 */
export function runMatchmaking(db: Database.Database): { selection: { promoted: number; frozen: number } } {
  updateSystemMatchPriority(db);
  updateMatchSelectionPriority(db);
  const selection = selectAndFreezeMatches(db);
  return { selection };
}

// ── Match selection priority (approved_by_both only) ────────────
//
// For each match in status approved_by_both:
//
//   pair_priority        = (user1.system_match_priority + user2.system_match_priority) / 2
//   final_match_priority = 0.7 * match_score + 0.3 * pair_priority
//
// match_score is the existing overall score on the matches table (0–100).
// system_match_priority is already stored on each user (0–100).
// Matches with NULL match_score are skipped (no score to combine).

function updateMatchSelectionPriority(db: Database.Database) {
  const matches = db.prepare(`
    SELECT m.id, m.match_score, m.user1_id, m.user2_id,
           u1.system_match_priority AS u1_priority,
           u2.system_match_priority AS u2_priority
    FROM matches m
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    WHERE m.status = 'approved_by_both'
  `).all() as {
    id: number;
    match_score: number | null;
    user1_id: number;
    user2_id: number;
    u1_priority: number;
    u2_priority: number;
  }[];

  if (matches.length === 0) return;

  const updateStmt = db.prepare(`
    UPDATE matches
    SET pair_priority = ?, final_match_priority = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  db.transaction(() => {
    for (const m of matches) {
      if (m.match_score == null) continue;

      const pairPriority = ((m.u1_priority ?? 0) + (m.u2_priority ?? 0)) / 2;
      const finalPriority = 0.7 * m.match_score + 0.3 * pairPriority;

      updateStmt.run(
        Math.round(pairPriority * 100) / 100,
        Math.round(finalPriority * 100) / 100,
        m.id,
      );
    }
  })();
}

// ── Select top matches and freeze competing ones ────────────────
//
// Algorithm (greedy, priority-ordered):
//
// 1. Load all matches with status = 'approved_by_both', ordered by
//    final_match_priority DESC (highest priority first).
//
// 2. Track a set of "locked" user IDs (users already assigned a
//    pre_match in this run).
//
// 3. For each match in priority order:
//    a. If either user is already locked → skip (they got a higher-
//       priority match earlier in the loop).
//    b. Otherwise → promote this match to 'pre_match'.
//    c. Lock both users.
//    d. Find all OTHER matches involving either user whose status is
//       in {waiting_first_rating, waiting_second_rating, approved_by_both}.
//       For each: save current status into previous_status, set status = 'frozen'.
//
// Because we iterate highest-priority first and lock users immediately,
// lower-priority matches for the same users are naturally skipped in step 3a
// or frozen in step 3d.

const FREEZABLE_STATUSES = new Set([
  "waiting_first_rating",
  "waiting_second_rating",
  "approved_by_both",
]);

function selectAndFreezeMatches(db: Database.Database): { promoted: number; frozen: number } {
  // 1. Load approved matches in priority order
  const approved = db.prepare(`
    SELECT id, user1_id, user2_id, final_match_priority
    FROM matches
    WHERE status = 'approved_by_both'
      AND final_match_priority IS NOT NULL
    ORDER BY final_match_priority DESC
  `).all() as {
    id: number;
    user1_id: number;
    user2_id: number;
    final_match_priority: number;
  }[];

  if (approved.length === 0) return { promoted: 0, frozen: 0 };

  // 2. Prepared statements
  const promoteStmt = db.prepare(`
    UPDATE matches SET status = 'pre_match', updated_at = datetime('now')
    WHERE id = ?
  `);

  // When a match is promoted to pre_match, both users become in_match
  // and stop waiting (waiting_since = NULL).
  const lockUsersStmt = db.prepare(`
    UPDATE users
    SET user_status = 'in_match', waiting_since = NULL, updated_at = datetime('now')
    WHERE id IN (?, ?)
  `);

  const freezeStmt = db.prepare(`
    UPDATE matches
    SET previous_status = status, status = 'frozen', updated_at = datetime('now')
    WHERE id = ? AND status != 'frozen'
  `);

  // Find all other matches for a user that are in freezable statuses,
  // excluding a specific match ID (the one being promoted).
  const competingStmt = db.prepare(`
    SELECT id FROM matches
    WHERE id != ?
      AND (user1_id = ? OR user2_id = ? OR user1_id = ? OR user2_id = ?)
      AND status IN ('waiting_first_rating', 'waiting_second_rating', 'approved_by_both')
  `);

  // 3. Greedy selection
  const lockedUsers = new Set<number>();
  let promoted = 0;
  let frozen = 0;

  db.transaction(() => {
    for (const m of approved) {
      // 3a. Skip if either user is already locked by a higher-priority match
      if (lockedUsers.has(m.user1_id) || lockedUsers.has(m.user2_id)) continue;

      // 3b. Promote this match and update both users to in_match
      promoteStmt.run(m.id);
      lockUsersStmt.run(m.user1_id, m.user2_id);
      promoted++;

      // 3c. Lock both users
      lockedUsers.add(m.user1_id);
      lockedUsers.add(m.user2_id);

      // 3d. Freeze competing matches for both users
      const competing = competingStmt.all(
        m.id, m.user1_id, m.user1_id, m.user2_id, m.user2_id,
      ) as { id: number }[];

      for (const c of competing) {
        const result = freezeStmt.run(c.id);
        frozen += result.changes;
      }
    }
  })();

  return { promoted, frozen };
}
