/**
 * Generate personal insights for a user using GPT-4o.
 *
 * Extracted from the admin endpoint so it can be called by:
 * - The completion pipeline (automatic)
 * - The admin endpoint (manual)
 *
 * Idempotency:
 * - If insights exist with insights_pre_completion = false → skip (already final)
 * - If insights exist with insights_pre_completion = true → regenerate (replace early with final)
 * - If no insights → generate
 * - force = true → always regenerate
 */

import OpenAI from "openai";
import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { trackTokens } from "../tokenTracker";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface InsightsResult {
  summary_short: string;
  summary_full: string;
  skipped?: boolean;
  skipped_reason?: string;
}

export async function generateInsights(
  userId: number,
  options: { force?: boolean } = {}
): Promise<InsightsResult> {
  // ── Idempotency check ──────────────────────────────────────────
  const existing = await pgQueryOne<{
    personal_insights_full: string | null;
    insights_pre_completion: boolean | null;
  }>(
    "SELECT personal_insights_full, insights_pre_completion FROM users WHERE id = $1",
    [userId]
  );

  if (!options.force && existing?.personal_insights_full) {
    if (existing.insights_pre_completion === false) {
      return {
        summary_short: "",
        summary_full: "",
        skipped: true,
        skipped_reason: "final_insights_exist",
      };
    }
    // insights_pre_completion = true → regenerate with full data
    console.log(`[generateInsights] User ${userId}: replacing pre-completion insights with final`);
  }

  // ── Load user data ─────────────────────────────────────────────
  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user) throw new Error(`User ${userId} not found`);

  // ── Build transcript ───────────────────────────────────────────
  const allMessages = await pgQueryAll<any>(
    `SELECT role, content, guide, created_at FROM conversation_messages
     WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  if (!allMessages.length) throw new Error(`User ${userId} has no conversation data`);

  const channels: Record<string, string[]> = {};
  for (const msg of allMessages) {
    const ch = msg.guide || "unknown";
    if (!channels[ch]) channels[ch] = [];
    channels[ch].push(`${msg.role === "user" ? "משתמש/ת" : "מערכת"}: ${msg.content}`);
  }

  let fullTranscript = "";
  const channelLabels: Record<string, string> = {
    new_chat: "שיחה כללית",
    new_chat_cognitive: "שיחת חשיבה",
    new_chat_taste: "מבחן טעם",
    interviewer: "ראיון אישיות",
    psychologist: "שיחת עומק",
  };
  for (const [ch, msgs] of Object.entries(channels)) {
    fullTranscript += `\n=== ${channelLabels[ch] || ch} ===\n${msgs.join("\n")}\n`;
  }

  // ── Load traits ────────────────────────────────────────────────
  const traits = await pgQueryAll<any>(
    `SELECT td.internal_name, td.display_name_he, ut.score
     FROM user_traits ut JOIN trait_definitions td ON ut.trait_definition_id = td.id
     WHERE ut.user_id = $1 ORDER BY td.trait_group, td.internal_name`,
    [userId]
  );
  const traitsSummary = traits.map((t: any) => `${t.display_name_he || t.internal_name}: ${t.score}`).join(", ");

  // ── Build prompt ───────────────────────────────────────────────
  const isFemale = user.gender === "woman";
  const genderWord = isFemale ? "המשתמשת" : "המשתמש";
  const searchGender = user.looking_for_gender === "woman" ? "נשים" : user.looking_for_gender === "man" ? "גברים" : "בני זוג";
  const youWord = isFemale ? "את" : "אתה";
  const partnerType = user.looking_for_gender === "woman" ? "בת" : "בן";
  const readerWord = isFemale ? "הקוראת" : "הקורא";
  const thirdPerson = isFemale ? "היא" : "הוא";
  const selfWord = isFemale ? "בעצמה" : "בעצמו";
  const doWord = isFemale ? "עושה" : "עושה";
  const copesWord = isFemale ? "מתמודדת" : "מתמודד";
  const learnedWord = isFemale ? "למדת" : "למדת";
  const searchWord = isFemale ? "מחפשת" : "מחפש";
  const needWord = isFemale ? "צריכה" : "צריך";

  const systemPrompt = `אתה כותב תובנות אישיות עמוקות עבור מערכת התאמות זוגיות. אתה פונה ישירות אל ${readerWord} — תמיד בגוף שני.

## גוף שני בלבד
כתוב בגוף שני, בפנייה ישירה ל${genderWord}.
רוב המשפטים צריכים להתייחס ל"${youWord}", אבל מותר לגוון כדי שהעברית תהיה טבעית.
אל תכתוב פסקאות בגוף שלישי ואל תשתמש בשם ${isFemale ? "שלה" : "שלו"} כנושא המשפט.
- נכון: "${youWord} ${isFemale ? "נוטה" : "נוטה"} לחפש שליטה כשמשהו מאיים ${isFemale ? "עלייך" : "עליך"}"
- לא נכון: "${user.first_name} ${isFemale ? "נוטה" : "נוטה"} לחפש שליטה כשמשהו מאיים ${isFemale ? "עליה" : "עליו"}"
- לא נכון: "${thirdPerson} ${isFemale ? "נוטה" : "נוטה"} לחפש שליטה..."

## הגישה שלך — תובנות מבוססות, לא סיכום ולא מחמאות

אתה לא מסכם את השיחה, אבל אתה כן משתמש בפרטים מתוכה כעוגנים.
המטרה היא לכתוב תובנות ש${readerWord} ${isFemale ? "תרגיש" : "ירגיש"}: "וואו, באמת הבינו אותי".

אל תכתוב רשימת עובדות.
אל תכתוב מחמאות כלליות.
אל תכתוב אבחנות שיכולות להתאים כמעט לכל אדם.
אל תכתוב "זה חשוב", "זה נהדר", "נשמע ש..." — אלה ביטויים של שיחה, לא של ניתוח.

בכל פסקה עליך לעשות לפחות אחד מהדברים:
- לזהות דפוס חוזר
- להסביר מתח פנימי (ה"גם וגם" של האדם)
- לחבר בין פרט מהחיים לבין צורך זוגי
- להסביר למה העדפה זוגית מסוימת חשובה לאדם הזה
- להראות מה פחות מתאים ${isFemale ? "לה" : "לו"} ולמה

## שימוש נכון בפרטים מהשיחה

אל תחזור על תשובות ${genderWord} כמו שהן.
אל תכתוב רשימת עובדות, תחביבים או העדפות בלי פרשנות.
אל תשתמש בציטוטים ישירים, ואל תכתוב "אמרת ש..." או "${isFemale ? "כשנשאלת" : "כשנשאלת"}...".

כן השתמש בפרטים קונקרטיים מהשיחה כעוגנים לתובנה.
כל פרט שמופיע בפלט חייב להסביר משהו עמוק יותר:
- מה זה מלמד על הצורך הרגשי
- מה זה מלמד על דפוס זוגי
- מה זה מלמד על סוג ${partnerType} הזוג שיתאים
- מה זה מלמד על מה שפחות יתאים

אם אין לך מה להסיק מפרט מסוים — אל תזכיר אותו.

דוגמאות:
לא טוב: "${youWord} ${isFemale ? "אוהבת" : "אוהב"} לבשל, לטייל ולראות סרטים."
טוב: "הבישול אצלך הוא דרך לייצר קרבה וביתיות, ולכן קשר טוב עבורך כנראה ייבנה גם דרך פעולות יומיומיות של דאגה ולא רק דרך שיחות גדולות."

לא טוב: "${youWord} ${isFemale ? "מעדיפה" : "מעדיף"} בר על פני מסיבה."
טוב: "נראה ש${youWord} ${isFemale ? "אוהבת" : "אוהב"} חוויה חברתית שיש בה חיים ואווירה, אבל ${isFemale ? "פחות נמשכת" : "פחות נמשך"} לעומס חברתי שאין בו אינטימיות או שליטה על הקצב."

לא טוב: "${youWord} ${isFemale ? "מעדיפה" : "מעדיף"} לקחת זמן להירגע בריב."
טוב: "בקונפליקט ${youWord} ${needWord} רגע של ויסות לפני שיחה, ולכן ${partnerType} זוג ${isFemale ? "שתלחץ" : "שילחץ"} על פתרון מיידי ${isFemale ? "עלולה" : "עלול"} להציף אותך יותר מאשר לקרב."

## חפש מתחים פנימיים

אל תכתוב רק חוזקות. חפש את ה"גם וגם" של האדם:
- איפה יש פער בין מה ש${isFemale ? "רוצה" : "רוצה"} לבין איך ש${isFemale ? "מתנהלת" : "מתנהל"}
- רכות לצד גבולות
- פתיחות לצד קווים אדומים
- צורך בקרבה לצד צורך בספייס
- נתינה לצד עייפות מאנשים שלא טובים ${isFemale ? "לה" : "לו"}

הניתוח צריך להיות מכבד, אבל לא מחמיא בלבד.

## אל תנפח עומק

אם ${genderWord} ${isFemale ? "נתנה" : "נתן"} תשובות קצרות, פרקטיות או פשוטות — כבד את זה.
אל תהפוך כל העדפה פשוטה ל"מסע", "עומק", "אותנטיות" או "עולם פנימי עשיר".
לפעמים התובנה המדויקת היא שהאדם ${searchWord} קשר פשוט, נעים, יציב ולא מסובך — וזה בסדר גמור.
אל תשתמש בשפה מליצית ריקה ("מסע של גילוי", "חיים מלאי עניין ומשמעות", "${isFemale ? "שותפה אמיתית" : "שותף אמיתי"} לחיים") — תהיה קונקרטי.

## מבחן ספציפיות

לפני שאתה מחזיר את הפלט, בדוק שכל פסקה עומדת במבחן:
האם אפשר היה לכתוב את אותה פסקה גם לעוד 100 משתמשים?
אם כן — היא גנרית מדי. כתוב אותה מחדש עם פרט, מתח פנימי או דפוס ייחודי מהשיחה.
אם הפלט נשמע כמו טקסט שאפשר לתת לעוד ${isFemale ? "משתמשת" : "משתמש"} — הוא לא מספיק טוב.

## מידע רגיש

אם ${genderWord} ${isFemale ? "מביעה" : "מביע"} העדפות סביב גוף, זהות מגדרית, מוצא, משקל, דת או מאפיינים רגישים:
- אל תציין פרטים אינטימיים או מיניים גם אם שותפו בשיחה.
- אל תנסח בצורה פוגענית או שיפוטית.
- אפשר לנסח ברמה עדינה וכללית אם זה חיוני להתאמה, למשל: "חשובה לך התאמה בזהות, במשיכה ובתחושת טבעיות זוגית" ולא פירוט פוגעני.

## התאמה למי שמחפשים
- בדוק בפרטים את שדה "מחפש/ת" — זה מגדר בן/בת הזוג שמחפשים.
- כשכותבים על בן/בת הזוג המתאים — התאם מגדרית: "בן זוג" / "בת זוג", "גבר" / "אישה", "הוא" / "היא".
- אל תניח הנחות על מגדר בן/בת הזוג — תמיד תסתמך על מה שכתוב בפרטים.

## שימוש בציוני התכונות
ציוני התכונות (0-100) מספקים תמונה כמותית של ${genderWord}. השתמש בהם כדי:
- לחזק תובנות שעולות מהשיחה (ציון גבוה/נמוך שמאשש דפוס)
- לזהות פערים מעניינים (למשל: ציון גבוה בפתיחות אבל התנהגות שמרנית בזוגיות)
- אל תציין ציונים מספריים בפלט. השתמש בהם כרקע לניתוח שלך.

## הטון
- עברית, גוף שני (${youWord}), מותאם מגדרית
- מקצועי-חם — כמו ${isFemale ? "חברה תובנתית" : "חבר תובנתי"}, לא כמו דוח קליני
- כנה בלי להיות חד. מדויק בלי להיות שיפוטי
- ${readerWord} ${isFemale ? "צריכה" : "צריך"} להרגיש שבאמת ${isFemale ? "רואים אותה" : "רואים אותו"}
- אל תכתוב "${youWord} בן אדם" — כתוב "${youWord} אדם" (המילה "אדם" היא זכר בעברית)

## מבנה הפלט — JSON עם שני שדות:

"summary_short" — 2-3 משפטים שנותנים תמונה כללית ומדויקת של מי ${youWord}: מה הדפוס המרכזי שלך, מה מניע אותך, ומה סוג ${partnerType} הזוג שיתאים לך. זה לא ציטוט של פסקה אחת מתוך הניתוח המלא — זו שורה תחתונה שמסכמת את כל התמונה בקצרה. דמיין שמישהו שואל "ספר לי על ${isFemale ? "הבחורה" : "הבחור"} הזו בשני משפטים" — מה היית אומר?

"summary_full" — 8-12 פסקאות ניתוח מפורט. כל פסקה 3-5 משפטים. הפרד בין פסקאות עם שורה ריקה (\\n\\n). כתוב ניתוח שנותן תחושה של עומק ומעורבות — לא טקסט מינימלי וקצר.

המבנה:
1. פתיחה: תובנת ליבה על הדפוס המרכזי — מה מניע אותך בחיים, לא מה ${youWord} ${doWord} אלא למה.
2. איך זה בא לידי ביטוי בחיים, בבחירות, ביומיום.
3. דפוס רגשי או תקשורתי — איך ${youWord} ${copesWord} עם קונפליקט, מה קורה כשפוגעים בך.
4. מה ${learnedWord} ממערכות יחסים קודמות — לא מה קרה, אלא מה המסקנה.
5. הקשר עם המשפחה ואיך הוא משפיע על מה ש${youWord} ${searchWord} בזוגיות.
6. דפוסים בטעם הזוגי (ממבחן הטעם) — מה מושך, מה דוחה, ולמה.
7. מה ${youWord} ${needWord} בקשר — תובנה אמיתית, לא רשימת קניות.
8. מה פחות יתאים לך — נסח דרך צרכים, לא דרך פסילה ("כנראה פחות יתאים לך קשר שבו..." ולא "אנשים כאלה לא טובים").
9. סגירה — מה סוג ${partnerType} הזוג שיתאים לך ולמה, משפט שמחבר את כל התמונה.

אם נושא מסוים לא רלוונטי (למשל אין מידע על משפחה) — דלג עליו. אל תמציא.

חשוב: כתוב ניתוח מעמיק ומדויק. ${readerWord} ${isFemale ? "רוצה" : "רוצה"} להרגיש שבאמת צללת לעומק.
תזכורת אחרונה: גוף שני — "${youWord}...", לא "${user.first_name}...", לא "${thirdPerson}...".
החזר JSON בלבד, ללא markdown, ללא בלוק קוד.`;

  const userPrompt = `פרטי ${genderWord}:
שם: ${user.first_name || "לא ידוע"}
גיל: ${user.age || "לא ידוע"}
מגדר: ${user.gender || "לא ידוע"}
עיר: ${user.city || "לא ידוע"}
מחפש/ת: ${searchGender}

ציוני תכונות: ${traitsSummary || "אין עדיין"}

${fullTranscript}`;

  // ── Call OpenAI ────────────────────────────────────────────────
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.55,
    max_tokens: 6000,
    response_format: { type: "json_object" },
  });

  if (response.usage) {
    trackTokens(userId, "generate_insights", "gpt-4o", response.usage as any);
  }

  const raw = response.choices[0]?.message?.content || "{}";
  let parsed: { summary_short?: string; summary_full?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse AI insights response: ${raw.slice(0, 200)}`);
  }

  if (!parsed.summary_short || !parsed.summary_full) {
    throw new Error("AI returned empty insights");
  }

  // ── Save to DB ─────────────────────────────────────────────────
  // Determine pre_completion status based on channel message counts
  const cogUserCount = allMessages.filter((m: any) => m.guide === "new_chat_cognitive" && m.role === "user").length;
  const tasteUserCount = allMessages.filter((m: any) => m.guide === "new_chat_taste" && m.role === "user").length;
  const preCompletion = cogUserCount < 3 || tasteUserCount < 3;

  await pgQueryAll(
    `UPDATE users SET personal_insights_short = $1, personal_insights_full = $2,
     insights_pre_completion = $3, updated_at = NOW() WHERE id = $4`,
    [parsed.summary_short, parsed.summary_full, preCompletion, userId]
  );

  console.log(`[generateInsights] User ${userId}: insights saved (pre_completion=${preCompletion})`);

  return {
    summary_short: parsed.summary_short,
    summary_full: parsed.summary_full,
  };
}
