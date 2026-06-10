/**
 * Add Enneagram, Attachment Style, and Gender Conformity traits.
 *
 * Usage: cd backend && npx tsx src/seedAdditionalTraits.ts
 *
 * NON-DESTRUCTIVE: only inserts new traits, does NOT delete anything.
 * Skips traits that already exist (by internal_name).
 */

import "dotenv/config";
import { getPool } from "./db.pg";

interface NewTrait {
  internal_name: string;
  display_name_he: string;
  display_name_en: string;
  ai_description: string | null;
  trait_group: string;
  sensitivity: string;
  calc_type: string;
}

const ADDITIONAL_TRAITS: NewTrait[] = [
  // ── Enneagram (9) ──
  { internal_name: "enneagram_type_1", display_name_he: "אניאגרם טיפוס 1 — הרפורמיסט", display_name_en: "Enneagram Type 1 — The Reformer", ai_description: "עקרוני, אידיאליסטי, שואף לשלמות. בעל חוש מוסרי חזק, מסודר, אחראי. עשוי להיות ביקורתי כלפי עצמו ואחרים.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_2", display_name_he: "אניאגרם טיפוס 2 — העוזר", display_name_en: "Enneagram Type 2 — The Helper", ai_description: "אכפתי, חם, נדיב. מתמקד בצרכים של אחרים, רוצה להרגיש נחוץ. עלול להזניח את צרכי עצמו.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_3", display_name_he: "אניאגרם טיפוס 3 — ההישגיסט", display_name_en: "Enneagram Type 3 — The Achiever", ai_description: "שאפתני, יעיל, מוכוון הישגים ותדמית. מונע מהצלחה והכרה. עלול להזדהות יתר עם הישגיו.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_4", display_name_he: "אניאגרם טיפוס 4 — האינדיבידואליסט", display_name_en: "Enneagram Type 4 — The Individualist", ai_description: "רגיש, אינטרוספקטיבי, ייחודי. מחפש משמעות וזהות אותנטית. עלול לחוש חסר או שונה מאחרים.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_5", display_name_he: "אניאגרם טיפוס 5 — החוקר", display_name_en: "Enneagram Type 5 — The Investigator", ai_description: "סקרן, אנליטי, עצמאי. צורך ידע ומבקש להבין. עלול להתרחק רגשית ולשמור על גבולות נוקשים.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_6", display_name_he: "אניאגרם טיפוס 6 — הנאמן", display_name_en: "Enneagram Type 6 — The Loyalist", ai_description: "אחראי, מחויב, ערני. מחפש ביטחון ותמיכה. עלול לחוש חרדה ולהתלבט הרבה.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_7", display_name_he: "אניאגרם טיפוס 7 — ההרפתקן", display_name_en: "Enneagram Type 7 — The Enthusiast", ai_description: "אופטימי, ספונטני, תאב חוויות. מחפש הנאה וגיוון. עלול להימנע מכאב ומהתמודדות עם רגשות קשים.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_8", display_name_he: "אניאגרם טיפוס 8 — הבוס", display_name_en: "Enneagram Type 8 — The Challenger", ai_description: "דומיננטי, ישיר, בטוח בעצמו. מגן על חלשים, לא סובל חולשה. עלול להיות שתלטני או תוקפני.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "enneagram_type_9", display_name_he: "אניאגרם טיפוס 9 — המשכין שלום", display_name_en: "Enneagram Type 9 — The Peacemaker", ai_description: "שקט, מפשר, מקבל. מחפש הרמוניה ונמנע מעימותים. עלול להתעלם מצרכי עצמו ולהיות פסיבי.", trait_group: "Enneagram", sensitivity: "normal", calc_type: "normal" },

  // ── Attachment Style (3) ──
  { internal_name: "attachment_secure", display_name_he: "התקשרות בטוחה", display_name_en: "Secure Attachment", ai_description: "עד כמה המשתמש מפגין דפוס התקשרות בטוח — נוח עם קרבה רגשית, סומך על אחרים, מסוגל לתת ולקבל תמיכה, לא חושש מנטישה ולא מעימות.", trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "attachment_anxious", display_name_he: "התקשרות חרדתית", display_name_en: "Anxious Attachment", ai_description: "עד כמה המשתמש מפגין דפוס התקשרות חרדתי — צורך גבוה בוודאות רגשית, חשש מנטישה או דחייה, נטייה להיצמד או לבדוק את הזולת, רגישות יתר לסימנים של ריחוק.", trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "attachment_avoidant", display_name_he: "התקשרות נמנעת", display_name_en: "Avoidant Attachment", ai_description: "עד כמה המשתמש מפגין דפוס התקשרות נמנע — אי-נוחות מקרבה רגשית, צורך בעצמאות ומרחב, נטייה לברוח כשהיחסים מתעמקים, קושי בביטוי רגשי.", trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },

  // ── Gender Conformity (1) ──
  { internal_name: "gender_conformity", display_name_he: "התאמה מגדרית קלאסית", display_name_en: "Gender Conformity", ai_description: "עד כמה המשתמש/ת מציג/ה סגנון שתואם מגדר קלאסי. אצל גברים — עד כמה מדובר בגבר קלאסי (ישיר, דומיננטי, מעשי, לא רגשני). אצל נשים — עד כמה מדובר באישה קלאסית (רכה, אכפתית, רגשית, מזינה). ציון 50 = מגדרי מאוזן. ציון גבוה = תואם מגדר קלאסי. ציון נמוך = חורג ממגדר קלאסי. זהו מדד סטטיסטי בלבד, ללא שיפוט ערכי.", trait_group: "Personal Style", sensitivity: "sensitive", calc_type: "normal" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Add it to backend/.env");
    process.exit(1);
  }

  const pool = getPool();
  console.log("\n🔄 Adding new trait definitions (non-destructive)\n");

  // Get max sort_order
  const maxOrder = (await pool.query("SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM trait_definitions")).rows[0].m;

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < ADDITIONAL_TRAITS.length; i++) {
    const t = ADDITIONAL_TRAITS[i];

    // Check if already exists
    const exists = await pool.query(
      "SELECT 1 FROM trait_definitions WHERE internal_name = $1",
      [t.internal_name]
    );

    if (exists.rows.length > 0) {
      console.log(`  ⏭ ${t.internal_name} already exists — skipping`);
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
        0.5, 1, t.sensitivity, t.calc_type, t.trait_group,
        maxOrder + i + 1,
      ]
    );
    console.log(`  ✓ ${t.internal_name} (${t.trait_group})`);
    inserted++;
  }

  // Verify
  const groups = await pool.query(
    "SELECT trait_group, COUNT(*)::int AS c FROM trait_definitions GROUP BY trait_group ORDER BY MIN(sort_order)"
  );

  console.log(`\n  Inserted: ${inserted}, Skipped: ${skipped}`);
  console.log("\n  Trait groups:");
  for (const g of groups.rows) {
    console.log(`    ${g.trait_group}: ${g.c}`);
  }

  console.log("\n  → Reanalyze users to populate new traits");

  await pool.end();
  console.log("\n✅ Done.\n");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
