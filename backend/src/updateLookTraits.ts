/**
 * One-time script: update look_trait_definitions for new manual visual traits.
 *
 * - Deactivates: look_style, body_type, skin_color, grooming_level, gender_expression
 * - Keeps: initial_attraction_signal, height, hair_color, eye_color, hair_type
 * - Adds (if not exist): appeal, warmth_visual, femininity_masculinity, glamour,
 *   naturalness, fitness_aesthetic, style_polish, skin_tone_range
 *
 * Usage: npx tsx src/updateLookTraits.ts
 */

import "dotenv/config";
import { getPool } from "./db.pg";

const DEACTIVATE = [
  "look_style", "body_type", "skin_color", "grooming_level", "gender_expression",
];

const NEW_TRAITS = [
  { internal_name: "appeal", display_name_he: "משיכה", display_name_en: "Appeal", weight: 80 },
  { internal_name: "warmth_visual", display_name_he: "חמימות", display_name_en: "Warmth", weight: 50 },
  { internal_name: "femininity_masculinity", display_name_he: "נשיות / גבריות", display_name_en: "Femininity / Masculinity", weight: 60 },
  { internal_name: "glamour", display_name_he: "גלאמור", display_name_en: "Glamour", weight: 40 },
  { internal_name: "naturalness", display_name_he: "טבעיות", display_name_en: "Naturalness", weight: 40 },
  { internal_name: "fitness_aesthetic", display_name_he: "כושר / ספורטיביות", display_name_en: "Fitness Aesthetic", weight: 50 },
  { internal_name: "style_polish", display_name_he: "סטייל / טיפוח", display_name_en: "Style Polish", weight: 40 },
  { internal_name: "skin_tone_range", display_name_he: "גוון עור", display_name_en: "Skin Tone Range", weight: 10 },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Add it to backend/.env");
    process.exit(1);
  }

  const pool = getPool();

  // Deactivate old traits
  for (const name of DEACTIVATE) {
    const r = await pool.query(
      "UPDATE look_trait_definitions SET is_active = FALSE WHERE internal_name = $1 AND is_active = TRUE",
      [name]
    );
    if (r.rowCount && r.rowCount > 0) console.log(`  Deactivated: ${name}`);
    else console.log(`  Skipped (already inactive or missing): ${name}`);
  }

  // Get current max sort_order
  const maxOrder = (await pool.query("SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM look_trait_definitions")).rows[0].m;

  // Add new traits
  let inserted = 0;
  for (let i = 0; i < NEW_TRAITS.length; i++) {
    const t = NEW_TRAITS[i];
    const exists = await pool.query(
      "SELECT id FROM look_trait_definitions WHERE internal_name = $1",
      [t.internal_name]
    );
    if (exists.rows.length > 0) {
      console.log(`  Skipped (already exists): ${t.internal_name}`);
      continue;
    }

    await pool.query(
      `INSERT INTO look_trait_definitions
         (internal_name, display_name_he, display_name_en, source, weight,
          sensitivity, is_active, sort_order)
       VALUES ($1, $2, $3, 'manual', $4, 'normal', TRUE, $5)`,
      [t.internal_name, t.display_name_he, t.display_name_en, t.weight, maxOrder + i + 1]
    );
    inserted++;
    console.log(`  Added: ${t.internal_name}`);
  }

  console.log(`\nDone. ${inserted} inserted, ${DEACTIVATE.length} deactivated.`);

  // Show final state
  const all = await pool.query(
    "SELECT internal_name, is_active, sort_order FROM look_trait_definitions ORDER BY sort_order"
  );
  console.log("\nCurrent look traits:");
  for (const r of all.rows) {
    console.log(`  ${r.is_active ? "ACTIVE" : "      "} ${r.internal_name} (#${r.sort_order})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
