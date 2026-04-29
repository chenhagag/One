/**
 * Shared cognitive profile score computation.
 * Used by: reanalyze endpoint, matchStage1 filter, user-profiles endpoint.
 *
 * Score = confidence-weighted average with analytical_reasoning at 3x weight.
 */

import { queryAll, queryRun } from "./db.pg";

// תכונות: analytical_reasoning (x3), abstract_thinking, cognitive_flexibility,
// conceptual_precision, verbal_articulation, verbal_reasoning,
// depth_of_thought, intellectualism, career_prestige, eq
export const COGNITIVE_TRAIT_WEIGHTS: [string, number][] = [
  ["analytical_reasoning", 3],
  ["abstract_thinking", 1], ["cognitive_flexibility", 1], ["conceptual_precision", 1],
  ["verbal_articulation", 1], ["verbal_reasoning", 1], ["depth_of_thought", 1],
  ["intellectualism", 1], ["career_prestige", 1], ["eq", 1],
];

/**
 * Compute cognitive score from a trait map (name → {score, confidence}).
 */
export function computeCognitiveScore(
  traits: Map<string, { score: number; confidence: number }>
): number | null {
  let sumW = 0, sumC = 0;
  for (const [name, weight] of COGNITIVE_TRAIT_WEIGHTS) {
    const t = traits.get(name);
    if (!t) continue;
    sumW += t.score * t.confidence * weight;
    sumC += t.confidence * weight;
  }
  if (sumC === 0) return null;
  const raw = sumW / sumC;
  // Normalize from observed range (10-90) to 0-100
  const normalized = Math.max(0, Math.min(100, ((raw - 10) / 80) * 100));
  return Math.round(normalized);
}

/**
 * Recompute and persist cognitive_score for a user.
 * Reads user_traits from pg, computes score, updates users.cognitive_score.
 */
export async function updateCognitiveScore(userId: number): Promise<number | null> {
  const rows = await queryAll<{ internal_name: string; score: number; confidence: number }>(
    `SELECT td.internal_name, ut.score, ut.confidence
     FROM user_traits ut
     JOIN trait_definitions td ON td.id = ut.trait_definition_id
     WHERE ut.user_id = $1`,
    [userId]
  );

  const traits = new Map(rows.map(r => [r.internal_name, { score: r.score, confidence: r.confidence }]));
  const score = computeCognitiveScore(traits);

  await queryRun(
    "UPDATE users SET cognitive_score = $1, updated_at = NOW() WHERE id = $2",
    [score, userId]
  );

  return score;
}
