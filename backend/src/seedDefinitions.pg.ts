/**
 * Postgres version of seedDefinitions.ts — idempotent (INSERT ... ON CONFLICT DO NOTHING).
 *
 * TODO Phase 2: port the full seed data from seedDefinitions.ts here.
 * For now this is a stub that lets the app boot against an empty postgres.
 */

import type { Pool } from "pg";

export async function seedDefinitionsPg(pool: Pool): Promise<void> {
  // Placeholder — port trait_definitions, look_trait_definitions, enum_options, config
  // seed rows from seedDefinitions.ts here, using:
  //
  //   INSERT INTO trait_definitions (...) VALUES ($1, $2, ...)
  //   ON CONFLICT (internal_name) DO NOTHING
  //
  console.log("[db] seedDefinitionsPg: stub — port seed data before production use.");
}
