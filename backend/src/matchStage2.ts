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

const DEFAULT_INTERNAL_RATIO = 0.70;
const DEFAULT_EXTERNAL_RATIO = 0.30;
const SENSITIVE_INTERNAL_RATIO = 0.65;
const SENSITIVE_EXTERNAL_RATIO = 0.35;

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
  internal_name: string;
  calc_type: string;
  weight: number;
}

// ── External score — weighted similarity on manual visual traits ──

interface LookTraitRow {
  look_trait_definition_id: number;
  internal_name: string;
  personal_value: string | null;
}

// Traits included in external scoring and their weights
// Appeal and Fitness aesthetic get double weight
const EXTERNAL_SCORE_WEIGHTS: Record<string, number> = {
  appeal: 3,
  fitness_aesthetic: 3,
  warmth_visual: 1,
  femininity_masculinity: 2,
  glamour: 1,
  naturalness: 1,
  style_polish: 1,
  skin_tone_range: 1,
};

function calculateExternalScore(
  user1LookTraits: Map<string, number>,
  user2LookTraits: Map<string, number>,
): number | null {
  let sumWeightedScore = 0;
  let sumWeight = 0;

  for (const [traitName, weight] of Object.entries(EXTERNAL_SCORE_WEIGHTS)) {
    const v1 = user1LookTraits.get(traitName);
    const v2 = user2LookTraits.get(traitName);
    if (v1 == null || v2 == null) continue;

    const traitScore = 100 - Math.abs(v1 - v2);
    sumWeightedScore += traitScore * weight;
    sumWeight += weight;
  }

  if (sumWeight === 0) return null;
  return sumWeightedScore / sumWeight;
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

    // Gaussian similarity: σ=12, so diff=5→92, diff=15→46, diff=30→5
    const diff = Math.abs(t1.score - t2.score);
    const match = 100 * Math.exp(-(diff * diff) / (2 * 12 * 12));
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

// Appearance sensitive if score >= 70 AND confidence >= 0.7
function isAppearanceSensitive(traits: Map<number, TraitRow>): boolean {
  const t = traits.get(APPEARANCE_SENSITIVITY_TRAIT_ID);
  if (!t) return false;
  return t.score >= 70 && t.confidence >= 0.7;
}

// ── Category match score definitions ────────────────────────────
// Each category lists the traits used and maps to the same traits
// shown in the user's profile display (AdminView computed profiles).
// A trait may appear in more than one category.

interface CategoryDef {
  key: string;
  traitNames: string[];
}

const MATCH_CATEGORIES: CategoryDef[] = [
  // פרופיל קוגניטיבי — Cognitive Profile
  // Traits: analytical_reasoning, abstract_thinking, cognitive_flexibility,
  //         conceptual_precision, verbal_articulation, verbal_reasoning,
  //         depth_of_thought, intellectualism, career_prestige, eq
  { key: "cognitive", traitNames: [
    "analytical_reasoning", "abstract_thinking", "cognitive_flexibility",
    "conceptual_precision", "verbal_articulation", "verbal_reasoning",
    "depth_of_thought", "intellectualism", "career_prestige", "eq",
  ]},

  // אינטליגנציה רגשית-חברתית — Emotional-Social Intelligence
  // Traits: social_intuitive_intelligence, eq, self_awareness, positivity, warmth
  { key: "emotional_social", traitNames: [
    "social_intuitive_intelligence", "eq", "self_awareness", "positivity", "warmth",
  ]},

  // מידת רגשנות — Emotionality
  // Traits: neuroticism, emotional_intensity, emotional_expressiveness
  { key: "emotionality", traitNames: [
    "neuroticism", "emotional_intensity", "emotional_expressiveness",
  ]},

  // טון תקשורת — Communication Tone
  // Traits: energetic_intensity, assertiveness_forcefulness, charismatic_presence
  { key: "communication", traitNames: [
    "energetic_intensity", "assertiveness_forcefulness", "charismatic_presence",
  ]},

  // סחיות — Vibe
  // Traits: mainstreamness, conformity, openness_to_experience
  { key: "vibe", traitNames: [
    "mainstreamness", "conformity", "openness_to_experience",
  ]},

  // עממיות — Popularity
  // Traits: oriental, mainstreamness, broad_appeal
  { key: "popularity", traitNames: [
    "oriental", "mainstreamness", "broad_appeal",
  ]},

  // ביג פייב — Big Five
  // Traits: extraversion, conscientiousness, agreeableness, neuroticism, openness_to_experience
  { key: "big_five", traitNames: [
    "extraversion", "conscientiousness", "agreeableness", "neuroticism", "openness_to_experience",
  ]},

  // ערכי שוורץ — Schwartz Values
  // Traits: hedonism, achievement, power, self_direction, stimulation,
  //         security, conformity, tradition, benevolence, universalism, spirituality
  { key: "schwartz", traitNames: [
    "hedonism", "achievement", "power", "self_direction", "stimulation",
    "security", "conformity", "tradition", "benevolence", "universalism", "spirituality",
  ]},

  // סגנון אישי — Personal Style
  // Traits: mainstreamness, oriental, broad_appeal, value_rigidity, family_of_origin_closeness,
  //         childishness, humor, right_wing, left_wing, social_activism, party_orientation,
  //         religiosity, secularity, hipsterishness, geekiness, hippie_style, soviet_style, theatricality
  { key: "style", traitNames: [
    "mainstreamness", "oriental", "broad_appeal", "value_rigidity", "family_of_origin_closeness",
    "childishness", "humor", "right_wing", "left_wing", "social_activism", "party_orientation",
    "religiosity", "secularity", "hipsterishness", "geekiness", "hippie_style", "soviet_style", "theatricality",
  ]},

  // כללי — General Info
  // Traits: loves_animals, vegetarian, serious_relationship_intent, appearance_sensitivity
  { key: "general", traitNames: [
    "loves_animals", "vegetarian", "serious_relationship_intent", "appearance_sensitivity",
  ]},

  // MBTI — כולל extraversion מביג פייב + 6 תכונות MBTI
  // Traits: extraversion, sensing, intuition, thinking, feeling, judging, perceiving
  { key: "mbti", traitNames: [
    "extraversion", "sensing", "intuition", "thinking", "feeling", "judging", "perceiving",
  ]},
];

// Build name→id set for each category (populated once in runStage2)
let categoryTraitIds: Map<string, Set<number>> = new Map();

function buildCategoryTraitIds(traitDefs: Map<number, TraitDef>): void {
  categoryTraitIds = new Map();
  const nameToId = new Map<string, number>();
  for (const [id, def] of traitDefs) {
    nameToId.set(def.internal_name, id);
  }
  for (const cat of MATCH_CATEGORIES) {
    const ids = new Set<number>();
    for (const name of cat.traitNames) {
      const id = nameToId.get(name);
      if (id != null) ids.add(id);
    }
    categoryTraitIds.set(cat.key, ids);
  }
}

// Calculate match score for a single category (same formula as overall internal score,
// but restricted to traits in the category)
function calculateCategoryScore(
  user1Traits: Map<number, TraitRow>,
  user2Traits: Map<number, TraitRow>,
  traitDefs: Map<number, TraitDef>,
  allowedTraitIds: Set<number>,
): number | null {
  let sumWeightedScore = 0;
  let sumWeightedWeight = 0;

  for (const traitId of allowedTraitIds) {
    const t1 = user1Traits.get(traitId);
    const t2 = user2Traits.get(traitId);
    if (!t1 || !t2) continue;

    const def = traitDefs.get(traitId);
    if (def && (EXCLUDED_CALC_TYPES.has(def.calc_type) || def.weight === 0)) continue;

    // Gaussian similarity: σ=12, so diff=5→92, diff=15→46, diff=30→5
    const diff = Math.abs(t1.score - t2.score);
    const match = 100 * Math.exp(-(diff * diff) / (2 * 12 * 12));
    const sharedConf = Math.sqrt(t1.confidence * t2.confidence);

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

interface CategoryScores {
  score_cognitive: number | null;
  score_emotional_social: number | null;
  score_emotionality: number | null;
  score_communication: number | null;
  score_vibe: number | null;
  score_popularity: number | null;
  score_big_five: number | null;
  score_schwartz: number | null;
  score_style: number | null;
  score_general: number | null;
  score_mbti: number | null;
}

// Compute confidence-weighted average score for a set of traits
function profileAverage(
  traits: Map<number, TraitRow>,
  traitIds: Set<number>,
  traitDefs: Map<number, TraitDef>,
): number | null {
  let sumW = 0, sumC = 0;
  for (const id of traitIds) {
    const t = traits.get(id);
    if (!t) continue;
    const def = traitDefs.get(id);
    if (def && (EXCLUDED_CALC_TYPES.has(def.calc_type) || def.weight === 0)) continue;
    sumW += t.score * t.confidence;
    sumC += t.confidence;
  }
  return sumC > 0 ? sumW / sumC : null;
}

function calculateAllCategoryScores(
  user1Traits: Map<number, TraitRow>,
  user2Traits: Map<number, TraitRow>,
  traitDefs: Map<number, TraitDef>,
  user1Gender: string | null,
  user2Gender: string | null,
): CategoryScores {
  const scores: any = {};
  for (const cat of MATCH_CATEGORIES) {
    const ids = categoryTraitIds.get(cat.key);
    if (!ids || ids.size === 0) {
      scores[`score_${cat.key}`] = null;
      continue;
    }

    // Emotionality / Emotional-Social in male-female pairs:
    // 50% trait-by-trait comparison (no boost)
    // 50% profile average comparison (male gets bonus)
    if ((cat.key === "emotionality" || cat.key === "emotional_social") && user1Gender && user2Gender) {
      const g1 = user1Gender.toLowerCase();
      const g2 = user2Gender.toLowerCase();
      if ((g1 === "male" && g2 === "female") || (g1 === "female" && g2 === "male")) {
        const bonus = cat.key === "emotionality" ? 10 : 4;
        const traitScore = calculateCategoryScore(user1Traits, user2Traits, traitDefs, ids);

        const avg1 = profileAverage(user1Traits, ids, traitDefs);
        const avg2 = profileAverage(user2Traits, ids, traitDefs);

        if (traitScore != null && avg1 != null && avg2 != null) {
          // Add bonus to male's profile average, then compare with gaussian
          const boostedAvg1 = g1 === "male" ? Math.min(100, avg1 + bonus) : avg1;
          const boostedAvg2 = g2 === "male" ? Math.min(100, avg2 + bonus) : avg2;
          const diff = Math.abs(boostedAvg1 - boostedAvg2);
          const profileMatch = 100 * Math.exp(-(diff * diff) / (2 * 12 * 12));

          const combined = traitScore * 0.5 + profileMatch * 0.5;
          scores[`score_${cat.key}`] = Math.round(combined * 100) / 100;
          continue;
        }
      }
    }

    const raw = calculateCategoryScore(user1Traits, user2Traits, traitDefs, ids);
    scores[`score_${cat.key}`] = raw != null ? Math.round(raw * 100) / 100 : null;
  }
  return scores as CategoryScores;
}

// ── Profile-based score ─────────────────────────────────────────
// Weighted average of category scores (not individual traits).
// Cognitive gets 2x weight. Vibe, Popularity, General excluded.
function calculateProfileScore(categories: CategoryScores, externalScore: number | null): number | null {
  const profileWeights: [keyof CategoryScores, number][] = [
    ["score_cognitive", 3],
    ["score_emotional_social", 1],
    ["score_emotionality", 0.5],
    ["score_communication", 2],
    ["score_big_five", 1],
    ["score_schwartz", 1],
    ["score_style", 1],
    ["score_popularity", 0.25],
    ["score_vibe", 0.25],
    ["score_mbti", 0.5],
  ];

  let sumW = 0, sumC = 0;
  for (const [key, weight] of profileWeights) {
    const val = categories[key];
    if (val == null) continue;
    sumW += val * weight;
    sumC += weight;
  }

  // External score gets triple weight (like cognitive)
  if (externalScore != null) {
    sumW += externalScore * 3;
    sumC += 3;
  }

  if (sumC === 0) return null;
  return Math.round((sumW / sumC) * 100) / 100;
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
    "SELECT id, internal_name, calc_type, weight FROM trait_definitions"
  );
  const traitDefs = new Map<number, TraitDef>();
  for (const td of traitDefRows) traitDefs.set(td.id, td);

  // Build category trait ID sets for per-category scoring
  buildCategoryTraitIds(traitDefs);

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

  // Pre-load look traits (manual visual traits) for involved users
  const allLookTraits = await queryAll<{ user_id: number; internal_name: string; personal_value: string | null }>(
    `SELECT ult.user_id, ltd.internal_name, ult.personal_value
     FROM user_look_traits ult
     JOIN look_trait_definitions ltd ON ltd.id = ult.look_trait_definition_id
     WHERE ult.user_id = ANY($1::int[]) AND ult.personal_value IS NOT NULL`,
    [involvedIds]
  );

  const lookTraitCache = new Map<number, Map<string, number>>();
  for (const r of allLookTraits) {
    const numVal = parseFloat(r.personal_value ?? "");
    if (isNaN(numVal)) continue;
    if (!lookTraitCache.has(r.user_id)) lookTraitCache.set(r.user_id, new Map());
    lookTraitCache.get(r.user_id)!.set(r.internal_name, numVal);
  }

  const getUserLookTraits = (uid: number): Map<string, number> =>
    lookTraitCache.get(uid) ?? new Map();

  // Pre-load genders for involved users
  const genderRows = await queryAll<{ id: number; gender: string | null }>(
    `SELECT id, gender FROM users WHERE id = ANY($1::int[])`,
    [involvedIds]
  );
  const genderCache = new Map<number, string | null>();
  for (const r of genderRows) genderCache.set(r.id, r.gender);

  // Compute scores in memory
  type Update = {
    id: number; internal: number | null; external: number | null; final: number | null;
    categories: CategoryScores; profile_score: number | null;
  };
  const updates: Update[] = [];
  let scored = 0;
  let skipped = 0;

  const emptyCategories: CategoryScores = {
    score_cognitive: null, score_emotional_social: null, score_emotionality: null,
    score_communication: null, score_vibe: null, score_popularity: null,
    score_big_five: null, score_schwartz: null, score_style: null, score_general: null, score_mbti: null,
  };

  for (const row of pending) {
    const u1Traits = getUserTraits(row.user_id);
    const u2Traits = getUserTraits(row.candidate_user_id);

    const internalScore = calculateInternalScore(u1Traits, u2Traits, traitDefs);

    if (internalScore == null) {
      updates.push({ id: row.id, internal: null, external: null, final: null, categories: emptyCategories, profile_score: null });
      skipped++;
      continue;
    }

    const externalScore = calculateExternalScore(
      getUserLookTraits(row.user_id),
      getUserLookTraits(row.candidate_user_id),
    ) ?? 0; // fallback to 0 if no visual data available
    const sensitive = isAppearanceSensitive(u1Traits) || isAppearanceSensitive(u2Traits);
    const iRatio = sensitive ? SENSITIVE_INTERNAL_RATIO : DEFAULT_INTERNAL_RATIO;
    const eRatio = sensitive ? SENSITIVE_EXTERNAL_RATIO : DEFAULT_EXTERNAL_RATIO;
    const finalScore = internalScore * iRatio + externalScore * eRatio;

    const categories = calculateAllCategoryScores(
      u1Traits, u2Traits, traitDefs,
      genderCache.get(row.user_id) ?? null,
      genderCache.get(row.candidate_user_id) ?? null,
    );

    const profileScore = calculateProfileScore(categories, externalScore);

    updates.push({
      id: row.id,
      internal: Math.round(internalScore * 100) / 100,
      external: Math.round(externalScore * 100) / 100,
      final: Math.round(finalScore * 100) / 100,
      categories,
      profile_score: profileScore,
    });
    scored++;
  }

  // Batch-write results
  await withTransaction(async (client) => {
    for (const u of updates) {
      await client.query(
        `UPDATE candidate_matches
         SET internal_score = $1, external_score = $2, final_score = $3,
             score_cognitive = $5, score_emotional_social = $6, score_emotionality = $7,
             score_communication = $8, score_vibe = $9, score_popularity = $10,
             score_big_five = $11, score_schwartz = $12, score_style = $13,
             score_general = $14, score_mbti = $15, profile_score = $16,
             status = 'scored', last_evaluated_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [u.internal, u.external, u.final, u.id,
         u.categories.score_cognitive, u.categories.score_emotional_social,
         u.categories.score_emotionality, u.categories.score_communication,
         u.categories.score_vibe, u.categories.score_popularity,
         u.categories.score_big_five, u.categories.score_schwartz,
         u.categories.score_style, u.categories.score_general, u.categories.score_mbti,
         u.profile_score]
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
