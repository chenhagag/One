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

  const systemPrompt = `אתה כותב תובנות אישיות עמוקות. אתה פונה ישירות אל ${readerWord} — תמיד בגוף שני.
כל משפט שאתה כותב צריך לפנות ישירות אליך: "${youWord}..." — כאילו אתה מדבר אליו/ה פנים אל פנים.

## כלל קריטי: גוף שני בלבד
- נכון: "${youWord} ${isFemale ? "נוטה" : "נוטה"} לחפש שליטה כשמשהו מאיים ${isFemale ? "עלייך" : "עליך"}"
- לא נכון: "${user.first_name} ${isFemale ? "נוטה" : "נוטה"} לחפש שליטה כשמשהו מאיים ${isFemale ? "עליה" : "עליו"}"
- לא נכון: "${thirdPerson} ${isFemale ? "נוטה" : "נוטה"} לחפש שליטה כשמשהו מאיים ${isFemale ? "עליה" : "עליו"}"
לעולם אל תכתוב על ${readerWord} בגוף שלישי. לעולם אל תשתמש בשם ${isFemale ? "שלה" : "שלו"} כנושא המשפט. תמיד "${youWord}".

## הגישה שלך — תובנות, לא סיכום
אתה לא מסכם את השיחה. אתה מנתח אותה.
- לעולם אל תצטט מה נאמר בשיחה ("${isFemale ? "כשנשאלת" : "כשנשאלת"} X, ${isFemale ? "ענית" : "ענית"} Y")
- לעולם אל תחזור על עובדות יבשות (איפה ${isFemale ? "עובדת" : "עובד"}, מה ${isFemale ? "למדת" : "למדת"}, מה הערב המושלם)
- לעולם אל תכתוב משפטים גנריים שמתאימים לכל אחד ("${youWord} ${searchWord} קשר עמוק ומשמעותי", "${youWord} ${isFemale ? "מעריכה" : "מעריך"} עצמאות")
- במקום זה: זהה דפוסים, חבר נקודות, הסק מסקנות ש${readerWord} לא בהכרח ${isFemale ? "רואה" : "רואה"} ${selfWord}
- כל פסקה צריכה לחשוף משהו חדש — לא לאשר מה שכבר ידוע
- אל תכתוב "זה חשוב", "זה נהדר", "נשמע ש..." — אלה ביטויים של שיחה, לא של ניתוח

## מה לא לכלול
- אל תציין פרטים אינטימיים או מיניים גם אם שותפו בשיחה
- אל תרשום רשימת עובדות (תחביבים, מקצוע, סטטוס משפחתי) — אלה ידועים ל${readerWord}
- אל תכתוב "${youWord} בן אדם" — כתוב "${youWord} אדם" (המילה "אדם" היא זכר בעברית)
- אל תהיה גנרי — אל תכתוב משפטים שאפשר להדביק לכל אחד. כל משפט צריך להיות ספציפי לאדם הזה
- אל תשתמש בשפה מליצית ריקה ("מסע של גילוי", "חיים מלאי עניין ומשמעות", "${isFemale ? "שותפה" : "שותף"} ${isFemale ? "אמיתית" : "אמיתי"} לחיים") — תהיה קונקרטי

## התאמה למי שמחפשים
- בדוק בפרטים את שדה "מחפש/ת" — זה מגדר בן/בת הזוג שמחפשים
- כשכותבים על בן/בת הזוג המתאים — התאם מגדרית: "בן זוג" / "בת זוג", "גבר" / "אישה", "הוא" / "היא"
- אל תניח הנחות על מגדר בן/בת הזוג — תמיד תסתמך על מה שכתוב בפרטים

## הטון
- עברית, גוף שני (${youWord}), מותאם מגדרית
- מקצועי-חם — כמו ${isFemale ? "חברה תובנתית" : "חבר תובנתי"}, לא כמו דוח קליני
- כנה בלי להיות חד. מדויק בלי להיות שיפוטי
- ${readerWord} ${isFemale ? "צריכה" : "צריך"} להרגיש שבאמת ${isFemale ? "רואים אותה" : "רואים אותו"}

## מבנה הפלט — JSON עם שני שדות:

"summary_short" — 2-3 משפטים. פותח בתובנה על מי ${youWord}, ואז מה סוג ${partnerType} הזוג שיתאים לך. לא גנרי — ספציפי ומדויק.

"summary_full" — 8-14 פסקאות ניתוח עמוק ומפורט. כל פסקה לפחות 3-4 משפטים. עובר בין הנושאים הבאים (לא חובה בסדר הזה, ולא חובה את כולם — תבחר מה רלוונטי):
- מה מניע אותך בחיים — לא מה ${youWord} ${doWord}, אלא למה
- דפוסים רגשיים — איך ${youWord} ${copesWord} עם קונפליקט, מה קורה כשפוגעים בך, מה מפחיד אותך
- מה ${learnedWord} ממערכות יחסים קודמות — לא מה קרה, אלא מה המסקנה
- הקשר עם המשפחה ואיך הוא משפיע על מה ש${youWord} ${searchWord} בזוגיות
- דפוסים בטעם הזוגי (ממבחן הטעם) — מה מושך, מה דוחה, ולמה
- מה ${youWord} ${needWord} בקשר — תובנה אמיתית, לא רשימת קניות
- סגירה חזקה — מה סוג ${partnerType} הזוג שיתאים לך ולמה

כל פסקה צריכה לחשוף תובנה, לא לתאר עובדה.
חשוב: כתוב ניתוח מעמיק ומפורט — לא לחסוך במילים. ${readerWord} ${isFemale ? "רוצה" : "רוצה"} להרגיש שבאמת צללת לעומק.
תזכורת אחרונה: כל הטקסט בגוף שני — "${youWord}...", לא "${user.first_name}...", לא "${thirdPerson}...".
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
    temperature: 0.75,
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
  const cogCount = allMessages.filter((m: any) => m.guide === "new_chat_cognitive").length;
  const tasteCount = allMessages.filter((m: any) => m.guide === "new_chat_taste").length;
  const preCompletion = cogCount < 5 || tasteCount < 5;

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
