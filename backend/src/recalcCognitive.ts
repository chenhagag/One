/**
 * One-time script: recalculate cognitive_score for all users
 * using the updated normalization in cognitiveScore.ts.
 *
 * Usage: npx tsx src/recalcCognitive.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { queryAll } from "./db.pg";
import { updateCognitiveScore } from "./cognitiveScore";

async function main() {
  const users = await queryAll<{ id: number; first_name: string; cognitive_score: number | null }>(
    "SELECT id, first_name, cognitive_score FROM users ORDER BY id"
  );

  console.log(`Recalculating cognitive scores for ${users.length} users...\n`);

  let updated = 0;
  for (const u of users) {
    const oldScore = u.cognitive_score;
    const newScore = await updateCognitiveScore(u.id);
    if (oldScore !== newScore) {
      console.log(`  ${u.first_name} (#${u.id}): ${oldScore ?? "—"} → ${newScore ?? "—"}`);
      updated++;
    }
  }

  console.log(`\nDone. ${updated} users updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
