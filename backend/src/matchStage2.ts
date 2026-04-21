/**
 * Match Stage 2 — Score Calculation (pg-only)
 * ============================================
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
 */

import type Database from "better-sqlite3";
import { queryAll, queryOne, withTransaction } from "./db.pg";

// ── Constants ────────────────────────────────────────────────────

// Resolved dynamically in runStage2 from trait_definitions
let APPEARANCE_SENSITIVITY_TRAIT_ID = -1;
const APPEARANCE_SENSITIVITY_THRESHOLD = 0.7;

const DEFAULT_INTERNAL_RATIO = 0.80;
const DEFAULT_EXTERNAL_RATIO = 0.20;
const SENSITIVE_INTERNAL_RATIO = 0.75;
const SENSITIVE_EXTERNAL_RATIO = 0.25;

const EXCLUDED_CALC_TYPES = new Set(["internal_use", "special"]);

// ── Types ────────────────────────────────────────────────────────

interface TraitRow {
  trait_definition_id: number;
  score: number;
  confidence: number;
  weight_for_match: number;
}

interface TraitDef {
  id: number;
  calc_type: string;
  weight: number;
}

// ── External score placeholder ───────────────────────────────────

function calculateExternalScore(_userId1: number, _userId2: number): number {
  return 100;
}

// ── Internal score calculation (pure / sync) ─────────────────────

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

    const def = traitDefs.get(traitId);
    if (def && (EXCLUDED_CALC_TYPES.has(def.calc_type) || def.weight === 0)) continue;

    const match = 100 - Math.abs(t1.score - t2.score);
    const sharedConf = Math.sqrt(t1.confidence * t2.confidence);

    // Fall back to the trait definition's default weight when the AI
    // didn't produce a per-user weight_for_match (common — it's optional).
    const defWeight = def?.weight ?? 5;
    const w1 = t1.weight_for_match ?? defWeight;
    const w2 = t2.weight_for_match ?? defWeight;
    const avgWeight = (w1 + w2) / 2;

    const weightedWeight = avgWeight * sharedConf;
    const weightedScore = weightedWeight * match;

    sumWeightedScore += weightedScore;
    sumWeightedWeight += weightedWeight;
  }

  if (sumWeightedWeight === 0) return null;
  return sumWeightedScore / sumWeightedWeight;
}

function isAppearanceSensitive(traits: Map<number, TraitRow>): boolean {
  const t = traits.get(APPEARANCE_SENSITIVITY_TRAIT_ID);
  if (!t) return false;
  const weighted = (t.score / 100) * t.confidence;
  return weighted > APPEARANCE_SENSITIVITY_THRESHOLD;
}

// ── Main entry point ─────────────────────────────────────────────

export async function runStage2(_db: Database.Database): Promise<{ scored: number; skipped: number; promoted_to_matches: number }> {

  // Resolve appearance_sensitivity trait ID dynamically
  const asTrait = await queryOne<{ id: number }>(
    "SELECT id FROM trait_definitions WHERE internal_name = 'appearance_sensitivity'"
  );
  APPEARANCE_SENSITIVITY_TRAIT_ID = asTrait?.id ?? -1;

  // Load trait definitions
  const traitDefRows = await queryAll<TraitDef>(
    "SELECT id, calc_type, weight FROM trait_definitions"
  );
  const traitDefs = new Map<number, TraitDef>();
  for (const td of traitDefRows) traitDefs.set(td.id, td);

  // Get all pending candidates
  const pending = await queryAll<{ id: number; user_id: number; candidate_user_id: number }>(
    "SELECT id, user_id, candidate_user_id FROM candidate_matches WHERE status = 'pending_score'"
  );

  if (pending.length === 0) {
    await updateMatchCounts();
    const promoted_to_matches = await promoteToMatches();
    await updateSystemMatchPriority();
    return { scored: 0, skipped: 0, promoted_to_matches };
  }

  // Pre-load ALL user_traits for involved users at once
  const involvedUserIds = new Set<number>();
  for (const p of pending) { involvedUserIds.add(p.user_id); involvedUserIds.add(p.candidate_user_id); }
  const involvedIds = Array.from(involvedUserIds);

  const allTraits = await queryAll<{ user_id: number } & TraitRow>(
    `SELECT user_id, trait_definition_id, score, confidence, weight_for_match
     FROM user_traits
     WHERE user_id = ANY($1::int[])`,
    [involvedIds]
  );

  const traitCache = new Map<number, Map<number, TraitRow>>();
  for (const r of allTraits) {
    if (!traitCache.has(r.user_id)) traitCache.set(r.user_id, new Map());
    traitCache.get(r.user_id)!.set(r.trait_definition_id, {
      trait_definition_id: r.trait_definition_id,
      score: r.score, confidence: r.confidence, weight_for_match: r.weight_for_match,
    });
  }

  const getUserTraits = (uid: number): Map<number, TraitRow> =>
    traitCache.get(uid) ?? new Map();

  // Compute scores in memory
  type Update = { id: number; internal: number | null; external: number | null; final: number | null };
  const updates: Update[] = [];
  let scored = 0;
  let skipped = 0;

  for (const row of pending) {
    const u1Traits = getUserTraits(row.user_id);
    const u2Traits = getUserTraits(row.candidate_user_id);

    const internalScore = calculateInternalScore(u1Traits, u2Traits, traitDefs);

    if (internalScore == null) {
      updates.push({ id: row.id, internal: null, external: null, final: null });
      skipped++;
      continue;
    }

    const externalScore = calculateExternalScore(row.user_id, row.candidate_user_id);
    const sensitive = isAppearanceSensitive(u1Traits) || isAppearanceSensitive(u2Traits);
    const iRatio = sensitive ? SENSITIVE_INTERNAL_RATIO : DEFAULT_INTERNAL_RATIO;
    const eRatio = sensitive ? SENSITIVE_EXTERNAL_RATIO : DEFAULT_EXTERNAL_RATIO;
    const finalScore = internalScore * iRatio + externalScore * eRatio;

    updates.push({
      id: row.id,
      internal: Math.round(internalScore * 100) / 100,
      external: Math.round(externalScore * 100) / 100,
      final: Math.round(finalScore * 100) / 100,
    });
    scored++;
  }

  // Batch-write results
  await withTransaction(async (client) => {
    for (const u of updates) {
      await client.query(
        `UPDATE candidate_matches
         SET internal_score = $1, external_score = $2, final_score = $3,
             status = 'scored', last_evaluated_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [u.internal, u.external, u.final, u.id]
      );
    }
  });

  await updateMatchCounts();
  const promoted_to_matches = await promoteToMatches();
  await updateSystemMatchPriority();

  return { scored, skipped, promoted_to_matches };
}

// ── Update total_matches and good_matches on users table ─────────

async function updateMatchCounts(): Promise<void> {
  await queryAll(`
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

async function promoteToMatches(): Promise<number> {
  const minScoreRow = await queryOne<{ value: any }>(
    "SELECT value FROM config WHERE key = 'matching.min_match_score'"
  );
  // config.value is JSONB — pg already parses it. If it's a stringified number, parse it.
  let minScore = 50;
  if (minScoreRow?.value != null) {
    minScore = typeof minScoreRow.value === "number"
      ? minScoreRow.value
      : parseFloat(String(minScoreRow.value));
    if (!Number.isFinite(minScore)) minScore = 50;
  }

  const candidates = await queryAll<{ id: number; user_id: number; candidate_user_id: number; final_score: number }>(
    `SELECT id, user_id, candidate_user_id, final_score
     FROM candidate_matches
     WHERE status = 'scored' AND final_score IS NOT NULL AND final_score >= $1`,
    [minScore]
  );

  if (candidates.length === 0) return 0;

  let created = 0;

  await withTransaction(async (client) => {
    for (const c of candidates) {
      const exists = await client.query(
        `SELECT id FROM matches
         WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
        [c.user_id, c.candidate_user_id]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        await client.query(
          "UPDATE candidate_matches SET status = 'matched', updated_at = NOW() WHERE id = $1",
          [c.id]
        );
        continue;
      }
      await client.query(
        `INSERT INTO matches (user1_id, user2_id, match_score, status)
         VALUES ($1, $2, $3, 'waiting_first_rating')`,
        [c.user_id, c.candidate_user_id, Math.round(c.final_score * 100) / 100]
      );
      await client.query(
        "UPDATE candidate_matches SET status = 'matched', updated_at = NOW() WHERE id = $1",
        [c.id]
      );
      created++;
    }
  });

  return created;
}

// ── System match priority ───────────────────────────────────────

async function updateSystemMatchPriority(): Promise<void> {
  const users = await queryAll<{ id: number; waiting_since: Date | null; total_matches: number; good_matches: number }>(
    "SELECT id, waiting_since, total_matches, good_matches FROM users"
  );

  const now = Date.now();

  await withTransaction(async (client) => {
    for (const u of users) {
      if (!u.waiting_since) {
        await client.query(
          "UPDATE users SET system_match_priority = 0, updated_at = NOW() WHERE id = $1",
          [u.id]
        );
        continue;
      }

      const ms = now - new Date(u.waiting_since).getTime();
      const waitingDays = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));

      const waitingDaysScore = Math.min(waitingDays * 5, 100);
      const generalMatchesScore = Math.max(0, 100 - (u.total_matches ?? 0) * 10);
      const goodMatchesScore = Math.max(0, 100 - (u.good_matches ?? 0) * 10);

      const priority =
        0.4 * waitingDaysScore +
        0.2 * generalMatchesScore +
        0.4 * goodMatchesScore;

      await client.query(
        "UPDATE users SET system_match_priority = $1, updated_at = NOW() WHERE id = $2",
        [Math.round(priority * 100) / 100, u.id]
      );
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// MATCHMAKING — Selection and freeze
// ══════════════════════════════════════════════════════════════════

export async function runMatchmaking(_db: Database.Database): Promise<{ selection: { promoted: number; frozen: number } }> {
  await updateSystemMatchPriority();
  await updateMatchSelectionPriority();
  const selection = await selectAndFreezeMatches();
  return { selection };
}

async function updateMatchSelectionPriority(): Promise<void> {
  const matches = await queryAll<{
    id: number; match_score: number | null; user1_id: number; user2_id: number;
    u1_priority: number; u2_priority: number;
  }>(`
    SELECT m.id, m.match_score, m.user1_id, m.user2_id,
           u1.system_match_priority AS u1_priority,
           u2.system_match_priority AS u2_priority
    FROM matches m
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    WHERE m.status = 'approved_by_both'
  `);

  if (matches.length === 0) return;

  await withTransaction(async (client) => {
    for (const m of matches) {
      if (m.match_score == null) continue;

      const pairPriority = ((m.u1_priority ?? 0) + (m.u2_priority ?? 0)) / 2;
      const finalPriority = 0.7 * m.match_score + 0.3 * pairPriority;

      await client.query(
        `UPDATE matches
         SET pair_priority = $1, final_match_priority = $2, updated_at = NOW()
         WHERE id = $3`,
        [Math.round(pairPriority * 100) / 100, Math.round(finalPriority * 100) / 100, m.id]
      );
    }
  });
}

async function selectAndFreezeMatches(): Promise<{ promoted: number; frozen: number }> {
  const approved = await queryAll<{ id: number; user1_id: number; user2_id: number; final_match_priority: number }>(`
    SELECT id, user1_id, user2_id, final_match_priority
    FROM matches
    WHERE status = 'approved_by_both'
      AND final_match_priority IS NOT NULL
    ORDER BY final_match_priority DESC
  `);

  if (approved.length === 0) return { promoted: 0, frozen: 0 };

  const lockedUsers = new Set<number>();
  let promoted = 0;
  let frozen = 0;

  await withTransaction(async (client) => {
    for (const m of approved) {
      if (lockedUsers.has(m.user1_id) || lockedUsers.has(m.user2_id)) continue;

      await client.query(
        "UPDATE matches SET status = 'pre_match', updated_at = NOW() WHERE id = $1",
        [m.id]
      );

      await client.query(
        `UPDATE users
         SET user_status = 'in_match', waiting_since = NULL, updated_at = NOW()
         WHERE id IN ($1, $2)`,
        [m.user1_id, m.user2_id]
      );

      promoted++;
      lockedUsers.add(m.user1_id);
      lockedUsers.add(m.user2_id);

      const competing = await client.query<{ id: number }>(
        `SELECT id FROM matches
         WHERE id != $1
           AND (user1_id = $2 OR user2_id = $2 OR user1_id = $3 OR user2_id = $3)
           AND status IN ('waiting_first_rating', 'waiting_second_rating', 'approved_by_both')`,
        [m.id, m.user1_id, m.user2_id]
      );

      for (const c of competing.rows) {
        const result = await client.query(
          `UPDATE matches
           SET previous_status = status, status = 'frozen', updated_at = NOW()
           WHERE id = $1 AND status != 'frozen'`,
          [c.id]
        );
        frozen += result.rowCount ?? 0;
      }
    }
  });

  return { promoted, frozen };
}
