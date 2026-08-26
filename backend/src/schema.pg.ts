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
      desired_location_range    TEXT DEFAULT 'bit_further',
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
      test_user_type            TEXT,
      partner_name              TEXT,
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

    -- NOTE: user_id intentionally has NO FK during the pg migration
    -- (users still live in SQLite). Re-add REFERENCES users(id) once
    -- the users table itself is migrated.
    CREATE TABLE IF NOT EXISTS user_traits (
      id                     SERIAL PRIMARY KEY,
      user_id                INTEGER NOT NULL,
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

    -- NOTE: user_id FK dropped during migration (see user_traits above).
    CREATE TABLE IF NOT EXISTS user_look_traits (
      id                          SERIAL PRIMARY KEY,
      user_id                     INTEGER NOT NULL,
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
      sent_for_rating_at     TIMESTAMPTZ,
      sent_for_rating_to     INTEGER REFERENCES users(id),
      rejection_reason       TEXT,
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
      score_cognitive           DOUBLE PRECISION,
      score_emotional_social    DOUBLE PRECISION,
      score_emotionality        DOUBLE PRECISION,
      score_communication       DOUBLE PRECISION,
      score_vibe                DOUBLE PRECISION,
      score_popularity          DOUBLE PRECISION,
      score_big_five            DOUBLE PRECISION,
      score_schwartz            DOUBLE PRECISION,
      score_style               DOUBLE PRECISION,
      score_attitudes           DOUBLE PRECISION,
      score_general             DOUBLE PRECISION,
      score_mbti                DOUBLE PRECISION,
      score_enneagram           DOUBLE PRECISION,
      profile_score             DOUBLE PRECISION,
      internal_profile_score    DOUBLE PRECISION,
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

    -- NOTE: user_id FK dropped during migration (see user_traits above).
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id                SERIAL PRIMARY KEY,
      user_id           INTEGER NOT NULL,
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
      is_primary    BOOLEAN DEFAULT FALSE,
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
    -- BUG REPORTS
    -- ================================================================

    CREATE TABLE IF NOT EXISTS bug_reports (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      report_text TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id);

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

  // ────────────────────────────────────────────────────────────────
  // Phase 4b: users is now authoritative in pg. Restore FKs on
  // dependent tables. Idempotent — only added if not already present.
  // ────────────────────────────────────────────────────────────────
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_traits_user_id_fkey') THEN
        ALTER TABLE user_traits
          ADD CONSTRAINT user_traits_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_look_traits_user_id_fkey') THEN
        ALTER TABLE user_look_traits
          ADD CONSTRAINT user_look_traits_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analysis_runs_user_id_fkey') THEN
        ALTER TABLE analysis_runs
          ADD CONSTRAINT analysis_runs_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'token_usage_user_id_fkey') THEN
        ALTER TABLE token_usage
          ADD CONSTRAINT token_usage_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // ── Column migrations for existing databases ───────────────────
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'test_user_type'
      ) THEN
        ALTER TABLE users ADD COLUMN test_user_type TEXT;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'cognitive_score'
      ) THEN
        ALTER TABLE users ADD COLUMN cognitive_score DOUBLE PRECISION;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'partner_name'
      ) THEN
        ALTER TABLE users ADD COLUMN partner_name TEXT;
      END IF;

      -- Category match scores on candidate_matches
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'score_cognitive'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN score_cognitive DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_emotional_social DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_emotionality DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_communication DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_vibe DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_popularity DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_big_five DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_schwartz DOUBLE PRECISION;
        ALTER TABLE candidate_matches ADD COLUMN score_style DOUBLE PRECISION;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'score_general'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN score_general DOUBLE PRECISION;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'score_mbti'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN score_mbti DOUBLE PRECISION;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'score_attitudes'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN score_attitudes DOUBLE PRECISION;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'profile_score'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN profile_score DOUBLE PRECISION;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'score_enneagram'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN score_enneagram DOUBLE PRECISION;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'internal_profile_score'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN internal_profile_score DOUBLE PRECISION;
      END IF;

      -- Auto-analysis flag: prevents running automatic analysis more than once
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'auto_analyzed'
      ) THEN
        ALTER TABLE users ADD COLUMN auto_analyzed BOOLEAN DEFAULT FALSE;
      END IF;

      -- Analysis run count: tracks how many times auto-analysis has run (max 2)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'analysis_run_count'
      ) THEN
        ALTER TABLE users ADD COLUMN analysis_run_count INTEGER DEFAULT 0;
      END IF;

      -- Couple insights: long-form relationship insights text for couple testers
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'couple_insights'
      ) THEN
        ALTER TABLE users ADD COLUMN couple_insights TEXT;
      END IF;

      -- Personal insights: admin-written short + full text for all users
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'personal_insights_short'
      ) THEN
        ALTER TABLE users ADD COLUMN personal_insights_short TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'personal_insights_full'
      ) THEN
        ALTER TABLE users ADD COLUMN personal_insights_full TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'analysis_completed'
      ) THEN
        ALTER TABLE users ADD COLUMN analysis_completed BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'insights_pre_completion'
      ) THEN
        ALTER TABLE users ADD COLUMN insights_pre_completion BOOLEAN DEFAULT FALSE;
      END IF;

      -- Supabase Auth: UUID linking to Supabase auth user
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'supabase_uid'
      ) THEN
        ALTER TABLE users ADD COLUMN supabase_uid UUID UNIQUE;
      END IF;

      -- Auth provider: tracks how the user signed up (email, google, apple)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'auth_provider'
      ) THEN
        ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'email';
      END IF;

      -- Profile complete: false for OAuth users who haven't filled profile yet
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'profile_complete'
      ) THEN
        ALTER TABLE users ADD COLUMN profile_complete BOOLEAN DEFAULT TRUE;
      END IF;

      -- Consent accepted: user agreed to terms/privacy/AI usage
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'consent_accepted'
      ) THEN
        ALTER TABLE users ADD COLUMN consent_accepted BOOLEAN DEFAULT FALSE;
      END IF;

      -- Photo AI consent: user agreed to AI analysis of their photos
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'photo_ai_consent'
      ) THEN
        ALTER TABLE users ADD COLUMN photo_ai_consent BOOLEAN DEFAULT FALSE;
      END IF;

      -- Email updates consent (default true)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'email_updates'
      ) THEN
        ALTER TABLE users ADD COLUMN email_updates BOOLEAN DEFAULT TRUE;
      END IF;

      -- WhatsApp updates consent
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'whatsapp_updates'
      ) THEN
        ALTER TABLE users ADD COLUMN whatsapp_updates BOOLEAN DEFAULT FALSE;
      END IF;

      -- WhatsApp phone number
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'whatsapp_phone'
      ) THEN
        ALTER TABLE users ADD COLUMN whatsapp_phone TEXT;
      END IF;

      -- In matching pool: manually controlled flag for matching eligibility
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'in_matching_pool'
      ) THEN
        ALTER TABLE users ADD COLUMN in_matching_pool BOOLEAN DEFAULT FALSE;
      END IF;

      -- Device tracking: last device type and PWA install status
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'last_device'
      ) THEN
        ALTER TABLE users ADD COLUMN last_device TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'pwa_installed'
      ) THEN
        ALTER TABLE users ADD COLUMN pwa_installed BOOLEAN DEFAULT FALSE;
      END IF;

      -- Sensitive personal details
      -- All devices ever seen (JSONB array of objects)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'devices_seen'
      ) THEN
        ALTER TABLE users ADD COLUMN devices_seen JSONB DEFAULT '[]'::jsonb;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'marital_status'
      ) THEN
        ALTER TABLE users ADD COLUMN marital_status TEXT DEFAULT 'single';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'has_children'
      ) THEN
        ALTER TABLE users ADD COLUMN has_children BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'religion'
      ) THEN
        ALTER TABLE users ADD COLUMN religion TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'smoker'
      ) THEN
        ALTER TABLE users ADD COLUMN smoker BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_message'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_message TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_contacted'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_contacted BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_processing_done'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_processing_done BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_checklist'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_checklist JSONB DEFAULT '{}';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'partner_in_system'
      ) THEN
        ALTER TABLE users ADD COLUMN partner_in_system BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'couple_handled_at'
      ) THEN
        ALTER TABLE users ADD COLUMN couple_handled_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_processing_done_at'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_processing_done_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_notes'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_notes TEXT DEFAULT '';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_force_completed'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_force_completed BOOLEAN DEFAULT FALSE;
      END IF;

      -- Admin location override: expand location filter without changing user's preference
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'admin_location_override'
      ) THEN
        ALTER TABLE users ADD COLUMN admin_location_override TEXT;
      END IF;

      -- Location expanded flag on candidate_matches
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_matches' AND column_name = 'location_expanded'
      ) THEN
        ALTER TABLE candidate_matches ADD COLUMN location_expanded BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `);

  // System questions table — admin sends questions to users, users answer with fixed options
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_questions (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_text   TEXT NOT NULL,
      answer          TEXT,
      answered_at     TIMESTAMPTZ,
      admin_seen      BOOLEAN DEFAULT FALSE,
      admin_seen_at   TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_system_questions_user ON system_questions(user_id);
  `);

  // Backfill admin_contacted from email_log (users who already received emails)
  try {
    await pool.query(`
      UPDATE users SET admin_contacted = TRUE
      WHERE admin_contacted = FALSE
        AND id IN (SELECT DISTINCT user_id FROM email_log WHERE user_id IS NOT NULL);
    `);
  } catch (e) {
    console.log("[schema] backfill admin_contacted skipped:", (e as Error).message);
  }

  // Change desired_location_range default from 'my_area' to 'bit_further'
  await pool.query(`
    ALTER TABLE users ALTER COLUMN desired_location_range SET DEFAULT 'bit_further';
  `);

  // Index for fast lookup by supabase_uid
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON users(supabase_uid);
  `);

  // Add topic_injection_counts to user_chat_summaries if missing
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_chat_summaries' AND column_name = 'topic_injection_counts'
      ) THEN
        ALTER TABLE user_chat_summaries ADD COLUMN topic_injection_counts JSONB DEFAULT '{"intro":0,"relationships":0,"personality":0,"values":0,"culture":0}';
      END IF;
    END $$;
  `);

  // dark_mode column
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'dark_mode'
      ) THEN
        ALTER TABLE users ADD COLUMN dark_mode BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `);

  // ── User Chat Summaries ───────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_chat_summaries (
      id                        SERIAL PRIMARY KEY,
      user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      summary_json              JSONB NOT NULL DEFAULT '{}',
      message_count_at          INTEGER NOT NULL DEFAULT 0,
      topic_injection_counts    JSONB DEFAULT '{"intro":0,"relationships":0,"personality":0,"values":0,"culture":0}',
      updated_at                TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_chat_summaries_user ON user_chat_summaries(user_id);
  `);

  // ── OTP Codes (email login) ────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id               SERIAL PRIMARY KEY,
      email            VARCHAR(255) NOT NULL,
      code             VARCHAR(6) NOT NULL,
      expires_at       TIMESTAMPTZ NOT NULL,
      used             BOOLEAN DEFAULT FALSE,
      failed_attempts  INTEGER DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email, used);
  `);
  // Migration: add failed_attempts column if missing
  await pool.query(`
    ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;
  `);

  // ── Page Views (analytics) ────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS page_views (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      page        VARCHAR(100) NOT NULL,
      viewed_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(user_id);
    CREATE INDEX IF NOT EXISTS idx_page_views_page ON page_views(page);
    CREATE INDEX IF NOT EXISTS idx_page_views_time ON page_views(viewed_at);
  `);

  // ── Email Log ─────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_log (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      subject     TEXT NOT NULL,
      sent_at     TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id);

    -- matches: sent_for_rating_at + sent_for_rating_to + rejection_reason
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'sent_for_rating_at') THEN
        ALTER TABLE matches ADD COLUMN sent_for_rating_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'sent_for_rating_to') THEN
        ALTER TABLE matches ADD COLUMN sent_for_rating_to INTEGER REFERENCES users(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'rejection_reason') THEN
        ALTER TABLE matches ADD COLUMN rejection_reason TEXT;
      END IF;
    END $$;

    -- age_expanded on candidate_matches
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidate_matches' AND column_name = 'age_expanded') THEN
        ALTER TABLE candidate_matches ADD COLUMN age_expanded BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;

    -- photo verification flags on users
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'photo_flags') THEN
        ALTER TABLE users ADD COLUMN photo_flags JSONB DEFAULT NULL;
      END IF;
    END $$;

    -- admin notes on candidate_matches
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidate_matches' AND column_name = 'admin_notes') THEN
        ALTER TABLE candidate_matches ADD COLUMN admin_notes TEXT DEFAULT NULL;
      END IF;
    END $$;

    -- match card consent on users
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'match_card_consent') THEN
        ALTER TABLE users ADD COLUMN match_card_consent TEXT DEFAULT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'match_card_restrictions') THEN
        ALTER TABLE users ADD COLUMN match_card_restrictions TEXT DEFAULT NULL;
      END IF;
    END $$;

    -- pool_email_pending — set by completion pipeline, cleared when admin sends email
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'pool_email_pending') THEN
        ALTER TABLE users ADD COLUMN pool_email_pending BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;

    -- match card data on matches
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'match_card_data') THEN
        ALTER TABLE matches ADD COLUMN match_card_data JSONB DEFAULT NULL;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'match_card_approved_by_admin') THEN
        ALTER TABLE matches ADD COLUMN match_card_approved_by_admin BOOLEAN DEFAULT FALSE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'match_card_sent_at') THEN
        ALTER TABLE matches ADD COLUMN match_card_sent_at TIMESTAMPTZ DEFAULT NULL;
      END IF;
    END $$;

    -- ================================================================
    -- DIRECT MESSAGING (between matched users)
    -- ================================================================

    CREATE TABLE IF NOT EXISTS direct_messages (
      id          SERIAL PRIMARY KEY,
      match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
      sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      read_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_direct_messages_match ON direct_messages(match_id, created_at);

    CREATE TABLE IF NOT EXISTS typing_status (
      match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_typing   BOOLEAN DEFAULT FALSE,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (match_id, user_id)
    );

    -- Match blocking
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'blocked_by') THEN
        ALTER TABLE matches ADD COLUMN blocked_by INTEGER REFERENCES users(id) DEFAULT NULL;
      END IF;
    END $$;

    -- Match cancellation tracking
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'cancelled_by') THEN
        ALTER TABLE matches ADD COLUMN cancelled_by INTEGER REFERENCES users(id) DEFAULT NULL;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'cancellation_feedback_user1') THEN
        ALTER TABLE matches ADD COLUMN cancellation_feedback_user1 TEXT DEFAULT NULL;
      END IF;
    END $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'cancellation_feedback_user2') THEN
        ALTER TABLE matches ADD COLUMN cancellation_feedback_user2 TEXT DEFAULT NULL;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'rating_admin_seen') THEN
        ALTER TABLE matches ADD COLUMN rating_admin_seen BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_photos' AND column_name = 'is_primary') THEN
        ALTER TABLE user_photos ADD COLUMN is_primary BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;

    -- photo_request_sent_at — tracks when admin sent a photo request to a user
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'photo_request_sent_at') THEN
        ALTER TABLE users ADD COLUMN photo_request_sent_at TIMESTAMPTZ DEFAULT NULL;
      END IF;
    END $$;

    -- admin_message_sent_at — tracks when admin_message was last set
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'admin_message_sent_at') THEN
        ALTER TABLE users ADD COLUMN admin_message_sent_at TIMESTAMPTZ DEFAULT NULL;
      END IF;
    END $$;

    -- admin_message_dismissed — user clicked "ראיתי, תודה" to dismiss message
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'admin_message_dismissed') THEN
        ALTER TABLE users ADD COLUMN admin_message_dismissed BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;

    -- suspected_inactive — admin marks user as suspected inactive
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'suspected_inactive') THEN
        ALTER TABLE users ADD COLUMN suspected_inactive BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS deleted_users (
      id                SERIAL PRIMARY KEY,
      original_user_id  INTEGER NOT NULL,
      first_name        TEXT,
      email             TEXT,
      gender            TEXT,
      age               INTEGER,
      city              TEXT,
      test_user_type    TEXT,
      created_at        TIMESTAMPTZ,
      deleted_at        TIMESTAMPTZ DEFAULT NOW(),
      deleted_by        TEXT DEFAULT 'user',
      chat_count        INTEGER DEFAULT 0,
      was_in_pool       BOOLEAN DEFAULT FALSE,
      had_insights      BOOLEAN DEFAULT FALSE
    );
  `);

  // Error logs — captures frontend + backend errors for monitoring
  await pool.query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id              SERIAL PRIMARY KEY,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      source          TEXT NOT NULL DEFAULT 'frontend',
      user_id         INTEGER,
      route           TEXT,
      method          TEXT,
      status_code     INTEGER,
      message         TEXT NOT NULL,
      stack           TEXT,
      user_agent      TEXT,
      extra           JSONB
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
  `);

  // Pipeline jobs — reliable background job processing for user automation
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_jobs (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_type        TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      attempts        INTEGER DEFAULT 0,
      max_attempts    INTEGER DEFAULT 3,
      last_error      TEXT,
      step_reached    TEXT,
      metadata        JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      started_at      TIMESTAMPTZ,
      completed_at    TIMESTAMPTZ,
      next_retry_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_pending
      ON pipeline_jobs (status, next_retry_at)
      WHERE status IN ('pending', 'failed');
    CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_user
      ON pipeline_jobs (user_id, job_type);
  `);

  // email_log: add email_type column for dedup
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_log' AND column_name = 'email_type'
      ) THEN
        ALTER TABLE email_log ADD COLUMN email_type TEXT;
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_log_type_user
      ON email_log (user_id, email_type) WHERE email_type IS NOT NULL;
  `);

  // ── Change ON DELETE CASCADE → RESTRICT for direct_messages and typing_status ──
  await pool.query(`
    DO $$
    DECLARE fk_name TEXT;
    BEGIN
      -- direct_messages.match_id: CASCADE → RESTRICT
      SELECT tc.constraint_name INTO fk_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'direct_messages' AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'match_id' AND rc.delete_rule = 'CASCADE'
      LIMIT 1;
      IF fk_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE direct_messages DROP CONSTRAINT ' || fk_name;
        ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_match_id_fkey
          FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE RESTRICT;
      END IF;

      -- typing_status.match_id: CASCADE → RESTRICT
      fk_name := NULL;
      SELECT tc.constraint_name INTO fk_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'typing_status' AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'match_id' AND rc.delete_rule = 'CASCADE'
      LIMIT 1;
      IF fk_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE typing_status DROP CONSTRAINT ' || fk_name;
        ALTER TABLE typing_status ADD CONSTRAINT typing_status_match_id_fkey
          FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `);

  // ── Migrate attitude traits from "Personal Style" to "Attitudes" group ──
  await pool.query(`
    UPDATE trait_definitions SET trait_group = 'Attitudes'
    WHERE internal_name IN ('right_wing', 'left_wing', 'social_activism', 'religiosity', 'secularity', 'value_rigidity')
      AND trait_group = 'Personal Style';
  `);

  // ── Survey responses table ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      responses       JSONB NOT NULL DEFAULT '{}',
      completed       BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_survey_responses_user ON survey_responses(user_id);
  `);

  // ── Survey columns on users ──
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='survey_email_sent_at') THEN
        ALTER TABLE users ADD COLUMN survey_email_sent_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='survey_banner_dismissed') THEN
        ALTER TABLE users ADD COLUMN survey_banner_dismissed BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `);

  // ── Agent context columns on users ──
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='agent_context') THEN
        ALTER TABLE users ADD COLUMN agent_context TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='admin_message_type') THEN
        ALTER TABLE users ADD COLUMN admin_message_type VARCHAR(20) DEFAULT 'info';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='admin_message_responded_at') THEN
        ALTER TABLE users ADD COLUMN admin_message_responded_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='admin_message_response_seen') THEN
        ALTER TABLE users ADD COLUMN admin_message_response_seen BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `);

  // ── System summary config rows for agent context ──
  await pool.query(`
    INSERT INTO config (key, value, description, category)
    VALUES
      ('system_summary_general', '""'::jsonb, 'System-wide agent context for all users', 'agent_context'),
      ('system_summary_male', '""'::jsonb, 'Additional agent context for male users', 'agent_context'),
      ('system_summary_female', '""'::jsonb, 'Additional agent context for female users (straight)', 'agent_context'),
      ('system_summary_female_ff', '""'::jsonb, 'Additional agent context for women seeking women', 'agent_context')
    ON CONFLICT (key) DO NOTHING;
  `);
}
