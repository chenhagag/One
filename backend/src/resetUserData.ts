/**
 * Destructive: wipes all user-related data from BOTH SQLite and PostgreSQL.
 *
 * Keeps intact (system/config tables):
 *   - trait_definitions, look_trait_definitions
 *   - enum_options, config
 *   - cities, region_adjacency
 *
 * Wipes (user data tables):
 *   - users, profiles, conversation_messages, user_photos
 *   - user_traits, user_look_traits
 *   - analysis_runs, token_usage
 *   - matches, match_scores, candidate_matches
 *
 * After running, the next registered user will be id=1.
 *
 * Usage (from backend/):
 *   npm run reset-users
 *
 * Requires DATABASE_URL in backend/.env pointing at the Railway pg you want to wipe.
 */

import "dotenv/config";
import db from "./db";
import { getPool } from "./db.pg";

// Order matters for pg due to FK constraints (children first, parents last).
const TABLES = [
  "candidate_matches",
  "match_scores",
  "matches",
  "token_usage",
  "analysis_runs",
  "user_look_traits",
  "user_traits",
  "user_photos",
  "conversation_messages",
  "profiles",
  "users",
];

// Subset that currently exists in pg (the rest haven't been migrated yet).
const PG_TABLES = [
  "token_usage",
  "analysis_runs",
  "user_look_traits",
  "user_traits",
  "profiles",
  "users",
];

async function main() {
  console.log("\n🔴 FULL USER-DATA RESET\n");
  console.log("This will delete ALL users and their data from BOTH databases.");
  console.log("System tables (trait_definitions, config, etc.) will be preserved.\n");

  // Give a small warning window — Ctrl+C aborts before anything starts
  await new Promise((r) => setTimeout(r, 2000));

  // ── SQLite ──────────────────────────────────────────────
  console.log("── SQLite ──");
  for (const table of TABLES) {
    try {
      const result = db.prepare(`DELETE FROM ${table}`).run();
      console.log(`  [sqlite] ${table.padEnd(24)} deleted ${result.changes} rows`);
    } catch (err: any) {
      console.warn(`  [sqlite] ${table.padEnd(24)} SKIPPED: ${err.message}`);
    }
  }

  // Reset SQLite AUTOINCREMENT counters
  try {
    const names = TABLES.map((t) => `'${t}'`).join(",");
    const result = db.prepare(
      `DELETE FROM sqlite_sequence WHERE name IN (${names})`
    ).run();
    console.log(`  [sqlite] sqlite_sequence reset for ${result.changes} tables (next id will be 1)`);
  } catch (err: any) {
    console.warn(`  [sqlite] sqlite_sequence reset failed: ${err.message}`);
  }

  // ── PostgreSQL ──────────────────────────────────────────
  console.log("\n── PostgreSQL ──");
  if (!process.env.DATABASE_URL) {
    console.warn("  DATABASE_URL not set — skipping pg reset.");
    console.warn("  Add it to backend/.env and re-run to wipe the Railway pg too.");
  } else {
    try {
      const pool = getPool();

      for (const table of PG_TABLES) {
        try {
          const result = await pool.query(`DELETE FROM ${table}`);
          console.log(`  [pg]     ${table.padEnd(24)} deleted ${result.rowCount ?? 0} rows`);
        } catch (err: any) {
          console.warn(`  [pg]     ${table.padEnd(24)} SKIPPED: ${err.message}`);
        }
      }

      // Reset SERIAL sequences to 1 (next id from nextval() will be 1)
      for (const table of PG_TABLES) {
        try {
          await pool.query(`SELECT setval('${table}_id_seq', 1, false)`);
          console.log(`  [pg]     ${table.padEnd(24)} id_seq reset to 1`);
        } catch (err: any) {
          console.warn(`  [pg]     ${table.padEnd(24)} id_seq reset failed: ${err.message}`);
        }
      }

      await pool.end();
    } catch (err: any) {
      console.error("  [pg] connection/reset failed:", err.message);
    }
  }

  console.log("\n✅ Reset complete.\n");
  console.log("Preserved (unchanged):");
  console.log("  - trait_definitions, look_trait_definitions");
  console.log("  - enum_options, config");
  console.log("  - cities, region_adjacency\n");
  console.log("Next user registration will be id=1 in both databases.\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Reset failed:", err);
  process.exit(1);
});
