/**
 * Conversation Summarizer — extracts structured user info from chat history.
 *
 * Triggered every SUMMARY_INTERVAL user messages. Runs async (non-blocking).
 * Stores a structured JSON summary in user_chat_summaries.
 *
 * The summary is used:
 * 1. When user asks about themselves (profile intent) and no analysis exists
 * 2. As context when conversation history grows too long
 */

import OpenAI from "openai";
import { queryOne as pgQueryOne, queryAll as pgQueryAll } from "../../db.pg";

// ── Config ──────────────────────────────────────────────────────

/** Summarize every N user messages */
export const SUMMARY_INTERVAL = 8;

/** Minimum user messages before first summary */
const MIN_MESSAGES_FOR_SUMMARY = 6;

// ── Types ───────────────────────────────────────────────────────

export interface UserChatSummary {
  general_info?: string;       // שם, גיל, מגורים, מצב משפחתי
  occupation?: string;         // תחום עיסוק/לימודים, מה אוהב/לא אוהב בזה
  background_culture?: string; // רקע, עולם תרבותי, מוזיקה/ספרים/סדרות, עיר חלום
  social_style?: string;       // חברים, סגנון חברתי, יחסי משפחה, סופשים
  taste_and_style?: string;    // טעם, סגנון אישי, תחביבים, "שבט"
  relationships?: string;      // מה מחפש בזוגיות, ניסיון קודם, מה למד
  values?: string;             // ערכים מובילים, עמדות, מה חשוב לו
  intellectual_world?: string; // נושאים שמעניינים, סגנון חשיבה, עומק
  notable_quotes?: string[];   // משפטים בולטים שאמר (עד 3)
}

// ── Summary prompt ──────────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `אתה מסכם שיחות. המשימה שלך: לקרוא תמליל שיחה ולחלץ מידע מובנה על המשתמש.

חלץ את המידע הבא (רק מה שנאמר בפועל — אל תמציא):

1. **general_info** — פרטים בסיסיים: שם, גיל, מגורים, מצב משפחתי
2. **occupation** — עיסוק, לימודים, תחום, מה אוהב/לא אוהב בעבודה
3. **background_culture** — רקע, עולם תרבותי (מוזיקה, ספרים, סרטים, סדרות), תחביבים תרבותיים
4. **social_style** — סגנון חברתי, גודל חוג חברים, יחסי משפחה, איך מבלה סופשים
5. **taste_and_style** — טעם אישי, סגנון, "שבט" (היפסטר/אקדמאי/ספורטאי וכו'), דברים שעושה אחרת
6. **relationships** — מה מחפש בזוגיות, ניסיון קודם, מה למד על עצמו, על מה לא מתפשר
7. **values** — ערכים מובילים, עמדות, מה חשוב לו, מה מפריע לו
8. **intellectual_world** — נושאים שמעניינים אותו, רמת עומק, סגנון חשיבה
9. **notable_quotes** — עד 3 משפטים בולטים/מעניינים שהמשתמש אמר (ציטוט ישיר)

## כללים
- כתוב בעברית, תמציתי (2-4 משפטים לכל שדה)
- רק מידע שנאמר בפועל בשיחה. אם אין מידע על קטגוריה — כתוב null
- אל תפרש או תנתח — רק סכם עובדות ואמירות
- אם יש סיכום קודם — עדכן אותו עם מידע חדש, אל תמחק מידע ישן אלא אם הוא סותר

החזר JSON בלבד, בפורמט:
{
  "general_info": "..." | null,
  "occupation": "..." | null,
  "background_culture": "..." | null,
  "social_style": "..." | null,
  "taste_and_style": "..." | null,
  "relationships": "..." | null,
  "values": "..." | null,
  "intellectual_world": "..." | null,
  "notable_quotes": ["...", "..."] | null
}`;

// ── Core functions ──────────────────────────────────────────────

/**
 * Check if it's time to summarize based on message count.
 */
export function shouldSummarize(currentMessageCount: number, lastSummarizedAt: number): boolean {
  if (currentMessageCount < MIN_MESSAGES_FOR_SUMMARY) return false;
  if (lastSummarizedAt === 0 && currentMessageCount >= MIN_MESSAGES_FOR_SUMMARY) return true;
  return (currentMessageCount - lastSummarizedAt) >= SUMMARY_INTERVAL;
}

/**
 * Get the existing summary for a user (if any).
 */
export async function getUserSummary(userId: number): Promise<{ summary: UserChatSummary | null; messageCountAt: number }> {
  const row = await pgQueryOne<{ summary_json: UserChatSummary; message_count_at: number }>(
    "SELECT summary_json, message_count_at FROM user_chat_summaries WHERE user_id = $1",
    [userId]
  );
  if (!row) return { summary: null, messageCountAt: 0 };
  return { summary: row.summary_json, messageCountAt: row.message_count_at };
}

/**
 * Run the summarization and save to DB. Async — call without await if non-blocking desired.
 */
export async function runSummarization(
  userId: number,
  history: { role: string; content: string }[],
  currentMessageCount: number,
  existingSummary: UserChatSummary | null,
): Promise<void> {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build the user prompt with conversation + existing summary
    let userPrompt = "";
    if (existingSummary) {
      userPrompt += "## סיכום קודם (עדכן לפי הצורך):\n" + JSON.stringify(existingSummary, null, 2) + "\n\n";
    }
    userPrompt += "## תמליל שיחה:\n";
    for (const msg of history) {
      const role = msg.role === "user" ? "משתמש" : "מערכת";
      userPrompt += `${role}: ${msg.content}\n`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const summary: UserChatSummary = JSON.parse(raw);

    // Upsert into DB
    await pgQueryAll(
      `INSERT INTO user_chat_summaries (user_id, summary_json, message_count_at, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         summary_json = $2,
         message_count_at = $3,
         updated_at = NOW()`,
      [userId, JSON.stringify(summary), currentMessageCount]
    );

    console.log(`[summarizer] User ${userId}: summary updated at ${currentMessageCount} messages`);
  } catch (err: any) {
    console.error(`[summarizer] User ${userId}: error —`, err.message);
  }
}

/**
 * Format summary for injection into a prompt.
 */
export function formatSummaryForPrompt(summary: UserChatSummary): string {
  const sections: string[] = [];

  if (summary.general_info) sections.push(`פרטים כלליים: ${summary.general_info}`);
  if (summary.occupation) sections.push(`עיסוק: ${summary.occupation}`);
  if (summary.background_culture) sections.push(`עולם תרבותי: ${summary.background_culture}`);
  if (summary.social_style) sections.push(`סגנון חברתי: ${summary.social_style}`);
  if (summary.taste_and_style) sections.push(`טעם וסגנון: ${summary.taste_and_style}`);
  if (summary.relationships) sections.push(`זוגיות: ${summary.relationships}`);
  if (summary.values) sections.push(`ערכים: ${summary.values}`);
  if (summary.intellectual_world) sections.push(`עולם אינטלקטואלי: ${summary.intellectual_world}`);
  if (summary.notable_quotes && summary.notable_quotes.length > 0) {
    sections.push(`ציטוטים בולטים: "${summary.notable_quotes.join('", "')}"`);
  }

  return sections.join("\n");
}
