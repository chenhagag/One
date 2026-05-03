/**
 * One-time script: restructure Communication Tone traits.
 *
 * - Moves theatricality from Communication Tone to Personal Style
 * - Deactivates old comm tone traits: communication_softness, harsh_talk,
 *   directness, tonal_balance, authenticity, dramatic_intensity, energy_level
 * - Adds 4 new Communication Tone traits: energetic_intensity,
 *   assertiveness_forcefulness, charismatic_presence, softness_sharpness_balance
 *
 * Usage: npx tsx src/restructureCommTone.ts
 */

import "dotenv/config";
import { getPool } from "./db.pg";

const DEACTIVATE = [
  "communication_softness", "harsh_talk", "directness", "tonal_balance",
  "authenticity", "dramatic_intensity", "energy_level",
  "softness_sharpness_balance", "hesitation_level",
];

const NEW_TRAITS = [
  {
    internal_name: "energetic_intensity",
    display_name_he: "עוצמה אנרגטית",
    display_name_en: "Energetic Intensity",
    ai_description: "Measures communication energy level, pace, passion, verbal intensity, momentum, enthusiasm, and overall energetic presence. High = passionate, energetic, fast-paced, dynamic, strong momentum. Low = calm, reserved, slow-paced, relaxed, quiet.",
  },
  {
    internal_name: "assertiveness_forcefulness",
    display_name_he: "אסרטיביות ותקיפות",
    display_name_en: "Assertiveness & Forcefulness",
    ai_description: "Measures directness, decisiveness, forcefulness, dominance, leadership tone, and clarity. High = highly direct, decisive, assertive, dominant, strong leadership tone. Low = indirect, softened, conflict-avoidant, less dominant, hesitant.",
  },
  {
    internal_name: "charismatic_presence",
    display_name_he: "נוכחות כריזמטית",
    display_name_en: "Charismatic Presence",
    ai_description: "Measures verbal charisma, magnetic communication, personal presence, expressiveness, and memorable social impact. High = highly charismatic, strong presence, magnetic, engaging, memorable. Low = functional communication, lower presence, less verbally memorable.",
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Add it to backend/.env");
    process.exit(1);
  }

  const pool = getPool();

  // 1. Move theatricality to Personal Style
  const moved = await pool.query(
    "UPDATE trait_definitions SET trait_group = 'Personal Style' WHERE internal_name = 'theatricality' AND trait_group = 'Communication Tone'"
  );
  if (moved.rowCount && moved.rowCount > 0) console.log("  Moved theatricality → Personal Style");
  else console.log("  theatricality already in Personal Style or not found");

  // 2. Deactivate old comm tone traits
  for (const name of DEACTIVATE) {
    const r = await pool.query(
      "UPDATE trait_definitions SET is_active = FALSE WHERE internal_name = $1 AND is_active = TRUE",
      [name]
    );
    if (r.rowCount && r.rowCount > 0) console.log(`  Deactivated: ${name}`);
    else console.log(`  Skipped (already inactive or missing): ${name}`);
  }

  // 3. Get current max sort_order
  const maxOrder = (await pool.query("SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM trait_definitions")).rows[0].m;

  // 4. Add new traits
  let inserted = 0;
  for (let i = 0; i < NEW_TRAITS.length; i++) {
    const t = NEW_TRAITS[i];
    const exists = await pool.query(
      "SELECT id FROM trait_definitions WHERE internal_name = $1",
      [t.internal_name]
    );
    if (exists.rows.length > 0) {
      console.log(`  Skipped (already exists): ${t.internal_name}`);
      continue;
    }

    await pool.query(
      `INSERT INTO trait_definitions
         (internal_name, display_name_he, display_name_en, ai_description,
          required_confidence, weight, sensitivity, calc_type, trait_group,
          is_active, sort_order)
       VALUES ($1, $2, $3, $4, 0.5, 1, 'normal', 'normal', 'Communication Tone', TRUE, $5)`,
      [t.internal_name, t.display_name_he, t.display_name_en, t.ai_description, maxOrder + i + 1]
    );
    inserted++;
    console.log(`  Added: ${t.internal_name}`);
  }

  console.log(`\nDone. ${inserted} inserted, ${DEACTIVATE.length} deactivated, theatricality moved.`);

  // Show final state
  const commTone = await pool.query(
    "SELECT internal_name, is_active FROM trait_definitions WHERE trait_group = 'Communication Tone' ORDER BY sort_order"
  );
  console.log("\nCommunication Tone traits:");
  for (const r of commTone.rows) console.log(`  ${r.is_active ? "ACTIVE" : "      "} ${r.internal_name}`);

  const style = await pool.query(
    "SELECT internal_name, is_active FROM trait_definitions WHERE trait_group = 'Personal Style' AND internal_name = 'theatricality'"
  );
  console.log("\nTheatricality in Personal Style:", style.rows.length > 0 ? "YES" : "NO");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
