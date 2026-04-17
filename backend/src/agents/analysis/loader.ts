/**
 * Analysis loader — reads trait definitions from pg and persists
 * AI analysis output (user_traits, user_look_traits, analysis_runs) to pg.
 *
 * All exports are async. The `db` parameter (better-sqlite3 handle) is
 * accepted but IGNORED — kept in the signature only to minimise churn
 * at call sites during the migration. Remove it once all callers are
 * updated.
 */

import type Database from "better-sqlite3";
import { getPool, queryAll, queryOne, queryRun, toJsonbParam } from "../../db.pg";
import type {
  TraitDefinitionInput,
  LookTraitDefinitionInput,
  AnalysisAgentInput,
  AnalysisAgentOutput,
} from "./types";

// ── Reads ─────────────────────────────────────────────────────────

/**
 * Load active internal trait definitions from pg.
 * @param _db Deprecated — ignored. Will be removed post-migration.
 */
export async function loadInternalTraitDefs(
  _db?: Database.Database
): Promise<TraitDefinitionInput[]> {
  return queryAll<TraitDefinitionInput>(
    `SELECT id, internal_name, display_name_en, display_name_he, ai_description,
            required_confidence, weight, sensitivity, calc_type, trait_group
     FROM trait_definitions
     WHERE is_active = TRUE
     ORDER BY sort_order`
  );
}

/**
 * Load external (look) trait definitions from pg.
 * @param _db Deprecated — ignored.
 */
export async function loadExternalTraitDefs(
  _db?: Database.Database
): Promise<LookTraitDefinitionInput[]> {
  const rows = await queryAll<any>(
    `SELECT id, internal_name, display_name_en, display_name_he, source, weight,
            sensitivity, possible_values, ai_description, required_confidence, trait_group
     FROM look_trait_definitions
     WHERE is_active = TRUE
     ORDER BY sort_order`
  );

  // pg already returns JSONB as a parsed JS value; no JSON.parse needed.
  return rows.map((r) => ({
    ...r,
    possible_values: r.possible_values ?? null,
  }));
}

/**
 * Build a complete AnalysisAgentInput from transcript + DB.
 * @param _db Deprecated — ignored.
 */
export async function buildAnalysisInput(
  _db: Database.Database | undefined,
  transcript: string,
  existingProfile?: AnalysisAgentOutput | null
): Promise<AnalysisAgentInput> {
  const [internal, external] = await Promise.all([
    loadInternalTraitDefs(),
    loadExternalTraitDefs(),
  ]);
  return {
    transcript,
    internal_trait_definitions: internal,
    external_trait_definitions: external,
    existing_profile: existingProfile ?? null,
  };
}

// ── Writes ────────────────────────────────────────────────────────

/**
 * Save analysis output to user_traits and user_look_traits (pg).
 * Uses INSERT ... ON CONFLICT ... DO UPDATE (pg upsert).
 * @param _db Deprecated — ignored.
 */
export async function saveAnalysisToDb(
  _db: Database.Database | undefined,
  userId: number,
  output: AnalysisAgentOutput
): Promise<{ internal_saved: number; external_saved: number }> {
  const uid = typeof userId === "string" ? parseInt(userId as any, 10) : userId;
  if (!Number.isFinite(uid) || uid <= 0) {
    console.error(`[saveAnalysisToDb] Invalid userId: ${userId} (type: ${typeof userId})`);
    return { internal_saved: 0, external_saved: 0 };
  }

  console.log(
    `[saveAnalysisToDb] userId=${uid}, internal_traits=${output.internal_traits.length}, external_traits=${output.external_traits.length}`
  );

  if (output.internal_traits.length === 0 && output.external_traits.length === 0) {
    console.warn(`[saveAnalysisToDb] Agent returned 0 traits for user ${uid} — nothing to save`);
    return { internal_saved: 0, external_saved: 0 };
  }

  const INSERT_INTERNAL = `
    INSERT INTO user_traits
      (user_id, trait_definition_id, score, confidence,
       weight_for_match, weight_confidence, source)
    VALUES ($1, $2, $3, $4, $5, $6, 'ai')
    ON CONFLICT (user_id, trait_definition_id) DO UPDATE SET
      score             = EXCLUDED.score,
      confidence        = EXCLUDED.confidence,
      weight_for_match  = COALESCE(EXCLUDED.weight_for_match,  user_traits.weight_for_match),
      weight_confidence = COALESCE(EXCLUDED.weight_confidence, user_traits.weight_confidence),
      source            = 'ai',
      updated_at        = NOW()
  `;

  // personal_value / desired_value use direct assignment (not COALESCE)
  // so the post-processing guard can clear mirrored personal_value.
  const INSERT_EXTERNAL = `
    INSERT INTO user_look_traits
      (user_id, look_trait_definition_id, personal_value, personal_value_confidence,
       desired_value, desired_value_confidence, weight_for_match, weight_confidence, source)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ai')
    ON CONFLICT (user_id, look_trait_definition_id) DO UPDATE SET
      personal_value            = EXCLUDED.personal_value,
      personal_value_confidence = EXCLUDED.personal_value_confidence,
      desired_value             = COALESCE(EXCLUDED.desired_value,            user_look_traits.desired_value),
      desired_value_confidence  = COALESCE(EXCLUDED.desired_value_confidence, user_look_traits.desired_value_confidence),
      weight_for_match          = COALESCE(EXCLUDED.weight_for_match,         user_look_traits.weight_for_match),
      weight_confidence         = COALESCE(EXCLUDED.weight_confidence,        user_look_traits.weight_confidence),
      source                    = 'ai',
      updated_at                = NOW()
  `;

  let internal_saved = 0;
  let external_saved = 0;

  for (const t of output.internal_traits) {
    try {
      const res = await queryRun(INSERT_INTERNAL, [
        uid, t.trait_id, t.score, t.confidence,
        t.weight_for_match ?? null, t.weight_confidence ?? null,
      ]);
      if (res.rowCount > 0) internal_saved++;
    } catch (err: any) {
      console.warn(
        `[saveAnalysisToDb] Skipped internal trait ${t.trait_id} (${t.internal_name}): ${err.message}`
      );
    }
  }

  for (const t of output.external_traits) {
    try {
      const res = await queryRun(INSERT_EXTERNAL, [
        uid, t.trait_id,
        t.personal_value ?? null, t.personal_value_confidence ?? null,
        t.desired_value ?? null, t.desired_value_confidence ?? null,
        t.weight_for_match ?? null, t.weight_confidence ?? null,
      ]);
      if (res.rowCount > 0) external_saved++;
    } catch (err: any) {
      console.warn(
        `[saveAnalysisToDb] Skipped external trait ${t.trait_id} (${t.internal_name}): ${err.message}`
      );
    }
  }

  // Verify rows actually exist in DB after commit
  const actualInternal = Number(
    (await queryOne<{ c: string }>(
      "SELECT COUNT(*)::int AS c FROM user_traits WHERE user_id = $1",
      [uid]
    ))?.c ?? 0
  );
  const actualExternal = Number(
    (await queryOne<{ c: string }>(
      "SELECT COUNT(*)::int AS c FROM user_look_traits WHERE user_id = $1",
      [uid]
    ))?.c ?? 0
  );

  console.log(
    `[saveAnalysisToDb] User ${uid}: wrote ${internal_saved} internal + ${external_saved} external. DB verify: ${actualInternal} internal rows, ${actualExternal} external rows`
  );

  if (actualInternal === 0 && internal_saved > 0) {
    console.error(
      `[saveAnalysisToDb] BUG: claimed ${internal_saved} internal saves but DB has 0 rows for user ${uid}!`
    );
  }

  return { internal_saved, external_saved };
}

/**
 * Save analysis run data (prompt, Stage A, Stage B) for debugging.
 * Stage A/B are JSONB columns; values are normalized via toJsonbParam()
 * and explicitly cast to ::jsonb in SQL so node-pg doesn't convert
 * arrays into Postgres arrays.
 * @param _db Deprecated — ignored.
 */
export async function saveAnalysisRun(
  _db: Database.Database | undefined,
  userId: number,
  generatedPrompt: string,
  stageAOutput: string | object | null,
  stageBOutput: string | object | null,
  actionType: string = "analysis"
): Promise<void> {
  await queryRun(
    `INSERT INTO analysis_runs
       (user_id, generated_prompt, stage_a_output, stage_b_output, action_type)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
    [
      userId,
      generatedPrompt,
      toJsonbParam(stageAOutput),
      toJsonbParam(stageBOutput),
      actionType,
    ]
  );
}

/**
 * Get the latest analysis run for a user.
 *
 * Stage A/B are stored as JSONB and returned by pg as parsed JS values.
 * The admin panel expects them as strings (pre-migration contract when the
 * columns were TEXT). We pretty-print them here so the frontend can render
 * and copy them directly without needing to know about the pg type.
 *
 * Legacy wrap: if a row was stored via toJsonbParam's fallback as
 * `{ raw: "..." }` (when the input was a non-JSON plain string), we unwrap
 * back to the raw string for a clean display.
 *
 * @param _db Deprecated — ignored.
 */
export async function getLatestAnalysisRun(
  _db: Database.Database | undefined,
  userId: number
): Promise<
  | { generated_prompt: string; stage_a_output: string | null; stage_b_output: string | null; created_at: string }
  | null
> {
  const row = await queryOne<any>(
    `SELECT generated_prompt, stage_a_output, stage_b_output, created_at
     FROM analysis_runs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!row) return null;

  const normalize = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    // Unwrap the { raw: "..." } fallback produced by toJsonbParam
    // when the original input was a non-JSON plain string.
    if (typeof v === "object" && v !== null
        && Object.keys(v).length === 1
        && typeof (v as any).raw === "string") {
      return (v as any).raw;
    }
    if (typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  };

  return {
    generated_prompt: row.generated_prompt,
    stage_a_output: normalize(row.stage_a_output),
    stage_b_output: normalize(row.stage_b_output),
    created_at: row.created_at,
  };
}
