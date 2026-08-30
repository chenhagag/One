/**
 * Seed script for knowledge_chunks table.
 * Inserts system knowledge about One + test user chunks.
 *
 * Usage:
 *   npx ts-node src/seedKnowledge.ts
 *   npx ts-node src/seedKnowledge.ts --user 123   # also seed user chunks for user 123
 *
 * Each chunk is upserted by (scope, user_id, title) — safe to re-run.
 * Content here is PLACEHOLDER — will be rewritten with final copy.
 */

import "dotenv/config";
import { upsertChunk } from "./rag";
import { getPool } from "./db.pg";
import { createSchemaPg } from "./schema.pg";

// ── System Knowledge Chunks (One product knowledge) ────────────────

const SYSTEM_CHUNKS = [
  {
    category: "analysis",
    title: "trait_inference",
    sourceType: "product_rule",
    content: `One לא מסתמכת על הצהרות עצמיות של משתמשים. תכונות אישיות כמו רגישות, שאפתנות, חכמה וסגנון חשיבה מוסקות מתוך ניתוח השיחות, דפוסי החשיבה, התגובות הרגשיות והבחירות של המשתמש לאורך תהליך ההיכרות. כשאנחנו אומרים שמישהו "חכם" או "רגיש" — זה לא מבוסס על מה שהוא אמר על עצמו, אלא על מה שהמערכת הסיקה מהשיחה עצמה. אין לחשוף למשתמש תשובות ספציפיות של מועמד אחר.`,
  },
  {
    category: "analysis",
    title: "match_meaning",
    sourceType: "product_rule",
    content: `כשנמצאת התאמה ב-One, זה אומר שכבר נבדקו עשרות תכונות אישיות, ערכיות, קוגניטיביות ורגשיות — וכולן עברו סף התאמה. ההתאמה לא מבוססת על פרמטר אחד או שניים, אלא על הצלבה רחבה של ממדים. עם זאת, אף התאמה אינה מושלמת — תמיד יש ממדים שבהם ההתאמה חזקה יותר וכאלה שפחות. ההתאמה מייצגת את השילוב הטוב ביותר שנמצא במאגר.`,
  },
  {
    category: "photos",
    title: "known_person",
    sourceType: "product_rule",
    content: `בשלב אישור התמונות, כל צד יכול לסמן "אני מכיר/ה את האדם הזה". כך One נמנעת משידוך עם אקסים, קרובי משפחה או מכרים. אם אחד הצדדים מסמן היכרות — ההתאמה נפסלת אוטומטית.`,
  },
  {
    category: "photos",
    title: "photo_approval_flow",
    sourceType: "product_rule",
    content: `לפני שמציעים התאמה סופית, שני הצדדים מקבלים את התמונות של הצד השני ומתבקשים לאשר. רק אם שני הצדדים מאשרים — ההתאמה ממשיכה הלאה. זה מבטיח שיש בסיס למשיכה הדדית לפני שמציגים כרטיס התאמה. אם משתמש אישר תמונה אבל לא קיבל התאמה — זה לא בהכרח אומר שהצד השני דחה. יש סיבות נוספות: המשתמש השני לא פעיל, לא ראה את ההודעה, או שהתאמה אחרת קיבלה עדיפות.`,
  },
  {
    category: "matching",
    title: "one_match_philosophy",
    sourceType: "product_rule",
    content: `One מציגה התאמה אחת בלבד — האדם בעל אחוז ההלימה הגבוה ביותר. הפילוסופיה: איכות על פני כמות. עדיף לחכות להתאמה מדויקת אחת מאשר לקבל עשר התאמות בינוניות. זה שונה מהותית מאפליקציות היכרויות רגילות שמציגות עשרות פרופילים. ב-One, כל התאמה עוברת תהליך קפדני לפני שמוצגת.`,
  },
  {
    category: "matching",
    title: "matching_dimensions",
    sourceType: "product_rule",
    content: `ההתאמה ב-One מבוססת על הצלבה של ממדים רבים: פרופיל קוגניטיבי (סגנון חשיבה ועיבוד מידע), סגנון תרבותי (רקע, ערכים חברתיים, הקשר סוציו-תרבותי), סגנון רגשי (תקשורת, עיבוד רגשי, ניהול קונפליקטים), ערכים לפי תיאוריית שוורץ, תכונות אישיות (Big Five), סגנון היקשרות, וגם טעם אישי והעדפות שהמשתמש שיתף. ההתאמה מבוססת על שילוב חכם בין דמיון (כמו ערכי ליבה קרובים) לבין השלמה (תכונות אופי שמאזנות).`,
  },
  {
    category: "process",
    title: "cancel_match",
    sourceType: "product_rule",
    content: `אם התאמה לא עבדה, המשתמש יכול לבטל אותה. אחרי ביטול, המשתמש חוזר למאגר ההתאמות והמערכת מחפשת התאמה חדשה. הפידבק על למה ההתאמה לא עבדה עוזר למערכת לדייק את ההתאמה הבאה. ביטול הוא חלק טבעי מהתהליך — לא כל התאמה מצליחה, וזה בסדר.`,
  },
  {
    category: "process",
    title: "waiting_for_match",
    sourceType: "product_rule",
    content: `ההמתנה להתאמה יכולה לקחת זמן. הסיבות: One עדיין בשלב בנייה וצבירת קהילה, ולכן המאגר גדל בהדרגה. בנוסף, One לא מתפשרת על איכות — אם אין התאמה מספיק טובה, המערכת ממשיכה לחפש במקום להציע משהו בינוני. ככל שהמאגר גדל, הסיכוי לזמן המתנה קצר יותר עולה. המערכת פועלת ברקע ומודיעה כשנמצאת התאמה איכותית.`,
  },
  {
    category: "models",
    title: "big_five_explained",
    sourceType: "psychological_model",
    content: `מודל Big Five (חמשת הגדולים) הוא המודל הנחקר ביותר בפסיכולוגיית האישיות. הוא כולל חמישה ממדים: פתיחות לחוויה (סקרנות, יצירתיות, נכונות לחדש), מצפוניות (מסודרות, אמינות, תכנון), הסכמיות (אמפתיה, שיתוף פעולה, אכפתיות), מוחצנות (חברותיות, אנרגיה, חיפוש גירוי), ויציבות רגשית (שלווה לעומת תגובתיות רגשית). One מנתחת את המשתמש בכל חמשת הממדים ומשתמשת בהם כחלק מההתאמה.`,
  },
  {
    category: "models",
    title: "schwartz_values",
    sourceType: "psychological_model",
    content: `תיאוריית הערכים של שוורץ מגדירה עשרה ערכי ליבה אוניברסליים שמנחים התנהגות ובחירות: עצמאות (חופש מחשבה ופעולה), גירוי (חידוש והתרגשות), הנאה (הנאה וסיפוק חושי), הישגיות (הצלחה אישית), כוח (שליטה ויוקרה), ביטחון (יציבות ובטחון), קונפורמיות (ציות לנורמות), מסורת (כבוד למנהגים), נדיבות (טובת הקרובים), אוניברסליזם (רווחת הכלל). הלימה בערכים מרכזיים בין בני זוג מנבאת יציבות זוגית לטווח ארוך.`,
  },
];

// ── User Test Chunks (for staging QA) ──────────────────────────────

async function seedUserChunks(userId: number) {
  // Fetch summary and insights from DB
  const pool = getPool();

  const [summaryRow, userRow] = await Promise.all([
    pool.query<{ summary_json: any }>(
      "SELECT summary_json FROM user_chat_summaries WHERE user_id = $1",
      [userId]
    ).then(r => r.rows[0]),
    pool.query<{ personal_insights_full: string | null }>(
      "SELECT personal_insights_full FROM users WHERE id = $1",
      [userId]
    ).then(r => r.rows[0]),
  ]);

  let count = 0;

  if (summaryRow?.summary_json) {
    const s = summaryRow.summary_json;
    // Create focused chunks from summary fields
    const summaryParts: { title: string; content: string; category: string }[] = [];

    if (s.relationships) {
      summaryParts.push({
        title: "user_relationships",
        category: "relationships",
        content: s.relationships,
      });
    }
    if (s.values) {
      summaryParts.push({
        title: "user_values",
        category: "values",
        content: s.values,
      });
    }
    if (s.taste_and_style) {
      summaryParts.push({
        title: "user_taste_style",
        category: "taste",
        content: s.taste_and_style,
      });
    }
    // Combined general context
    const generalParts = [s.general_info, s.occupation, s.social_style, s.background_culture]
      .filter(Boolean)
      .join("\n");
    if (generalParts) {
      summaryParts.push({
        title: "user_general_profile",
        category: "profile",
        content: generalParts,
      });
    }
    if (s.intellectual_world) {
      summaryParts.push({
        title: "user_intellectual",
        category: "personality",
        content: s.intellectual_world,
      });
    }

    for (const part of summaryParts) {
      await upsertChunk({
        scope: "user",
        userId,
        category: part.category,
        title: part.title,
        content: part.content,
        sourceType: "user_summary",
      });
      count++;
    }
  }

  if (userRow?.personal_insights_full) {
    // Split insights into focused chunks if they're long
    const insights = userRow.personal_insights_full;
    if (insights.length > 500) {
      // Split by double newline (paragraph breaks)
      const paragraphs = insights.split(/\n\n+/).filter(p => p.trim().length > 50);
      for (let i = 0; i < paragraphs.length && i < 5; i++) {
        await upsertChunk({
          scope: "user",
          userId,
          category: "insights",
          title: `user_insight_${i + 1}`,
          content: paragraphs[i].trim(),
          sourceType: "one_inference",
        });
        count++;
      }
    } else {
      await upsertChunk({
        scope: "user",
        userId,
        category: "insights",
        title: "user_insights",
        content: insights,
        sourceType: "one_inference",
      });
      count++;
    }
  }

  console.log(`[seed] Created ${count} user chunks for user ${userId}`);
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const pool = getPool();
  await createSchemaPg(pool);

  console.log("[seed] Seeding system knowledge chunks...");

  for (const chunk of SYSTEM_CHUNKS) {
    const id = await upsertChunk({
      scope: "system",
      category: chunk.category,
      title: chunk.title,
      content: chunk.content,
      sourceType: chunk.sourceType,
    });
    console.log(`  ✓ ${chunk.title} (id: ${id})`);
  }

  console.log(`[seed] ${SYSTEM_CHUNKS.length} system chunks seeded.`);

  // Optional: seed user chunks
  const userIdArg = process.argv.indexOf("--user");
  if (userIdArg !== -1 && process.argv[userIdArg + 1]) {
    const userId = parseInt(process.argv[userIdArg + 1]);
    if (!isNaN(userId)) {
      console.log(`\n[seed] Seeding user chunks for user ${userId}...`);
      await seedUserChunks(userId);
    }
  }

  console.log("\n[seed] Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
