/**
 * PostgreSQL connection + query helpers.
 *
 * This module is lazy: the pool is only created on first use, and import-time
 * errors are avoided if DATABASE_URL isn't set. That lets CLI scripts and
 * tests that only touch SQLite still run during the gradual migration.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import type Database from "better-sqlite3";
import { createSchemaPg } from "./schema.pg";
import { seedDefinitionsPg } from "./seedDefinitions.pg";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env (local) or Railway env vars (prod)."
    );
  }

  // Railway's hosted Postgres requires SSL; local dev does not.
  const needsSsl =
    process.env.NODE_ENV === "production" ||
    /railway\.app|rlwy\.net/.test(connectionString);

  _pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  _pool.on("error", (err) => {
    console.error("[pg pool] unexpected error on idle client:", err);
  });

  return _pool;
}

/** Convenience export — uses getPool() under the hood. */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});

// ── Query helpers ─────────────────────────────────────────────────

export function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | undefined> {
  const res = await getPool().query<T>(text, params);
  return res.rows[0];
}

export async function queryAll<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryRun(
  text: string,
  params?: any[]
): Promise<{ rowCount: number }> {
  const res = await getPool().query(text, params);
  return { rowCount: res.rowCount ?? 0 };
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Initialization ────────────────────────────────────────────────

let _initPromise: Promise<void> | null = null;

/**
 * Create schema and seed — idempotent.
 * Safe to call many times; only the first call actually runs.
 * Call once from index.ts at server startup.
 */
export function initDb(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    console.log("[db] Initializing PostgreSQL...");
    const p = getPool();
    await createSchemaPg(p);
    await seedDefinitionsPg(p);
    console.log("[db] PostgreSQL ready.");
  })().catch((err) => {
    // Reset on failure so a retry can try again.
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

// ── Bridge: mirror static config from SQLite to pg ───────────────

/**
 * Normalize any value to a JSON string accepted by a pg JSONB column,
 * or null when there's no value. Handles the three cases we see in the
 * wild: already-a-JSON-string, JS object/array, or malformed/empty.
 *
 *   null / undefined / "" / "null"  → null
 *   valid JSON string               → returned as-is (pg will parse)
 *   JS object or array              → JSON.stringify(...)
 *   malformed string                → wrapped: '{"raw":"..."}'
 *
 * We pass the result as a string AND cast $N::jsonb in SQL so pg parses
 * it cleanly (node-pg otherwise sends JS arrays as Postgres arrays,
 * which triggers "invalid input syntax for type json").
 */
export function toJsonbParam(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || s.toLowerCase() === "null") return null;
    try {
      JSON.parse(s);
      return s; // already valid JSON
    } catch {
      return JSON.stringify({ raw: v });
    }
  }

  // object / array / primitive — always serialize
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/**
 * During the SQLite -> pg migration, the static config tables
 * (trait_definitions, look_trait_definitions) are still populated
 * from the Excel import into SQLite. This bridge copies those rows
 * into pg so loader.ts (and any other pg reader) sees the same data.
 *
 * Idempotent: ON CONFLICT DO NOTHING on internal_name.
 *
 * Remove this bridge once seedDefinitions.pg.ts + importExcel are
 * fully ported to pg.
 */
export async function syncConfigFromSqlite(sqliteDb: Database.Database): Promise<void> {
  const p = getPool();

  // ── trait_definitions (no JSONB columns) ──
  const traits = sqliteDb.prepare("SELECT * FROM trait_definitions").all() as any[];
  for (const t of traits) {
    await p.query(
      `INSERT INTO trait_definitions
         (id, internal_name, display_name_he, display_name_en, ai_description,
          required_confidence, weight, sensitivity, calc_type, default_filter_range,
          personal_filter_desc, notes, is_filter, filter_type, min_value, max_value,
          trait_group, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (internal_name) DO NOTHING`,
      [
        t.id, t.internal_name, t.display_name_he, t.display_name_en, t.ai_description,
        t.required_confidence, t.weight, t.sensitivity, t.calc_type, t.default_filter_range,
        t.personal_filter_desc, t.notes, t.is_filter, t.filter_type, t.min_value, t.max_value,
        t.trait_group, !!t.is_active, t.sort_order,
      ]
    );
  }

  // ── look_trait_definitions (possible_values is JSONB) ──
  const looks = sqliteDb.prepare("SELECT * FROM look_trait_definitions").all() as any[];
  for (const t of looks) {
    await p.query(
      `INSERT INTO look_trait_definitions
         (id, internal_name, display_name_he, display_name_en, source, weight,
          sensitivity, filter_range, possible_values, is_filter, filter_type,
          min_value, max_value, ai_description, required_confidence, trait_group,
          notes, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (internal_name) DO NOTHING`,
      [
        t.id, t.internal_name, t.display_name_he, t.display_name_en, t.source, t.weight,
        t.sensitivity, t.filter_range,
        toJsonbParam(t.possible_values),
        t.is_filter, t.filter_type, t.min_value, t.max_value, t.ai_description,
        t.required_confidence, t.trait_group, t.notes, !!t.is_active, t.sort_order,
      ]
    );
  }

  // ── Bump SERIAL sequences past the highest mirrored id ──
  // (we inserted explicit ids; without this, new inserts would collide)
  await p.query(
    `SELECT setval('trait_definitions_id_seq',
       COALESCE((SELECT MAX(id) FROM trait_definitions), 0) + 1, false)`
  );
  await p.query(
    `SELECT setval('look_trait_definitions_id_seq',
       COALESCE((SELECT MAX(id) FROM look_trait_definitions), 0) + 1, false)`
  );

  console.log(`[db] Config mirror: ${traits.length} traits + ${looks.length} look_traits synced to pg`);
}

// ── Users + profiles bridge (Phase 4a) ────────────────────────────

/**
 * One-shot copy of users and profiles from SQLite to pg.
 * Idempotent (ON CONFLICT DO NOTHING) — safe to run on every boot.
 * Preserves IDs so FKs between pg tables work correctly.
 *
 * Runs AFTER syncConfigFromSqlite — so profiles.user_id FK (if ever
 * re-added) will find its target.
 */
export async function syncUsersAndProfilesFromSqlite(sqliteDb: Database.Database): Promise<void> {
  const p = getPool();

  console.log("[db] Users mirror: starting...");

  // ── users ──
  const users = sqliteDb.prepare("SELECT * FROM users").all() as any[];
  let userSuccess = 0;
  let userFailed = 0;
  for (const u of users) {
    try {
      await p.query(
        `INSERT INTO users
           (id, first_name, email, age, gender, looking_for_gender, city, height, self_style,
            desired_age_min, desired_age_max, age_flexibility,
            desired_height_min, desired_height_max, height_flexibility, desired_location_range,
            user_status, is_real_user, is_matchable, readiness_score, first_priority_score,
            subscription_status, pickiness_score, initial_attraction_signal, valid_person,
            waiting_since, system_match_priority, total_matches, good_matches, selected_guide,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,
                 $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
         ON CONFLICT (id) DO NOTHING`,
        [
          u.id, u.first_name, u.email, u.age, u.gender, u.looking_for_gender, u.city, u.height,
          toJsonbParam(u.self_style),
          u.desired_age_min, u.desired_age_max, u.age_flexibility,
          u.desired_height_min, u.desired_height_max, u.height_flexibility, u.desired_location_range,
          u.user_status, !!u.is_real_user, !!u.is_matchable, u.readiness_score, u.first_priority_score,
          u.subscription_status, u.pickiness_score, u.initial_attraction_signal, !!u.valid_person,
          u.waiting_since, u.system_match_priority, u.total_matches, u.good_matches, u.selected_guide,
          u.created_at, u.updated_at,
        ]
      );
      userSuccess++;
    } catch (err: any) {
      userFailed++;
      console.warn(`[db] Users mirror: failed to sync user id=${u.id} email=${u.email}: ${err.message}`);
    }
  }

  // ── profiles ──
  const profiles = sqliteDb.prepare("SELECT * FROM profiles").all() as any[];
  let profileSuccess = 0;
  let profileFailed = 0;
  for (const pr of profiles) {
    try {
      await p.query(
        `INSERT INTO profiles (id, user_id, raw_answer, analysis_json, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (id) DO NOTHING`,
        [pr.id, pr.user_id, pr.raw_answer, toJsonbParam(pr.analysis_json), pr.created_at]
      );
      profileSuccess++;
    } catch (err: any) {
      profileFailed++;
      // Only log first few failures per run to avoid spam
      if (profileFailed <= 5) {
        console.warn(`[db] Users mirror: failed to sync profile id=${pr.id} user_id=${pr.user_id}: ${err.message}`);
      }
    }
  }

  // Bump SERIAL sequences past max imported id
  try {
    await p.query(
      `SELECT setval('users_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM users), 1))`
    );
    await p.query(
      `SELECT setval('profiles_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM profiles), 1))`
    );
  } catch (err: any) {
    console.warn(`[db] Users mirror: setval failed: ${err.message}`);
  }

  console.log(
    `[db] Users mirror: done. users=${userSuccess} ok / ${userFailed} failed, ` +
    `profiles=${profileSuccess} ok / ${profileFailed} failed (out of ${users.length} users, ${profiles.length} profiles)`
  );
}

// ── Dual-write mirror helpers (Phase 4a) ──────────────────────────

/**
 * Upsert one user row from SQLite into pg. Called after every sqlite
 * write to users during the migration window, keeping pg current so
 * anything that reads from pg sees fresh data.
 */
export async function mirrorUserToPg(sqliteDb: Database.Database, userId: number): Promise<void> {
  const u = sqliteDb.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!u) return;

  await getPool().query(
    `INSERT INTO users
       (id, first_name, email, age, gender, looking_for_gender, city, height, self_style,
        desired_age_min, desired_age_max, age_flexibility,
        desired_height_min, desired_height_max, height_flexibility, desired_location_range,
        user_status, is_real_user, is_matchable, readiness_score, first_priority_score,
        subscription_status, pickiness_score, initial_attraction_signal, valid_person,
        waiting_since, system_match_priority, total_matches, good_matches, selected_guide,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,
             $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
     ON CONFLICT (id) DO UPDATE SET
       first_name                 = EXCLUDED.first_name,
       email                      = EXCLUDED.email,
       age                        = EXCLUDED.age,
       gender                     = EXCLUDED.gender,
       looking_for_gender         = EXCLUDED.looking_for_gender,
       city                       = EXCLUDED.city,
       height                     = EXCLUDED.height,
       self_style                 = EXCLUDED.self_style,
       desired_age_min            = EXCLUDED.desired_age_min,
       desired_age_max            = EXCLUDED.desired_age_max,
       age_flexibility            = EXCLUDED.age_flexibility,
       desired_height_min         = EXCLUDED.desired_height_min,
       desired_height_max         = EXCLUDED.desired_height_max,
       height_flexibility         = EXCLUDED.height_flexibility,
       desired_location_range     = EXCLUDED.desired_location_range,
       user_status                = EXCLUDED.user_status,
       is_real_user               = EXCLUDED.is_real_user,
       is_matchable               = EXCLUDED.is_matchable,
       readiness_score            = EXCLUDED.readiness_score,
       first_priority_score       = EXCLUDED.first_priority_score,
       subscription_status        = EXCLUDED.subscription_status,
       pickiness_score            = EXCLUDED.pickiness_score,
       initial_attraction_signal  = EXCLUDED.initial_attraction_signal,
       valid_person               = EXCLUDED.valid_person,
       waiting_since              = EXCLUDED.waiting_since,
       system_match_priority      = EXCLUDED.system_match_priority,
       total_matches              = EXCLUDED.total_matches,
       good_matches               = EXCLUDED.good_matches,
       selected_guide             = EXCLUDED.selected_guide,
       updated_at                 = NOW()`,
    [
      u.id, u.first_name, u.email, u.age, u.gender, u.looking_for_gender, u.city, u.height,
      toJsonbParam(u.self_style),
      u.desired_age_min, u.desired_age_max, u.age_flexibility,
      u.desired_height_min, u.desired_height_max, u.height_flexibility, u.desired_location_range,
      u.user_status, !!u.is_real_user, !!u.is_matchable, u.readiness_score, u.first_priority_score,
      u.subscription_status, u.pickiness_score, u.initial_attraction_signal, !!u.valid_person,
      u.waiting_since, u.system_match_priority, u.total_matches, u.good_matches, u.selected_guide,
      u.created_at, u.updated_at,
    ]
  );
}

/**
 * Upsert one profile row from SQLite into pg.
 */
export async function mirrorProfileToPg(sqliteDb: Database.Database, profileId: number): Promise<void> {
  const pr = sqliteDb.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId) as any;
  if (!pr) return;

  await getPool().query(
    `INSERT INTO profiles (id, user_id, raw_answer, analysis_json, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (id) DO UPDATE SET
       user_id       = EXCLUDED.user_id,
       raw_answer    = EXCLUDED.raw_answer,
       analysis_json = EXCLUDED.analysis_json`,
    [pr.id, pr.user_id, pr.raw_answer, toJsonbParam(pr.analysis_json), pr.created_at]
  );
}

export default pool;
