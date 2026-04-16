/**
 * PostgreSQL schema — translated from schema.ts (SQLite).
 *
 * Key type mappings:
 *   SQLite                          → PostgreSQL
 *   ──────────────────────────────────────────────────
 *   INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
 *   TEXT                              → TEXT
 *   INTEGER (bool 0/1)                → BOOLEAN
 *   INTEGER                           → INTEGER
 *   REAL                              → DOUBLE PRECISION
 *   TEXT DEFAULT (datetime('now'))    → TIMESTAMPTZ DEFAULT NOW()
 *   TEXT (JSON-encoded)               → JSONB
 *
 * IF NOT EXISTS keeps this idempotent on restart.
 */

import type { Pool } from "pg";

export async function createSchemaPg(pool: Pool): Promise<void> {
  await pool.query(`
    -- ================================================================
    -- 1. DEFINITION / CONFIG TABLES
    -- ================================================================

    CREATE TABLE IF NOT EXISTS trait_definitions (
      id                   SERIAL PRIMARY KEY,
      internal_name        TEXT NOT NULL UNIQUE,
      display_name_he      TEXT NOT NULL,
      display_name_en      TEXT,
      ai_description       TEXT,
      required_confidence  DOUBLE PRECISION DEFAULT 0.5,
      weight               INTEGER DEFAULT 5,
      sensitivity          TEXT DEFAULT 'normal',
      calc_type            TEXT DEFAULT 'normal',
      default_filter_range DOUBLE PRECISION,
      personal_filter_desc TEXT,
      notes                TEXT,
      is_filter            TEXT DEFAULT 'no',
      filter_type          TEXT,
      min_value            DOUBLE PRECISION,
      max_value            DOUBLE PRECISION,
      trait_group          TEXT,
      is_active            BOOLEAN DEFAULT TRUE,
      sort_order           INTEGER DEFAULT 0,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS look_trait_definitions (
      id                   SERIAL PRIMARY KEY,
      internal_name        TEXT NOT NULL UNIQUE,
      display_name_he      TEXT NOT NULL,
      display_name_en      TEXT,
      source               TEXT DEFAULT 'ai',
      weight               INTEGER DEFAULT 50,
      sensitivity          TEXT DEFAULT 'normal',
      filter_range         TEXT,
      possible_values      JSONB,
      is_filter            TEXT DEFAULT 'no',
      filter_type          TEXT,
      min_value            DOUBLE PRECISION,
      max_value            DOUBLE PRECISION,
      ai_description       TEXT,
      required_confidence  DOUBLE PRECISION DEFAULT 0.5,
      trait_group          TEXT,
      notes                TEXT,
      is_active            BOOLEAN DEFAULT TRUE,
      sort_order           INTEGER DEFAULT 0,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enum_options (
      id          SERIAL PRIMARY KEY,
      category    TEXT NOT NULL,
      value       TEXT NOT NULL,
      label_he    TEXT NOT NULL,
      label_en    TEXT,
      sort_order  INTEGER DEFAULT 0,
      is_active   BOOLEAN DEFAULT TRUE,
      UNIQUE(category, value)
    );

    CREATE TABLE IF NOT EXISTS config (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL,
      description TEXT,
      category    TEXT DEFAULT 'general',
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- ================================================================
    -- 2. CORE SYSTEM TABLES
    -- ================================================================

    CREATE TABLE IF NOT EXISTS users (
      id                        SERIAL PRIMARY KEY,
      first_name                TEXT NOT NULL,
      email                     TEXT NOT NULL UNIQUE,
      age                       INTEGER,
      gender                    TEXT,
      looking_for_gender        TEXT,
      city                      TEXT,
      height                    INTEGER,
      self_style                JSONB,
      desired_age_min           INTEGER,
      desired_age_max           INTEGER,
      age_flexibility           TEXT DEFAULT 'slightly_flexible',
      desired_height_min        INTEGER,
      desired_height_max        INTEGER,
      height_flexibility        TEXT DEFAULT 'slightly_flexible',
      desired_location_range    TEXT DEFAULT 'my_area',
      user_status               TEXT DEFAULT 'waiting_match',
      is_real_user              BOOLEAN DEFAULT TRUE,
      is_matchable              BOOLEAN DEFAULT FALSE,
      readiness_score           DOUBLE PRECISION DEFAULT 0,
      first_priority_score      DOUBLE PRECISION DEFAULT 0,
      subscription_status       TEXT DEFAULT 'free',
      pickiness_score           DOUBLE PRECISION,
      initial_attraction_signal DOUBLE PRECISION,
      valid_person              BOOLEAN DEFAULT TRUE,
      waiting_since             TIMESTAMPTZ DEFAULT NOW(),
      system_match_priority     DOUBLE PRECISION DEFAULT 0,
      total_matches             INTEGER DEFAULT 0,
      good_matches              INTEGER DEFAULT 0,
      selected_guide            TEXT,
      created_at                TIMESTAMPTZ DEFAULT NOW(),
      updated_at                TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      raw_answer    TEXT NOT NULL,
      analysis_json JSONB NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- ================================================================
    -- 3. USER DATA TABLES
    -- ================================================================

    CREATE TABLE IF NOT EXISTS user_traits (
      id                     SERIAL PRIMARY KEY,
      user_id                INTEGER NOT NULL REFERENCES users(id),
      trait_definition_id    INTEGER NOT NULL REFERENCES trait_definitions(id),
      score                  DOUBLE PRECISION,
      confidence             DOUBLE PRECISION,
      weight_for_match       DOUBLE PRECISION,
      weight_confidence      DOUBLE PRECISION,
      source                 TEXT DEFAULT 'ai',
      notes                  TEXT,
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, trait_definition_id)
    );

    CREATE TABLE IF NOT EXISTS user_look_traits (
      id                          SERIAL PRIMARY KEY,
      user_id                     INTEGER NOT NULL REFERENCES users(id),
      look_trait_definition_id    INTEGER NOT NULL REFERENCES look_trait_definitions(id),
      personal_value              TEXT,
      personal_value_confidence   DOUBLE PRECISION,
      desired_value               TEXT,
      desired_value_confidence    DOUBLE PRECISION,
      weight_for_match            DOUBLE PRECISION,
      weight_confidence           DOUBLE PRECISION,
      source                      TEXT DEFAULT 'ai',
      created_at                  TIMESTAMPTZ DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, look_trait_definition_id)
    );

    -- ================================================================
    -- 4. MATCHES
    -- ================================================================

    CREATE TABLE IF NOT EXISTS matches (
      id                     SERIAL PRIMARY KEY,
      user1_id               INTEGER NOT NULL REFERENCES users(id),
      user2_id               INTEGER NOT NULL REFERENCES users(id),
      match_score            DOUBLE PRECISION,
      user1_rating           TEXT,
      user2_rating           TEXT,
      status                 TEXT DEFAULT 'waiting_first_rating',
      previous_status        TEXT,
      system_priority_user1  DOUBLE PRECISION,
      system_priority_user2  DOUBLE PRECISION,
      pair_priority          DOUBLE PRECISION,
      match_priority         DOUBLE PRECISION,
      final_match_priority   DOUBLE PRECISION,
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS match_scores (
      id              SERIAL PRIMARY KEY,
      match_id        INTEGER NOT NULL REFERENCES matches(id),
      score_type      TEXT NOT NULL,
      trait_name      TEXT,
      user1_score     DOUBLE PRECISION,
      user2_score     DOUBLE PRECISION,
      weight          DOUBLE PRECISION,
      confidence      DOUBLE PRECISION,
      weighted_score  DOUBLE PRECISION,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS candidate_matches (
      id                        SERIAL PRIMARY KEY,
      user_id                   INTEGER NOT NULL REFERENCES users(id),
      candidate_user_id         INTEGER NOT NULL REFERENCES users(id),
      status                    TEXT NOT NULL DEFAULT 'pending_score',
      filtering_passed          BOOLEAN NOT NULL DEFAULT TRUE,
      last_evaluated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user1_last_source_update  TIMESTAMPTZ,
      user2_last_source_update  TIMESTAMPTZ,
      internal_score            DOUBLE PRECISION,
      external_score            DOUBLE PRECISION,
      final_score               DOUBLE PRECISION,
      created_at                TIMESTAMPTZ DEFAULT NOW(),
      updated_at                TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, candidate_user_id)
    );

    -- ================================================================
    -- GEOGRAPHY
    -- ================================================================

    CREATE TABLE IF NOT EXISTS cities (
      id         SERIAL PRIMARY KEY,
      city_name  TEXT NOT NULL UNIQUE,
      region     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS region_adjacency (
      id             SERIAL PRIMARY KEY,
      region         TEXT NOT NULL,
      nearby_region  TEXT NOT NULL,
      UNIQUE(region, nearby_region)
    );

    -- ================================================================
    -- ANALYSIS RUNS
    -- ================================================================

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id                SERIAL PRIMARY KEY,
      user_id           INTEGER NOT NULL REFERENCES users(id),
      generated_prompt  TEXT,
      stage_a_output    JSONB,
      stage_b_output    JSONB,
      action_type       TEXT DEFAULT 'analysis',
      created_at        TIMESTAMPTZ DEFAULT NOW()
    );

    -- ================================================================
    -- USER PHOTOS
    -- ================================================================

    CREATE TABLE IF NOT EXISTS user_photos (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      filename      TEXT NOT NULL,
      original_name TEXT,
      mime_type     TEXT,
      size_bytes    INTEGER,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- ================================================================
    -- CONVERSATION MESSAGES
    -- ================================================================

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      guide       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- ================================================================
    -- TOKEN USAGE
    -- ================================================================

    -- NOTE: user_id intentionally has NO FK during the pg migration.
    -- Users still live in SQLite while other tables migrate; re-add
    -- REFERENCES users(id) once the migration is fully complete.
    CREATE TABLE IF NOT EXISTS token_usage (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER,
      action_type         TEXT NOT NULL,
      model               TEXT NOT NULL,
      input_tokens        INTEGER NOT NULL DEFAULT 0,
      output_tokens       INTEGER NOT NULL DEFAULT 0,
      total_tokens        INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd  DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    -- ================================================================
    -- INDEXES
    -- ================================================================
    CREATE INDEX IF NOT EXISTS idx_user_traits_user           ON user_traits(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_traits_trait          ON user_traits(trait_definition_id);
    CREATE INDEX IF NOT EXISTS idx_user_look_traits_user      ON user_look_traits(user_id);
    CREATE INDEX IF NOT EXISTS idx_matches_users              ON matches(user1_id, user2_id);
    CREATE INDEX IF NOT EXISTS idx_matches_status             ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_enum_options_cat           ON enum_options(category);
    CREATE INDEX IF NOT EXISTS idx_candidate_matches_user     ON candidate_matches(user_id);
    CREATE INDEX IF NOT EXISTS idx_candidate_matches_status   ON candidate_matches(status);
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_user         ON analysis_runs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_user_photos_user           ON user_photos(user_id);
    CREATE INDEX IF NOT EXISTS idx_conv_messages_user         ON conversation_messages(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_user           ON token_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_token_usage_action         ON token_usage(action_type);
  `);
}
