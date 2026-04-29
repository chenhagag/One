/**
 * One-time script: add MBTI trait definitions to the database.
 * Does NOT delete existing traits or user_traits — only inserts new ones.
 *
 * Usage: npx tsx src/addMbtiTraits.ts
 */

import "dotenv/config";
import { getPool } from "./db.pg";

const MBTI_TRAITS = [
  { internal_name: "sensing", display_name_he: "חושים", display_name_en: "Sensing", ai_description: "Sensing (S): התמקדות בעובדות, פרטים ומציאות קונקרטית. מעדיף מידע ישיר מהחושים, פרקטי ומעשי." },
  { internal_name: "intuition", display_name_he: "אינטואיציה", display_name_en: "Intuition", ai_description: "Intuition (N): התמקדות באפשרויות, דפוסים ורעיונות מופשטים. מעדיף לראות את התמונה הגדולה ולחשוב על העתיד." },
  { internal_name: "thinking", display_name_he: "חשיבה", display_name_en: "Thinking", ai_description: "Thinking (T): קבלת החלטות על בסיס לוגיקה, ראיות אובייקטיביות ועקרונות. מעדיף ניתוח רציונלי." },
  { internal_name: "feeling", display_name_he: "רגשות", display_name_en: "Feeling", ai_description: "Feeling (F): קבלת החלטות תוך התחשבות ברגשות, ערכים והשפעה על אחרים. מעדיף הרמוניה ואמפתיה." },
  { internal_name: "judging", display_name_he: "שיפוט", display_name_en: "Judging", ai_description: "Judging (J): מעדיף מבנה, תכנון וסגירת עניינים. אוהב סדר, שגרה ולוחות זמנים ברורים." },
  { internal_name: "perceiving", display_name_he: "תפיסה", display_name_en: "Perceiving", ai_description: "Perceiving (P): מעדיף גמישות, ספונטניות והשארת אפשרויות פתוחות. אוהב להישאר פתוח ולהתאים תוך כדי תנועה." },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Add it to backend/.env");
    process.exit(1);
  }

  const pool = getPool();

  // Get current max sort_order
  const maxOrder = (await pool.query("SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM trait_definitions")).rows[0].m;

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < MBTI_TRAITS.length; i++) {
    const t = MBTI_TRAITS[i];

    // Skip if already exists
    const exists = await pool.query(
      "SELECT id FROM trait_definitions WHERE internal_name = $1",
      [t.internal_name]
    );
    if (exists.rows.length > 0) {
      console.log(`  Skipped ${t.internal_name} (already exists)`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO trait_definitions
         (internal_name, display_name_he, display_name_en, ai_description,
          required_confidence, weight, sensitivity, calc_type, trait_group,
          is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)`,
      [
        t.internal_name, t.display_name_he, t.display_name_en,
        t.ai_description,
        0.5,      // required_confidence
        1,        // weight
        "normal", // sensitivity
        "normal", // calc_type
        "MBTI",   // trait_group
        maxOrder + i + 1,
      ]
    );
    inserted++;
    console.log(`  Added ${t.internal_name}`);
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
