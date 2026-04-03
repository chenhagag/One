/**
 * MatchMe Database Schema
 * =======================
 *
 * Tables are organized into 4 layers:
 *
 * 1. DEFINITION / CONFIG TABLES (trait_definitions, look_trait_definitions, enum_options, config)
 *    - Drive the system dynamically — no hardcoded traits
 *    - Editable via admin for experimentation
 *
 * 2. CORE SYSTEM TABLES (users)
 *    - User identity + system-managed metadata (status, scores, flags)
 *
 * 3. USER DATA TABLES (user_traits, user_look_traits, user_preferences)
 *    - AI-generated data and user input data, linked to definitions
 *    - Fully dynamic: adding a new trait = adding a row to definitions
 *
 * 4. FUTURE ALGORITHM TABLES (matches, match_scores) — placeholders only
 */

import Database from "better-sqlite3";

export function createSchema(db: Database.Database) {
  db.exec(`
    -- ================================================================
    -- 1. DEFINITION / CONFIG TABLES
    -- ================================================================

    -- Personality/behavioral trait definitions (from "מאפיינים - כללי")
    -- Each row defines one trait the AI should assess
    CREATE TABLE IF NOT EXISTS trait_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      internal_name TEXT NOT NULL UNIQUE,
      display_name_he TEXT NOT NULL,         -- Hebrew display name
      display_name_en TEXT,                  -- English display name (optional)
      ai_description TEXT,                   -- Description for AI prompt
      required_confidence REAL DEFAULT 0.5,  -- Minimum confidence AI must have (0-1)
      weight INTEGER DEFAULT 5,              -- Default importance weight (1-10)
      sensitivity TEXT DEFAULT 'normal',     -- normal | sensitive | safe_output
      calc_type TEXT DEFAULT 'normal',       -- normal | special | filter | internal_use
      default_filter_range REAL,             -- Default matching range
      personal_filter_desc TEXT,             -- How personal filter works
      notes TEXT,
      is_filter TEXT DEFAULT 'no',             -- yes | no | user_defined
      filter_type TEXT,                        -- range | fixed (nullable)
      min_value REAL,                          -- nullable
      max_value REAL,                          -- nullable
      is_active INTEGER DEFAULT 1,           -- Soft-delete / toggle
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Physical/external trait definitions (from "מאפיינים חיצוניים - כללי")
    CREATE TABLE IF NOT EXISTS look_trait_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      internal_name TEXT NOT NULL UNIQUE,
      display_name_he TEXT NOT NULL,
      display_name_en TEXT,
      source TEXT DEFAULT 'ai',              -- ai | form | system
      weight INTEGER DEFAULT 50,             -- Importance weight (0-100)
      sensitivity TEXT DEFAULT 'normal',
      filter_range TEXT,
      possible_values TEXT,                  -- JSON array of possible values
      is_filter TEXT DEFAULT 'no',             -- yes | no | user_defined
      filter_type TEXT,                        -- range | fixed (nullable)
      min_value REAL,                          -- nullable
      max_value REAL,                          -- nullable
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Enum/option definitions for dropdowns, multi-selects, etc.
    -- Used by registration form and anywhere options are needed
    CREATE TABLE IF NOT EXISTS enum_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,                -- e.g. 'gender', 'look_style', 'flexibility', 'user_status', 'location_range'
      value TEXT NOT NULL,                   -- Internal value
      label_he TEXT NOT NULL,                -- Hebrew display label
      label_en TEXT,                         -- English label (optional)
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      UNIQUE(category, value)
    );

    -- Key-value config for weights, thresholds, and system parameters
    -- Anything that should be tweakable without code changes
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,                   -- JSON-encoded value
      description TEXT,
      category TEXT DEFAULT 'general',       -- general | scoring | matching | system
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ================================================================
    -- 2. CORE SYSTEM TABLES
    -- ================================================================

    -- Users table — expanded from original with all fields from "פרטי משתמש"
    -- Registration data + system-computed fields
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Registration fields (user input)
      first_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      age INTEGER,
      gender TEXT,                           -- References enum_options(category='gender')
      looking_for_gender TEXT,               -- References enum_options(category='looking_for_gender')
      city TEXT,
      height INTEGER,                        -- cm
      self_style TEXT,                       -- JSON array of selected styles

      -- Preference fields (user input — "what I'm looking for")
      desired_age_min INTEGER,
      desired_age_max INTEGER,
      age_flexibility TEXT DEFAULT 'slightly_flexible',  -- not_flexible | slightly_flexible | very_flexible
      desired_height_min INTEGER,
      desired_height_max INTEGER,
      height_flexibility TEXT DEFAULT 'slightly_flexible',
      desired_location_range TEXT DEFAULT 'my_area',     -- my_city | my_area | bit_further | whole_country

      -- System-managed fields (computed by algorithm)
      user_status TEXT DEFAULT 'waiting_match',  -- in_match | frozen | waiting_payment | waiting_match
      is_real_user INTEGER DEFAULT 1,
      is_matchable INTEGER DEFAULT 0,            -- Calculated readiness
      first_priority_score REAL DEFAULT 0,       -- Queue priority
      subscription_status TEXT DEFAULT 'free',
      pickiness_score REAL,                      -- Calculated from user ratings
      initial_attraction_signal REAL,            -- Approval rate from others
      valid_person INTEGER DEFAULT 1,            -- Toxic/troll flag (AI-determined)

      -- Timestamps
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Keep existing profiles table for backward compat with AI chat
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      raw_answer TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ================================================================
    -- 3. USER DATA TABLES
    -- ================================================================

    -- AI-generated personality traits per user
    -- One row per user per trait — fully dynamic via trait_definitions
    CREATE TABLE IF NOT EXISTS user_traits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      trait_definition_id INTEGER NOT NULL REFERENCES trait_definitions(id),
      score REAL,                            -- 0-100 scale
      confidence REAL,                       -- 0-1 how confident the AI is
      weight_for_match REAL,                 -- How important this trait is when matching THIS user
      weight_confidence REAL,                -- Confidence in the weight
      source TEXT DEFAULT 'ai',              -- ai | manual | system
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, trait_definition_id)
    );

    -- Physical/external traits per user
    CREATE TABLE IF NOT EXISTS user_look_traits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      look_trait_definition_id INTEGER NOT NULL REFERENCES look_trait_definitions(id),
      personal_value TEXT,                   -- The user's own value (e.g. "slim", "dark")
      personal_value_confidence REAL,        -- Confidence in personal value
      desired_value TEXT,                    -- What user wants in partner (optional)
      desired_value_confidence REAL,
      weight_for_match REAL,                 -- How important to this user
      weight_confidence REAL,
      source TEXT DEFAULT 'ai',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, look_trait_definition_id)
    );

    -- ================================================================
    -- 4. FUTURE ALGORITHM TABLES (placeholders)
    -- ================================================================

    -- Matches between users (from "אלגוריתם שידוכים")
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL REFERENCES users(id),
      user2_id INTEGER NOT NULL REFERENCES users(id),
      match_score REAL,                      -- Overall match score
      user1_rating TEXT,                     -- User 1's response
      user2_rating TEXT,                     -- User 2's response
      status TEXT DEFAULT 'pending',         -- pending | waiting_first_rating | waiting_second_rating | approved | rejected | in_match | cancelled | frozen | expired
      system_priority_user1 REAL,
      system_priority_user2 REAL,
      pair_priority REAL,
      match_priority REAL,                   -- Final priority = f(pair_priority, match_score)
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Detailed score breakdown per match (placeholder for scoring algorithm)
    CREATE TABLE IF NOT EXISTS match_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id),
      score_type TEXT NOT NULL,              -- 'internal' (80%) | 'external' (20%)
      trait_name TEXT,                       -- Which trait was scored
      user1_score REAL,
      user2_score REAL,
      weight REAL,
      confidence REAL,
      weighted_score REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ================================================================
    -- CANDIDATE MATCHES (stage 1 output)
    -- ================================================================

    CREATE TABLE IF NOT EXISTS candidate_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      candidate_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending_score',  -- pending_score | scored | matched | rejected
      filtering_passed INTEGER NOT NULL DEFAULT 1,
      last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      user1_last_source_update TEXT,                 -- users.updated_at snapshot for user_id
      user2_last_source_update TEXT,                 -- users.updated_at snapshot for candidate_user_id
      internal_score REAL,                         -- stage 2: personality score (0-100)
      external_score REAL,                         -- stage 2: appearance score (0-100)
      final_score REAL,                            -- stage 2: weighted combination (0-100)
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, candidate_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_candidate_matches_user ON candidate_matches(user_id);
    CREATE INDEX IF NOT EXISTS idx_candidate_matches_status ON candidate_matches(status);

    -- ================================================================
    -- GEOGRAPHY TABLES
    -- ================================================================

    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city_name TEXT NOT NULL,
      region TEXT NOT NULL,
      UNIQUE(city_name)
    );

    CREATE TABLE IF NOT EXISTS region_adjacency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL,
      nearby_region TEXT NOT NULL,
      UNIQUE(region, nearby_region)
    );

    -- ================================================================
    -- INDEXES for performance
    -- ================================================================
    CREATE INDEX IF NOT EXISTS idx_user_traits_user ON user_traits(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_traits_trait ON user_traits(trait_definition_id);
    CREATE INDEX IF NOT EXISTS idx_user_look_traits_user ON user_look_traits(user_id);
    CREATE INDEX IF NOT EXISTS idx_matches_users ON matches(user1_id, user2_id);
    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_enum_options_cat ON enum_options(category);
  `);

  // ── Safe column migrations ──────────────────────────────────────
  // SQLite throws if ALTER TABLE ADD COLUMN targets an existing column,
  // so we check PRAGMA table_info first.

  function hasColumn(table: string, column: string): boolean {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.some((c) => c.name === column);
  }

  const migrations: [string, string, string][] = [
    // [table, column, full ALTER statement]
    ["trait_definitions", "is_filter",  "ALTER TABLE trait_definitions ADD COLUMN is_filter TEXT DEFAULT 'no'"],
    ["trait_definitions", "filter_type","ALTER TABLE trait_definitions ADD COLUMN filter_type TEXT"],
    ["trait_definitions", "min_value",  "ALTER TABLE trait_definitions ADD COLUMN min_value REAL"],
    ["trait_definitions", "max_value",  "ALTER TABLE trait_definitions ADD COLUMN max_value REAL"],
    ["look_trait_definitions", "is_filter",  "ALTER TABLE look_trait_definitions ADD COLUMN is_filter TEXT DEFAULT 'no'"],
    ["look_trait_definitions", "filter_type","ALTER TABLE look_trait_definitions ADD COLUMN filter_type TEXT"],
    ["look_trait_definitions", "min_value",  "ALTER TABLE look_trait_definitions ADD COLUMN min_value REAL"],
    ["look_trait_definitions", "max_value",  "ALTER TABLE look_trait_definitions ADD COLUMN max_value REAL"],
    ["candidate_matches", "internal_score", "ALTER TABLE candidate_matches ADD COLUMN internal_score REAL"],
    ["candidate_matches", "external_score", "ALTER TABLE candidate_matches ADD COLUMN external_score REAL"],
    ["candidate_matches", "final_score",    "ALTER TABLE candidate_matches ADD COLUMN final_score REAL"],
    ["users", "total_matches", "ALTER TABLE users ADD COLUMN total_matches INTEGER DEFAULT 0"],
    ["users", "good_matches",  "ALTER TABLE users ADD COLUMN good_matches INTEGER DEFAULT 0"],
  ];

  for (const [table, column, sql] of migrations) {
    if (!hasColumn(table, column)) {
      db.exec(sql);
    }
  }

  // ── Seed geography tables (idempotent via INSERT OR IGNORE) ────

  const insertCity = db.prepare("INSERT OR IGNORE INTO cities (city_name, region) VALUES (?, ?)");
  const insertAdj = db.prepare("INSERT OR IGNORE INTO region_adjacency (region, nearby_region) VALUES (?, ?)");

  db.transaction(() => {
    // cities
    const cityData: [string, string][] = [
      ["תל אביב", "תל אביב"], ["רמת גן", "תל אביב"], ["גבעתיים", "תל אביב"],
      ["בני ברק", "תל אביב"], ["חולון", "תל אביב"], ["בת ים", "תל אביב"],
      ["הרצליה", "מרכז-שרון"], ["רעננה", "מרכז-שרון"], ["כפר סבא", "מרכז-שרון"],
      ["הוד השרון", "מרכז-שרון"], ["נתניה", "מרכז-שרון"],
      ["ראשון לציון", "מרכז-שפלה"], ["רחובות", "מרכז-שפלה"], ["נס ציונה", "מרכז-שפלה"],
      ["לוד", "מרכז-שפלה"], ["רמלה", "מרכז-שפלה"], ["מודיעין", "מרכז-שפלה"],
      ["ירושלים", "ירושלים"], ["מבשרת ציון", "ירושלים"],
      ["חיפה", "צפון"], ["קריות", "צפון"], ["עכו", "צפון"],
      ["נהריה", "צפון"], ["נצרת", "צפון"], ["טבריה", "צפון"],
      ["באר שבע", "דרום"], ["אשדוד", "דרום"], ["אשקלון", "דרום"], ["אילת", "דרום"],
    ];
    for (const [city, region] of cityData) insertCity.run(city, region);

    // region adjacency (bidirectional)
    const adjData: [string, string][] = [
      ["תל אביב", "מרכז-שרון"],
      ["תל אביב", "מרכז-שפלה"],
      ["מרכז-שרון", "צפון"],
      ["מרכז-שפלה", "ירושלים"],
      ["מרכז-שפלה", "דרום"],
    ];
    for (const [a, b] of adjData) {
      insertAdj.run(a, b);
      insertAdj.run(b, a);
    }
  })();
}
