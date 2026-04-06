import type Database from "better-sqlite3";
import type {
  TraitDefinitionInput,
  LookTraitDefinitionInput,
  AnalysisAgentInput,
  AnalysisAgentOutput,
} from "./types";

/**
 * Load active internal trait definitions from DB.
 */
export function loadInternalTraitDefs(db: Database.Database): TraitDefinitionInput[] {
  return db
    .prepare(
      `SELECT id, internal_name, display_name_en, display_name_he, ai_description,
              required_confidence, weight, sensitivity, calc_type, trait_group
       FROM trait_definitions
       WHERE is_active = 1
       ORDER BY sort_order`
    )
    .all() as TraitDefinitionInput[];
}

/**
 * Load external (look) trait definitions from DB.
 */
export function loadExternalTraitDefs(db: Database.Database): LookTraitDefinitionInput[] {
  const rows = db
    .prepare(
      `SELECT id, internal_name, display_name_en, display_name_he, source, weight,
              sensitivity, possible_values, ai_description, required_confidence, trait_group
       FROM look_trait_definitions
       WHERE is_active = 1
       ORDER BY sort_order`
    )
    .all() as any[];

  return rows.map((r) => ({
    ...r,
    possible_values: r.possible_values ? JSON.parse(r.possible_values) : null,
  }));
}

/**
 * Build a complete AnalysisAgentInput from transcript + DB.
 */
export function buildAnalysisInput(
  db: Database.Database,
  transcript: string,
  existingProfile?: AnalysisAgentOutput | null
): AnalysisAgentInput {
  return {
    transcript,
    internal_trait_definitions: loadInternalTraitDefs(db),
    external_trait_definitions: loadExternalTraitDefs(db),
    existing_profile: existingProfile ?? null,
  };
}

/**
 * Save analysis output to user_traits and user_look_traits tables.
 */
export function saveAnalysisToDb(
  db: Database.Database,
  userId: number,
  output: AnalysisAgentOutput
): { internal_saved: number; external_saved: number } {
  // Ensure userId is always an integer (req.body may pass a string)
  const uid = typeof userId === "string" ? parseInt(userId, 10) : userId;
  if (!Number.isFinite(uid) || uid <= 0) {
    console.error(`[saveAnalysisToDb] Invalid userId: ${userId} (type: ${typeof userId})`);
    return { internal_saved: 0, external_saved: 0 };
  }

  console.log(`[saveAnalysisToDb] userId=${uid} (type: ${typeof userId}→int), internal_traits=${output.internal_traits.length}, external_traits=${output.external_traits.length}`);

  if (output.internal_traits.length === 0 && output.external_traits.length === 0) {
    console.warn(`[saveAnalysisToDb] Agent returned 0 traits for user ${uid} — nothing to save`);
    return { internal_saved: 0, external_saved: 0 };
  }

  const upsertInternal = db.prepare(`
    INSERT INTO user_traits (user_id, trait_definition_id, score, confidence, weight_for_match, weight_confidence, source)
    VALUES (?, ?, ?, ?, ?, ?, 'ai')
    ON CONFLICT(user_id, trait_definition_id) DO UPDATE SET
      score = excluded.score,
      confidence = excluded.confidence,
      weight_for_match = COALESCE(excluded.weight_for_match, user_traits.weight_for_match),
      weight_confidence = COALESCE(excluded.weight_confidence, user_traits.weight_confidence),
      source = 'ai',
      updated_at = datetime('now')
  `);

  // personal_value and desired_value use direct assignment (not COALESCE) so that
  // the post-processing guard can clear mirrored personal_value by setting it to null.
  // weight fields still use COALESCE since null means "no new signal" not "clear it".
  const upsertExternal = db.prepare(`
    INSERT INTO user_look_traits (user_id, look_trait_definition_id, personal_value, personal_value_confidence, desired_value, desired_value_confidence, weight_for_match, weight_confidence, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
    ON CONFLICT(user_id, look_trait_definition_id) DO UPDATE SET
      personal_value = excluded.personal_value,
      personal_value_confidence = excluded.personal_value_confidence,
      desired_value = COALESCE(excluded.desired_value, user_look_traits.desired_value),
      desired_value_confidence = COALESCE(excluded.desired_value_confidence, user_look_traits.desired_value_confidence),
      weight_for_match = COALESCE(excluded.weight_for_match, user_look_traits.weight_for_match),
      weight_confidence = COALESCE(excluded.weight_confidence, user_look_traits.weight_confidence),
      source = 'ai',
      updated_at = datetime('now')
  `);

  let internal_saved = 0;
  let external_saved = 0;

  // Save each trait individually — skip any that fail FK constraints (bad trait_id from model)
  for (const t of output.internal_traits) {
    try {
      const result = upsertInternal.run(uid, t.trait_id, t.score, t.confidence, t.weight_for_match ?? null, t.weight_confidence ?? null);
      if (result.changes > 0) internal_saved++;
    } catch (err: any) {
      console.warn(`[saveAnalysisToDb] Skipped internal trait ${t.trait_id} (${t.internal_name}): ${err.message}`);
    }
  }

  for (const t of output.external_traits) {
    try {
      const result = upsertExternal.run(uid, t.trait_id, t.personal_value ?? null, t.personal_value_confidence ?? null, t.desired_value ?? null, t.desired_value_confidence ?? null, t.weight_for_match ?? null, t.weight_confidence ?? null);
      if (result.changes > 0) external_saved++;
    } catch (err: any) {
      console.warn(`[saveAnalysisToDb] Skipped external trait ${t.trait_id} (${t.internal_name}): ${err.message}`);
    }
  }

  // Verify rows actually exist in DB after commit
  const actualInternal = (db.prepare("SELECT COUNT(*) as c FROM user_traits WHERE user_id = ?").get(uid) as any).c;
  const actualExternal = (db.prepare("SELECT COUNT(*) as c FROM user_look_traits WHERE user_id = ?").get(uid) as any).c;
  console.log(`[saveAnalysisToDb] User ${uid}: wrote ${internal_saved} internal + ${external_saved} external. DB verify: ${actualInternal} internal rows, ${actualExternal} external rows`);

  if (actualInternal === 0 && internal_saved > 0) {
    console.error(`[saveAnalysisToDb] BUG: claimed ${internal_saved} internal saves but DB has 0 rows for user ${uid}!`);
  }

  return { internal_saved, external_saved };
}

/**
 * Save analysis run data (prompt, Stage A, Stage B) for debugging.
 */
export function saveAnalysisRun(
  db: Database.Database,
  userId: number,
  generatedPrompt: string,
  stageAOutput: string,
  stageBOutput: string,
  actionType: string = "analysis"
): void {
  db.prepare(
    "INSERT INTO analysis_runs (user_id, generated_prompt, stage_a_output, stage_b_output, action_type) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, generatedPrompt, stageAOutput, stageBOutput, actionType);
}

/**
 * Get the latest analysis run for a user.
 */
export function getLatestAnalysisRun(
  db: Database.Database,
  userId: number
): { generated_prompt: string; stage_a_output: string; stage_b_output: string; created_at: string } | null {
  return db.prepare(
    "SELECT generated_prompt, stage_a_output, stage_b_output, created_at FROM analysis_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(userId) as any || null;
}
