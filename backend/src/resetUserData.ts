/**
 * Wipes all dynamic user data from PostgreSQL ONLY.
 *
 * Keeps intact:
 *   - trait_definitions, look_trait_definitions
 *   - enum_options, config
 *   - cities, region_adjacency
 *
 * Wipes (FK-safe order — children first):
 *   - match_scores, candidate_matches, matches
 *   - token_usage, analysis_runs
 *   - user_look_traits, user_traits
 *   - user_photos, conversation_messages, profiles
 *   - users
 *
 * Resets all SERIAL sequences to 1.
 *
 * Usage:  cd backend && npm run reset-users
 * Requires DATABASE_URL in backend/.env
 */

import "dotenv/config";
import { getPool } from "./db.pg";

// Children first, parent (users) last — respects FK constraints.
const TABLES = [
  "match_scores",
  "candidate_matches",
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

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to backend/.env");
    process.exit(1);
  }

  console.log("\n🔴 PostgreSQL user-data reset\n");

  const pool = getPool();

  // Delete rows
  for (const table of TABLES) {
    try {
      const result = await pool.query(`DELETE FROM ${table}`);
      console.log(`  ${table.padEnd(26)} deleted ${result.rowCount ?? 0} rows`);
    } catch (err: any) {
      console.warn(`  ${table.padEnd(26)} SKIPPED: ${err.message}`);
    }
  }

  // Reset sequences
  console.log("");
  for (const table of TABLES) {
    try {
      await pool.query(`SELECT setval('${table}_id_seq', 1, false)`);
      console.log(`  ${table.padEnd(26)} id_seq → 1`);
    } catch {
      // Some tables might not have a sequence (e.g., if PK is not SERIAL)
    }
  }

  await pool.end();

  console.log("\n✅ Done. Next registered user will be id=1.\n");
  console.log("Preserved (unchanged):");
  console.log("  trait_definitions, look_trait_definitions");
  console.log("  enum_options, config");
  console.log("  cities, region_adjacency\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
