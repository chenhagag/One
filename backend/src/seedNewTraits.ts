/**
 * Migrate internal trait definitions to the new Excel structure.
 *
 * Usage: cd backend && npm run seed-new-traits
 *
 * What it does:
 * 1. Deletes user_traits (old scores referencing old trait IDs)
 * 2. Deletes old trait_definitions
 * 3. Inserts 62 new traits from the new Excel "Internal Traits" tab
 *
 * What it does NOT do:
 * - Does NOT delete users, profiles, conversation_messages, or any user data
 * - Does NOT touch look_trait_definitions (external traits unchanged)
 * - Does NOT touch analysis_runs (kept for history)
 *
 * After running, use "Reanalyze" in admin per-user to regenerate
 * user_traits from their existing conversation history.
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

const NEW_TRAITS: NewTrait[] = [
  // ── Cognitive Profile (12) ──
  { internal_name: "analytical_thinking", display_name_he: "חשיבה אנליטית", display_name_en: "Analytical Thinking", ai_description: "Analytical Thinking should be based on evidence of structured reasoning: breaking down situations into components, explaining cause and effect, identifying mechanisms or underlying structure. Do NOT base this trait on: general clarity, emotional understanding, social reasoning, politeness or balanced answers.", trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "abstract_thinking", display_name_he: "חשיבה מופשטת", display_name_en: "Abstract Thinking", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "cognitive_flexibility", display_name_he: "גמישות מחשבתית", display_name_en: "Cognitive Flexibility", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "verbal_reasoning", display_name_he: "הסקה מילולית", display_name_en: "Verbal Reasoning", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "depth_of_thought", display_name_he: "עומק מחשבתי", display_name_en: "Depth of Thought", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "intellectual_openness", display_name_he: "פתיחות אינטלקטואלית", display_name_en: "Intellectual Openness", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "conceptual_clarity", display_name_he: "בהירות מושגית", display_name_en: "Conceptual Clarity", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "pattern_recognition", display_name_he: "זיהוי דפוסים", display_name_en: "Pattern Recognition", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "intellectualism", display_name_he: "אינטלקטואליזם", display_name_en: "Intellectualism", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "verbal_expression_ability", display_name_he: "יכולת ביטוי מילולי", display_name_en: "Verbal Expression Ability", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "communication_clarity", display_name_he: "בהירות תקשורתית", display_name_en: "Communication Clarity", ai_description: null, trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "career_prestige", display_name_he: "יוקרה תעסוקתית", display_name_en: "Career Prestige", ai_description: "רמת ההשכלה והמסלול המקצועי של המשתמש — כולל סוג העיסוק, רמת מקצועיות והישגים. ציון גבוה = השכלה/מקצוע ברמה גבוהה יותר. ציון נמוך = פחות השכלה פורמלית או מקצוע פחות דורש הכשרה. לדוגמה - רופאים, מהנדסי תוכנה, טייסים → ציונים גבוהים. ירקן / עובד מאפייה → ציון נמוך. מקצועות הדורשים השכלה גבוהה או הכשרה מקצועית משמעותית (הייטק, רפואה, הנדסה) → ציון גבוה. מקצועות ללא השכלה פורמלית → ציון נמוך. אל תחשוש לתת ציון נמוך במידת הצורך. יש להגדיר weight_for_match אם המשתמש מביע חשיבות למקצוע או להכשרה התעסוקתית של הצד השני.", trait_group: "Cognitive Profile", sensitivity: "normal", calc_type: "normal" },

  // ── Communication Tone (8) ──
  { internal_name: "communication_softness", display_name_he: "רכות תקשורתית", display_name_en: "Communication Softness", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "harsh_talk", display_name_he: "קשיחות", display_name_en: "Harsh Talk", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "directness", display_name_he: "ישירות", display_name_en: "Directness", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "tonal_balance", display_name_he: "איזון טונלי", display_name_en: "Tonal Balance", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "authenticity", display_name_he: "אותנטיות", display_name_en: "Authenticity", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "dramatic_intensity", display_name_he: "עוצמה דרמטית", display_name_en: "Dramatic Intensity", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "theatricality", display_name_he: "תיאטרליות", display_name_en: "Theatricality", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "energy_level", display_name_he: "רמת אנרגיה", display_name_en: "Energy Level", ai_description: null, trait_group: "Communication Tone", sensitivity: "normal", calc_type: "normal" },

  // ── Big Five (5) ──
  { internal_name: "extraversion", display_name_he: "מוחצנות", display_name_en: "Extraversion", ai_description: null, trait_group: "Big Five", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "conscientiousness", display_name_he: "מצפוניות", display_name_en: "Conscientiousness", ai_description: null, trait_group: "Big Five", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "agreeableness", display_name_he: "נעימות", display_name_en: "Agreeableness", ai_description: null, trait_group: "Big Five", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "neuroticism", display_name_he: "נוירוטיות", display_name_en: "Neuroticism", ai_description: null, trait_group: "Big Five", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "openness_to_experience", display_name_he: "פתיחות לחוויות", display_name_en: "Openness to Experience", ai_description: null, trait_group: "Big Five", sensitivity: "normal", calc_type: "normal" },

  // ── Schwartz Values (11) ──
  { internal_name: "hedonism", display_name_he: "נהנתנות", display_name_en: "Hedonism", ai_description: "הנאה או סיפוק החושים.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "achievement", display_name_he: "הישגיות", display_name_en: "Achievement", ai_description: "הצלחה אישית באמצעות מומחיות לפי סטנדרטים חברתיים.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "power", display_name_he: "כוח", display_name_en: "Power", ai_description: "מעמד ומוניטין חברתי, שליטה או שלטון על אנשים.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "self_direction", display_name_he: "עצמאות", display_name_en: "Self-direction", ai_description: "מחשבה ופעולה עצמאית: בחירה, יצירה וחקירה.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "stimulation", display_name_he: "גירוי", display_name_en: "Stimulation", ai_description: "התרגשות, חידוש ואתגר בחיים.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "security", display_name_he: "ביטחון", display_name_en: "Security", ai_description: "בטיחות, הרמוניה ויציבות בחברה, ביחסים ובעצמי.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "conformity", display_name_he: "ציות", display_name_en: "Conformity", ai_description: "שליטה במעשים, בנטיות ובדחפים אשר עלולים לפגוע באחרים ולהפר ציפיות ונורמות חברתיות.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "tradition", display_name_he: "מסורת", display_name_en: "Tradition", ai_description: "כבוד, התחייבות וקבלת המנהגים והרעיונות של החברה.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "benevolence", display_name_he: "נדיבות", display_name_en: "Benevolence", ai_description: "שימור והעצמת בריאותם של האנשים הקרובים אליך.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "universalism", display_name_he: "אוניברסליות", display_name_en: "Universalism", ai_description: "הבנה, הערכה, סבילה והגנה לבריאות כל האנשים והטבע.", trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "spirituality", display_name_he: "רוחניות", display_name_en: "Spirituality", ai_description: null, trait_group: "Schwartz Values", sensitivity: "normal", calc_type: "normal" },

  // ── Emotional Profile (6) ──
  { internal_name: "eq", display_name_he: "אינטליגנציה רגשית", display_name_en: "EQ", ai_description: null, trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "self_awareness", display_name_he: "מודעות עצמית", display_name_en: "Self Awareness", ai_description: "Self-awareness is indicated by the ability to recognize and articulate one's own weaknesses, emotional patterns, and internal conflicts. Users who openly describe their own flaws, reactivity, or emotional struggles should be scored higher. Do NOT assume that a user who presents only positive, balanced, or socially desirable responses has high self-awareness. Lack of negative self-reflection may indicate low self-awareness, impression management, or limited introspection.", trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "emotional_expressiveness", display_name_he: "אקספרסיביות רגשית", display_name_en: "Emotional Expressiveness", ai_description: "עד כמה המשתמש עסוק ברגשות ונוטה לשיח רגשי.", trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "positivity", display_name_he: "חיוביות", display_name_en: "Positivity", ai_description: null, trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "warmth", display_name_he: "חום", display_name_en: "Warmth", ai_description: null, trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "emotional_intensity", display_name_he: "עוצמה רגשית", display_name_en: "Emotional Intensity", ai_description: null, trait_group: "Emotional Profile", sensitivity: "normal", calc_type: "normal" },

  // ── Personal Style (12) ──
  { internal_name: "mainstreamness", display_name_he: "מיינסטרימיות", display_name_en: "Mainstreamness", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "oriental", display_name_he: "מזרחיות", display_name_en: "Oriental", ai_description: null, trait_group: "Personal Style", sensitivity: "sensitive", calc_type: "normal" },
  { internal_name: "broad_appeal", display_name_he: "נורמטיביות רחבה", display_name_en: "Broad Appeal", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "value_rigidity", display_name_he: "שמרנות ערכית", display_name_en: "Value Rigidity", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "family_of_origin_closeness", display_name_he: "קרבה למשפחת מוצא", display_name_en: "Family of Origin Closeness", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "childishness", display_name_he: "ילדותיות", display_name_en: "Childishness", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "humor", display_name_he: "הומור", display_name_en: "Humor", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "right_wing", display_name_he: "ימניות", display_name_en: "Right Wing", ai_description: null, trait_group: "Personal Style", sensitivity: "sensitive", calc_type: "normal" },
  { internal_name: "left_wing", display_name_he: "שמאלניות", display_name_en: "Left Wing", ai_description: null, trait_group: "Personal Style", sensitivity: "sensitive", calc_type: "normal" },
  { internal_name: "social_activism", display_name_he: "אקטיביזם חברתי", display_name_en: "Social Activism", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "party_orientation", display_name_he: "נטיית מסיבות", display_name_en: "Party Orientation", ai_description: null, trait_group: "Personal Style", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "religiosity", display_name_he: "דתיות", display_name_en: "Religiosity", ai_description: null, trait_group: "Personal Style", sensitivity: "sensitive", calc_type: "normal" },

  // ── General Info (8) ──
  { internal_name: "loves_animals", display_name_he: "אוהב בעלי חיים", display_name_en: "Loves Animals", ai_description: null, trait_group: "General Info", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "vegetarian", display_name_he: "צמחוני", display_name_en: "Vegetarian", ai_description: null, trait_group: "General Info", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "serious_relationship_intent", display_name_he: "כוונה לקשר רציני", display_name_en: "Serious Relationship Intent", ai_description: null, trait_group: "General Info", sensitivity: "normal", calc_type: "normal" },
  { internal_name: "appearance_sensitivity", display_name_he: "רגישות למראה", display_name_en: "Appearance Sensitivity", ai_description: "עד כמה המראה החיצוני של בן/בת זוג הוא גורם חשוב ומשמעותי עבור המשתמש.", trait_group: "General Info", sensitivity: "sensitive", calc_type: "normal" },
  { internal_name: "toxicity", display_name_he: "רעילות", display_name_en: "Toxicity", ai_description: "זיהוי רעילות (התנהגות מסוכנת). המטרה לזהות משתמשים שמבטאים רמות גבוהות של רעילות, תוקפנות או התנהגות שעלולה להיות בעייתית במערכת — לצורך ניטור ובקרה בלבד.", trait_group: "General Info", sensitivity: "sensitive", calc_type: "internal_use" },
  { internal_name: "trollness", display_name_he: "טרוליות", display_name_en: "Trollness", ai_description: "זיהוי טרוליות. לזהות האם המשתמש באמת מחפש שידוך ומשתף פעולה עם המערכת, או שמא הוא עונה בצורה לא כנה, ממציא, משחק עם המערכת או מטריל אותה.", trait_group: "General Info", sensitivity: "sensitive", calc_type: "internal_use" },
  { internal_name: "trans", display_name_he: "טרנס/א-מיני", display_name_en: "Trans", ai_description: "לזהות האם המשתמש הצהיר באופן מפורש על היותו טרנס/ית או א-מיני. רק הצהרה מפורשת → ציון גבוה.", trait_group: "General Info", sensitivity: "sensitive", calc_type: "special" },
  { internal_name: "special_info", display_name_he: "מידע מיוחד / דיל ברייקרס", display_name_en: "Special Info", ai_description: "זיהוי דיל ברייקרס פוטנציאליים. מאפיינים משמעותיים אצל המשתמש שעלולים להוות דיל ברייקר. רשימת אפשרויות: lives_with_parents, divorced, has_children, has_pets, dislikes_pets, childfree, smoker, polyamorous, open_relationship, arab, orthodox, high_income, low_income. אם זוהה מאפיין מהרשימה באופן ברור — להחזיר אותו. אם אין אינדיקציה — ריק.", trait_group: "General Info", sensitivity: "sensitive", calc_type: "text" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set. Add it to backend/.env");
    process.exit(1);
  }

  const pool = getPool();

  console.log("\n🔄 Migrating internal trait definitions (keeping all user data)\n");

  // 1. Count what exists
  const existingUsers = (await pool.query("SELECT COUNT(*)::int AS c FROM users")).rows[0].c;
  const existingMessages = (await pool.query("SELECT COUNT(*)::int AS c FROM conversation_messages")).rows[0].c;
  const existingProfiles = (await pool.query("SELECT COUNT(*)::int AS c FROM profiles")).rows[0].c;
  const existingUserTraits = (await pool.query("SELECT COUNT(*)::int AS c FROM user_traits")).rows[0].c;
  const existingDefs = (await pool.query("SELECT COUNT(*)::int AS c FROM trait_definitions")).rows[0].c;

  console.log("  Current state:");
  console.log(`    ${existingUsers} users (KEEPING)`);
  console.log(`    ${existingMessages} conversation messages (KEEPING)`);
  console.log(`    ${existingProfiles} profiles (KEEPING)`);
  console.log(`    ${existingUserTraits} user_traits (REMOVING — old trait IDs)`);
  console.log(`    ${existingDefs} trait_definitions (REPLACING)`);
  console.log("");

  // 2. Delete user_traits (references old trait IDs that are about to be deleted)
  const deletedUT = await pool.query("DELETE FROM user_traits");
  console.log(`  ✓ Deleted ${deletedUT.rowCount} user_traits`);

  // 3. Delete old trait_definitions
  const deletedTD = await pool.query("DELETE FROM trait_definitions");
  console.log(`  ✓ Deleted ${deletedTD.rowCount} old trait_definitions`);

  // 4. Reset sequence
  await pool.query("SELECT setval('trait_definitions_id_seq', 1, false)");

  // 5. Insert new traits
  let inserted = 0;
  for (let i = 0; i < NEW_TRAITS.length; i++) {
    const t = NEW_TRAITS[i];
    await pool.query(
      `INSERT INTO trait_definitions
         (internal_name, display_name_he, display_name_en, ai_description,
          required_confidence, weight, sensitivity, calc_type, trait_group,
          is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)`,
      [
        t.internal_name, t.display_name_he, t.display_name_en,
        t.ai_description,
        0.5, // required_confidence (DOUBLE PRECISION — ok)
        1,   // weight (INTEGER column — use 1 as temporary default)
        t.sensitivity, t.calc_type, t.trait_group,
        i + 1,
      ]
    );
    inserted++;
  }

  console.log(`  ✓ Inserted ${inserted} new trait_definitions`);

  // 6. Verify
  const finalCount = (await pool.query("SELECT COUNT(*)::int AS c FROM trait_definitions")).rows[0].c;
  const groups = await pool.query(
    "SELECT trait_group, COUNT(*)::int AS c FROM trait_definitions GROUP BY trait_group ORDER BY MIN(sort_order)"
  );

  console.log(`\n  Final state: ${finalCount} trait definitions`);
  for (const g of groups.rows) {
    console.log(`    ${g.trait_group}: ${g.c}`);
  }

  // 7. Show users that need reanalysis
  const usersWithChats = await pool.query(`
    SELECT DISTINCT u.id, u.first_name
    FROM users u
    JOIN conversation_messages cm ON cm.user_id = u.id AND cm.role = 'user'
    ORDER BY u.id
  `);

  if (usersWithChats.rows.length > 0) {
    console.log(`\n  Users ready for reanalysis (have conversation history):`);
    for (const u of usersWithChats.rows) {
      console.log(`    User ${u.id}: ${u.first_name}`);
    }
    console.log(`\n  → Use Admin panel "Reanalyze" button per user, or POST /api/admin/users/:id/reanalyze`);
  } else {
    console.log("\n  No users with conversation history found.");
  }

  await pool.end();
  console.log("\n✅ Trait migration complete. All user data preserved.\n");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
