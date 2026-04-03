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
      `SELECT id, internal_name, display_name_en, ai_description,
              required_confidence, weight, sensitivity, calc_type
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
      `SELECT id, internal_name, display_name_en, source, weight, sensitivity, possible_values
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

  const upsertExternal = db.prepare(`
    INSERT INTO user_look_traits (user_id, look_trait_definition_id, personal_value, personal_value_confidence, desired_value, desired_value_confidence, weight_for_match, weight_confidence, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
    ON CONFLICT(user_id, look_trait_definition_id) DO UPDATE SET
      personal_value = COALESCE(excluded.personal_value, user_look_traits.personal_value),
      personal_value_confidence = COALESCE(excluded.personal_value_confidence, user_look_traits.personal_value_confidence),
      desired_value = COALESCE(excluded.desired_value, user_look_traits.desired_value),
      desired_value_confidence = COALESCE(excluded.desired_value_confidence, user_look_traits.desired_value_confidence),
      weight_for_match = COALESCE(excluded.weight_for_match, user_look_traits.weight_for_match),
      weight_confidence = COALESCE(excluded.weight_confidence, user_look_traits.weight_confidence),
      source = 'ai',
      updated_at = datetime('now')
  `);

  let internal_saved = 0;
  let external_saved = 0;

  db.transaction(() => {
    for (const t of output.internal_traits) {
      upsertInternal.run(
        userId,
        t.trait_id,
        t.score,
        t.confidence,
        t.weight_for_match ?? null,
        t.weight_confidence ?? null
      );
      internal_saved++;
    }

    for (const t of output.external_traits) {
      upsertExternal.run(
        userId,
        t.trait_id,
        t.personal_value ?? null,
        t.personal_value_confidence ?? null,
        t.desired_value ?? null,
        t.desired_value_confidence ?? null,
        t.weight_for_match ?? null,
        t.weight_confidence ?? null
      );
      external_saved++;
    }
  })();

  return { internal_saved, external_saved };
}
