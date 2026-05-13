/**
 * Chat Manager — RAG-based conversation routing for the new chat.
 *
 * Detects user intent, loads only relevant context, and builds
 * a focused prompt. Keeps the system prompt slim and targeted.
 *
 * Intent categories:
 * - "profile"  — user asks about themselves (MBTI, values, Big Five, traits)
 * - "system"   — user asks how the system works, the process, matching
 * - "general"  — normal conversation, getting to know the user
 *
 * Topic-based conversation flow (determined by summary coverage):
 * - "intro"         — background, occupation, education
 * - "relationships" — what looking for, past experience
 * - "values"        — values, positions, what matters
 * - "culture"       — taste, style, hobbies, social world
 */

import fs from "fs";
import path from "path";
import { getSafeUserProfile, formatSafeProfileForPrompt } from "../../safeOutputLayer";
import { getUserSummary, formatSummaryForPrompt, type UserChatSummary } from "./summarizer";
import { queryOne as pgQueryOne } from "../../db.pg";

// ── Prompts (loaded once at startup) ────────────────────────────

const PROMPTS_DIR = path.join(__dirname, "prompts");

const PROFILE_CONTEXT = fs.readFileSync(path.join(PROMPTS_DIR, "context-profile.txt"), "utf-8");
const SYSTEM_CONTEXT = fs.readFileSync(path.join(PROMPTS_DIR, "context-system-info.txt"), "utf-8");

// Micro-topic system + prompt templates
import {
  getCurrentTopic, advanceToNextTopic, allTopicsDone,
  type ConversationState, DEFAULT_STATE,
} from "./microTopics";
import {
  buildPromptA, buildPromptB, buildPromptC, buildPromptD,
  buildPromptEInsight, buildPromptEFinal,
} from "./promptTemplates";

// Cognitive chat prompt (separate conversation mode)
const COGNITIVE_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "cognitive-chat.txt"), "utf-8");

// Taste test prompts + profile bank
const TASTE_TEST_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "taste-test-chat.txt"), "utf-8");
const TASTE_PROFILES_FEMALE = parseTasteProfiles(fs.readFileSync(path.join(PROMPTS_DIR, "taste-profiles-female.txt"), "utf-8"));
const TASTE_PROFILES_MALE = parseTasteProfiles(fs.readFileSync(path.join(PROMPTS_DIR, "taste-profiles-male.txt"), "utf-8"));
const TASTE_PROFILES_FEMALE_FF = parseTasteProfiles(fs.readFileSync(path.join(PROMPTS_DIR, "taste-profiles-female-ff.txt"), "utf-8"));
const TASTE_PROFILES_MALE_MM = parseTasteProfiles(fs.readFileSync(path.join(PROMPTS_DIR, "taste-profiles-male-mm.txt"), "utf-8"));

/** Parse profile file into individual profile objects */
function parseTasteProfiles(raw: string): { id: string; text: string }[] {
  const profiles: { id: string; text: string }[] = [];
  // Split by "## N. " pattern
  const sections = raw.split(/\n## \d+\.\s+/);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.startsWith("#")) continue; // Skip header
    // First line is "id — hebrew label", rest is the profile text
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline === -1) continue;
    const headerLine = trimmed.substring(0, firstNewline).trim();
    const id = headerLine.split("–")[0]?.split("—")[0]?.trim() || headerLine;
    const text = trimmed.substring(firstNewline).trim();
    profiles.push({ id, text });
  }
  return profiles;
}

/**
 * Curated diverse selection order (indices into the 24-profile array).
 * Covers: intellectual, street, spiritual, mainstream, family, artsy, sensitive, formal.
 */
const TASTE_SELECTION_ORDER = [0, 3, 9, 14, 11, 17, 21];

/**
 * For "both" — alternates male and female profiles (indices into combined 48-profile array).
 * Male profiles are indices 0-23, female are 24-47.
 */
const TASTE_SELECTION_ORDER_BOTH = [0, 24+3, 9, 24+14, 11, 24+17, 21];

/** Shorter selection for couple testers — 5 diverse profiles */
const TASTE_SELECTION_ORDER_COUPLE = [0, 3, 9, 14, 21];
const TASTE_SELECTION_ORDER_COUPLE_BOTH = [0, 24+3, 9, 24+14, 21];

/** Build the full list of all profiles for injection into the prompt */
function buildTasteProfileList(profiles: { id: string; text: string }[]): string {
  const lines: string[] = [];
  for (let i = 0; i < profiles.length; i++) {
    lines.push(`פרופיל ${i + 1}:\n${profiles[i].text}`);
  }
  return lines.join("\n\n");
}

function getTasteProfile(profiles: { id: string; text: string }[], index: number, isBoth: boolean = false, isCouple: boolean = false): { id: string; text: string } | null {
  let order: number[];
  if (isCouple) {
    order = isBoth ? TASTE_SELECTION_ORDER_COUPLE_BOTH : TASTE_SELECTION_ORDER_COUPLE;
  } else {
    order = isBoth ? TASTE_SELECTION_ORDER_BOTH : TASTE_SELECTION_ORDER;
  }
  if (index >= order.length) return null; // Done — all shown
  const profileIdx = order[index];
  return profiles[profileIdx] ?? null;
}

// ── Intent detection ────────────────────────────────────────────

export type ChatIntent = "profile" | "system" | "general";
export type ConversationPhase = "opening" | "middle" | "deep";

const PROFILE_PATTERNS = [
  /מה למדת/i, /מה אתה יודע/i, /מה גילית/i, /ספר לי על עצמי/i,
  /תובנות/i, /מה הבנת עליי/i, /מה אתה חושב עליי/i,
  /mbti/i, /טיפוס/i, /אישיות/i, /ביג פייב/i, /big five/i,
  /ערכים שלי/i, /ערכים מרכזיים/i, /שוורץ/i, /schwartz/i,
  /תכונות שלי/i, /מה מאפיין אותי/i, /איך אתה רואה אותי/i,
  /מה אתה יכול להגיד עליי/i, /מה ראית אצלי/i,
];

const SYSTEM_PATTERNS = [
  /איך (זה |המערכת |התהליך )?עובד/i, /איך מוצאים/i, /איך מתאימים/i,
  /מה התהליך/i, /מה קורה אחרי/i, /מתי (אקבל|מקבלים) התאמה/i,
  /איך ההתאמה/i, /על בסיס מה/i, /מה המערכת/i,
  /כמה זמן (לוקח|ייקח)/i, /מתי זה מוכן/i, /מה השלב הבא/i,
  /בדיקת (תמונה|מראה|חיצונ)/i, /ציון התאמה/i,
  /שאלה (על|לגבי) (התהליך|המערכת)/i, /יש לי שאלה לגבי התהליך/i,
  /איך אתה מוצא לי/i, /התאמה מדויקת/i,
  // Meta questions — "why are you asking this?"
  /למה (זה |את |אתה )?(שואל|שואלת|רלוונטי|קשור)/i,
  /מה (המטרה|הטעם)/i,
  /למה את שואל/i, /למה אתה שואל/i,
  /שואל (הרבה |מלא )שאלות/i, /קצת חופר/i,
];

export function detectIntent(message: string): ChatIntent {
  for (const p of PROFILE_PATTERNS) {
    if (p.test(message)) return "profile";
  }
  for (const p of SYSTEM_PATTERNS) {
    if (p.test(message)) return "system";
  }
  return "general";
}

// ── Phase detection (kept for API compatibility) ────────────────

export function detectPhase(messageCount: number): ConversationPhase {
  if (messageCount <= 6) return "opening";
  if (messageCount <= 20) return "middle";
  return "deep";
}

// ── Conversation state management ────────────────────────────

/** Load conversation state from DB */
async function getConversationState(userId: number): Promise<ConversationState> {
  const row = await pgQueryOne<{ topic_injection_counts: any }>(
    "SELECT topic_injection_counts FROM user_chat_summaries WHERE user_id = $1",
    [userId]
  );
  const raw = row?.topic_injection_counts;
  if (!raw || raw.counts !== undefined) {
    // No state or old format — start fresh
    return { ...DEFAULT_STATE };
  }
  return {
    current_topic_index: raw.current_topic_index ?? 0,
    turn_in_topic: raw.turn_in_topic ?? 0,
    closing_stage: raw.closing_stage ?? 0,
    off_topic_turns: raw.off_topic_turns ?? 0,
  };
}

/** Persist conversation state to DB */
function saveConversationState(userId: number, state: ConversationState): void {
  pgQueryOne(
    `INSERT INTO user_chat_summaries (user_id, summary_json, message_count_at, topic_injection_counts, updated_at)
     VALUES ($1, '{}'::jsonb, 0, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET topic_injection_counts = $2::jsonb, updated_at = NOW()`,
    [userId, JSON.stringify(state)]
  ).catch(() => {});
}

/** Load taste profile index from DB */
async function getTasteProfileIndex(userId: number): Promise<number> {
  const row = await pgQueryOne<{ topic_injection_counts: any }>(
    "SELECT topic_injection_counts FROM user_chat_summaries WHERE user_id = $1",
    [userId]
  );
  return row?.topic_injection_counts?.taste_profile_index ?? 0;
}

/** Save taste profile index to DB */
function saveTasteProfileIndex(userId: number, index: number): void {
  // Read existing state and merge
  pgQueryOne<{ topic_injection_counts: any }>(
    "SELECT topic_injection_counts FROM user_chat_summaries WHERE user_id = $1",
    [userId]
  ).then(row => {
    const existing = row?.topic_injection_counts || {};
    const merged = { ...existing, taste_profile_index: index };
    pgQueryOne(
      `INSERT INTO user_chat_summaries (user_id, summary_json, message_count_at, topic_injection_counts, updated_at)
       VALUES ($1, '{}'::jsonb, 0, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET topic_injection_counts = $2::jsonb, updated_at = NOW()`,
      [userId, JSON.stringify(merged)]
    ).catch(() => {});
  }).catch(() => {});
}

/** Total content fields in summary (excluding notable_quotes) */
const TOTAL_SUMMARY_FIELDS = 8;

/** Count filled summary fields */
function countSummaryFields(summary: UserChatSummary | null): number {
  if (!summary) return 0;
  const fields = [
    summary.general_info, summary.occupation, summary.background_culture,
    summary.social_style, summary.taste_and_style, summary.relationships,
    summary.values, summary.intellectual_world,
  ];
  return fields.filter(f => f && typeof f === "string" && f.trim().length > 0).length;
}

/** Fetch cognitive + taste message counts in a single query */
async function getChannelCounts(userId: number): Promise<{ cogCount: number; tasteCount: number }> {
  const result = await pgQueryOne<{ cog: string; taste: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE guide = 'new_chat_cognitive') as cog,
       COUNT(*) FILTER (WHERE guide = 'new_chat_taste') as taste
     FROM conversation_messages
     WHERE user_id = $1 AND role = 'user' AND guide IN ('new_chat_cognitive', 'new_chat_taste')`,
    [userId]
  );
  return {
    cogCount: parseInt(result?.cog || "0", 10),
    tasteCount: parseInt(result?.taste || "0", 10),
  };
}

/** Check if all channels are complete */
function isFullyCovered(summary: UserChatSummary | null, cogCount: number, tasteCount: number, isCouple: boolean = false): { allDone: boolean; cogDone: boolean; tasteDone: boolean; chatDone: boolean } {
  const chatDone = countSummaryFields(summary) >= TOTAL_SUMMARY_FIELDS;
  const cogDone = cogCount >= (isCouple ? 4 : 7);
  const tasteDone = tasteCount >= (isCouple ? 5 : 7);
  return { allDone: chatDone && cogDone && tasteDone, cogDone, tasteDone, chatDone };
}


// ── Couple tester instruction ──────────────────────────────────

const COUPLE_TESTER_INSTRUCTION = `

## הערה חשובה — המשתמש הוא חלק מזוג שבודק את המערכת

המשתמש הזה נמצא בזוגיות ומשתתף כדי לעזור לנו לבדוק את דיוק ההתאמות.

התאמות לשיחה:
- כששואל על מערכות יחסים קודמות — שאל על מה שהיה לפני הזוגיות הנוכחית
- אל תניח שהוא רווק — הוא בזוגיות
- אל תחזור על "תודה על ההשתתפות" — זה כבר נאמר בהודעה הראשונה
- חוץ מזה, נהל את השיחה בדיוק כרגיל — כל השאלות והנושאים רלוונטיים`;

// ── Gender instruction builder ──────────────────────────────────

export function buildGenderInstruction(
  gender: string | null,
  lookingForGender: string | null
): string {
  let instruction = "";

  if (gender === "man") {
    instruction = "\n\nחשוב: המשתמש הוא גבר. פנה אליו בלשון זכר.";
  } else if (gender === "woman") {
    instruction = "\n\nחשוב: המשתמשת היא אישה. פני אליה בלשון נקבה.";
  }

  if (lookingForGender === "man") {
    instruction += "\nהמשתמש/ת מחפש/ת גבר. כשמדברים על בן/בת זוג, התייחס בלשון זכר.";
  } else if (lookingForGender === "woman") {
    instruction += "\nהמשתמש/ת מחפש/ת אישה. כשמדברים על בן/בת זוג, התייחסי בלשון נקבה.";
  } else if (lookingForGender === "both") {
    instruction += "\nהמשתמש/ת מחפש/ת גם גברים וגם נשים.";
  }

  return instruction;
}

// ── Prompt builder ──────────────────────────────────────────────

export interface ChatPromptResult {
  systemPrompt: string;
  intent: ChatIntent;
  phase: ConversationPhase;
  closingStage: number;
}

export async function buildChatPrompt(
  userId: number,
  message: string,
  gender: string | null,
  lookingForGender: string | null,
  messageCount: number = 0,
  channel: string = "new_chat",
  lastAssistantMessage?: string,
  history: { role: string; content: string }[] = [],
  testUserType?: string | null,
): Promise<ChatPromptResult> {
  const genderInstruction = buildGenderInstruction(gender, lookingForGender);
  const coupleInstruction = testUserType === "Couple Tester" ? COUPLE_TESTER_INSTRUCTION : "";

  // Load summary + channel counts + conversation state in parallel
  const [{ summary: userSummary }, { cogCount, tasteCount }, convState] = await Promise.all([
    getUserSummary(userId),
    getChannelCounts(userId),
    getConversationState(userId),
  ]);

  // Cognitive channel uses a completely separate prompt
  if (channel === "new_chat_cognitive") {
    let cognitiveExtra = "";
    if (lastAssistantMessage && message) {
      const isReentry = /סגנון החשיבה|שאלות סימולציה|בוא נבין/.test(message);
      if (isReentry && lastAssistantMessage.includes("?")) {
        cognitiveExtra = `\n\n## שאלה שלא נענתה\nבפעם הקודמת שאלת שאלה שהמשתמש לא הספיק לענות עליה. ההודעה האחרונה שלך הייתה:\n"${lastAssistantMessage}"\n\nהזכר לו את השאלה בנעימות, למשל: "אגב, לפני כן שאלתי אותך שאלה שלא הספקנו לסיים — רוצה לענות עליה?" ואז חזור על השאלה.`;
      }
    }

    // Close after N real questions. cogCount includes ~2 intro messages (trigger + "ready").
    // Current message not yet in DB, so threshold = desired_questions + 2 intro - 1.
    // Regular: 6 questions → threshold 7. Couples: 4 questions → threshold 5.
    const cogCloseThreshold = testUserType === "Couple Tester" ? 7 : 7;
    if (cogCount >= cogCloseThreshold) {
      cognitiveExtra += `\n\n## שלב: סיום — חובה לסגור עכשיו\nזו ההודעה האחרונה שלך. אתה חייב לסגור את השיחה עכשיו.\nסגור בחיוב: ספר שהתשובות היו מעניינות ושזה עוזר לך מאוד להבין את סגנון החשיבה שלו. אל תתן תובנות על אישיות המשתמש — רק סגירה חיובית.\nסיים עם המשפט: "תודה, זה מאוד עוזר לי להבין את סגנון החשיבה שלך."\nאל תשאל שאלה נוספת. אל תמשיך את השיחה.`;
    }

    const systemPrompt = COGNITIVE_PROMPT + genderInstruction + coupleInstruction + cognitiveExtra;
    const closingStage = cogCount >= cogCloseThreshold ? 3 : 0;
    return { systemPrompt, intent: "general", phase: detectPhase(messageCount), closingStage };
  }

  // Taste test channel — slim prompt + one profile at a time
  if (channel === "new_chat_taste") {
    const tasteUserMsgCount = tasteCount; // from getChannelCounts()

    // Select the right profile bank
    // Select profile bank: same-sex gets adapted version, otherwise default
    const isSameSex = gender === lookingForGender;
    const profileBank = lookingForGender === "woman"
      ? (isSameSex ? TASTE_PROFILES_FEMALE_FF : TASTE_PROFILES_FEMALE)
      : lookingForGender === "man"
      ? (isSameSex ? TASTE_PROFILES_MALE_MM : TASTE_PROFILES_MALE)
      : [...TASTE_PROFILES_MALE, ...TASTE_PROFILES_FEMALE]; // "both" or unknown

    // Check for re-entry (user left and came back)
    const isReentry = /נתח את הטעם|בדיקת טעם|בוא נמשיך/.test(message);
    let reentryInstruction = "";
    if (isReentry && lastAssistantMessage && tasteUserMsgCount > 1) {
      reentryInstruction = `\n\n## חזרה לבדיקת טעם\nהמשתמש חזר לבדיקת הטעם. ההודעה האחרונה שלך הייתה:\n"${lastAssistantMessage}"\n\nאם הצגת פרופיל שהמשתמש לא הספיק להגיב עליו — הזכר לו בנעימות: "אגב, לפני כן הצגתי לך פרופיל — רוצה לחזור אליו?" וחזור על הפרופיל.`;
    }

    // First message (tasteUserMsgCount === 0): intro + first profile
    // Subsequent messages: next profile based on progress
    // Profile index = tasteUserMsgCount (first real response is msg 1 → show profile index 1, etc.)
    // But msg 0 is the trigger "נתח את הטעם שלי" → show intro + profile 0
    const isBoth = lookingForGender !== "woman" && lookingForGender !== "man";

    // Check if user already shared taste preferences in general chat
    const hasPriorTasteInfo = userSummary && (
      (userSummary.taste_and_style && userSummary.taste_and_style.trim().length > 0) ||
      (userSummary.relationships && userSummary.relationships.trim().length > 0)
    );

    // Determine taste test phases:
    // Without prior taste info: msg0=explain+general questions, msg1-2=answers, msg3=explain profiles+"ready?", msg4+=profiles
    // With prior taste info: msg0=explain profiles+"ready?", msg1+=profiles
    // We use a "profileStartMsg" threshold to know when profiles begin
    const profileStartMsg = hasPriorTasteInfo ? 1 : 3;

    const isCoupleTest = testUserType === "Couple Tester";
    const allProfilesText = buildTasteProfileList(profileBank);
    // Still need currentProfile for closing detection
    let profilesShown = 0;
    if (Array.isArray(history)) {
      const shownNames = new Set<string>();
      for (const h of history) {
        if (h.role === "assistant") {
          const matches = h.content.match(/אני (\S+)\./g);
          if (matches) for (const m of matches) shownNames.add(m);
        }
      }
      profilesShown = shownNames.size;
    }
    const totalProfiles = profileBank.length; // all profiles in the file
    const TASTE_MIN_PROFILES = 6; // after this many, taste is "done" for recommendations
    const allProfilesDone = profilesShown >= totalProfiles;
    const reachedMinimum = profilesShown >= TASTE_MIN_PROFILES;

    let phaseInstruction = "";
    if (tasteUserMsgCount === 0) {
      if (!lookingForGender) {
        // Need to ask gender preference first
        phaseInstruction = `\n\n## שלב: פתיחה\nזו ההודעה הראשונה. לפני שמתחילים, שאל את המשתמש/ת בצורה עדינה: "לפני שנתחיל — אני רוצה להציג לך פרופילים של אנשים בסגנונות שונים. מה מעניין אותך — פרופילים של גברים, נשים, או שניהם?"\nחכה לתשובה לפני שמציג פרופיל.`;
      } else if (hasPriorTasteInfo) {
        // Already know their taste — skip to profile explanation + ready
        phaseInstruction = `\n\n## שלב: פתיחה\nזו ההודעה הראשונה. הסבר למשתמש:\n"בוא/י נעשה רגע בדיקת טעם עמוקה יותר.\nאני אציג לך כמה פרופילים קצרים של אנשים בסגנונות שונים. אין כאן תשובה נכונה — מעניין אותי מה התחושה הראשונית שלך.\n\nאחרי כל פרופיל אשאל אותך עד כמה הוא/היא הטעם שלך מ-1 עד 10, מה עובד לך, ומה פחות. מוכן/ה?"\n\nאל תציג פרופיל — חכה שהמשתמש יאשר.`;
      } else {
        // No prior taste info — start with general taste questions
        const genderWord = lookingForGender === "woman" ? "נשים" : lookingForGender === "man" ? "גברים" : "אנשים";
        phaseInstruction = `\n\n## שלב: פתיחה + שאלות כלליות על טעם\nזו ההודעה הראשונה. הסבר בקצרה שאנחנו הולכים לעשות בדיקת טעם כדי להבין מה מושך את המשתמש ומה פחות.\n\nלפני שמציגים פרופילים, שאל 2-3 שאלות כלליות על הטעם שלו. למשל:\n- "איך היית מגדיר/ה את הטעם שלך ב${genderWord}? מה מושך אותך?"\n- "מה הכי רחוק מהטעם שלך? מה הכי מוריד לך?"\n- "יש משהו ספציפי שחשוב לך מבחינה חיצונית?"\n\nנסח את השאלות בצורה טבעית ונעימה. שאל שאלה אחת-שתיים עכשיו, והמשך לפי התשובה. אל תציג פרופילים בשלב הזה.`;
      }
    } else if (tasteUserMsgCount < profileStartMsg) {
      // Still in general taste questions phase (only when no prior info)
      if (tasteUserMsgCount === profileStartMsg - 1) {
        // Last general question answered — now explain profiles and ask "ready?"
        phaseInstruction = `\n\n## שלב: מעבר לפרופילים\nתגיב בקצרה לתשובת המשתמש. ואז הסבר:\n"עכשיו אני הולך להציג לך כמה פרופילים קצרים של אנשים בסגנונות שונים. אין כאן תשובה נכונה — מעניין אותי מה התחושה הראשונית שלך.\n\nאחרי כל פרופיל אשאל אותך עד כמה הוא/היא הטעם שלך מ-1 עד 10. מוכן/ה?"\n\nחכה לאישור לפני שמציג פרופיל.`;
      } else {
        // Continue general taste questions
        phaseInstruction = `\n\n## שלב: שאלות כלליות על טעם\nתגיב לתשובת המשתמש, ואז שאל עוד שאלה על הטעם שלו. למשל:\n- "מה הכי רחוק מהטעם שלך? מה מוריד לך?"\n- "יש משהו ספציפי שחשוב לך מבחינה חיצונית?"\nשאל שאלה אחת בכל תור. אל תציג פרופילים עדיין.`;
      }
    } else if (tasteUserMsgCount === profileStartMsg) {
      // User confirmed ready — show first profile
      phaseInstruction = `\n\n## שלב: פרופיל ראשון\nהמשתמש אישר שהוא מוכן. הצג את פרופיל 1 מהרשימה למטה. העתק אותו בדיוק כמו שהוא ושאל: עד כמה הוא/היא הטעם שלך מ-1 עד 10?`;
    } else if (allProfilesDone) {
      // All profiles shown — summarize + close
      phaseInstruction = `\n\n## שלב: סיכום וסגירה — חובה לסגור עכשיו\nהצגת את כל הפרופילים. סכם בקצרה (2-3 משפטים) את הדפוס שעולה מהתגובות של המשתמש — מה מושך אותו, מה פחות, איזה סגנון מדבר אליו.\nשאל את המשתמש: "קלטתי נכון? יש משהו שהיית רוצה לדייק?"\nאם המשתמש כבר אישר או תיקן — סיים עם: "תודה על הפתיחות, זה מאוד עוזר לי לדייק את ההתאמה."\nאל תציג עוד פרופילים. אל תמשיך את השיחה אחרי הסגירה.`;
    } else if (reachedMinimum && profilesShown === TASTE_MIN_PROFILES) {
      // Reached minimum — mid-summary + ask if they want more
      phaseInstruction = `\n\n## שלב: סיכום ביניים\nהצגת ${TASTE_MIN_PROFILES} פרופילים. סכם בקצרה (2-3 משפטים) את הדפוס שעולה מהתגובות — מה מושך אותו, מה פחות.\nשאל את המשתמש: "קלטתי נכון? רוצה להמשיך לעוד כמה פרופילים או שמספיק?"`;
    } else if (reachedMinimum && !allProfilesDone) {
      // User chose to continue after mid-summary — check if they said enough
      const lastUserMsg = message.trim();
      const wantsToStop = /מספיק|לא|סיימתי|די|נסגור|לא צריך/i.test(lastUserMsg);
      if (wantsToStop) {
        phaseInstruction = `\n\n## שלב: סיכום וסגירה — חובה לסגור עכשיו\nהמשתמש ביקש לסיים. סכם בקצרה את הדפוס שעלה ושאל: "קלטתי נכון? יש משהו שהיית רוצה לדייק?"\nאם המשתמש כבר אישר — סיים עם: "תודה על הפתיחות, זה מאוד עוזר לי לדייק את ההתאמה."`;
      } else {
        // Continue with more profiles
        phaseInstruction = `\n\n## שלב: הצגת פרופיל\nהמשתמש רוצה להמשיך. הצג את הפרופיל הבא מהרשימה (לפי הסדר — הפרופיל שעוד לא הוצג). העתק אותו בדיוק. אחרי הפרופיל שאל: עד כמה הוא/היא הטעם שלך מ-1 עד 10?`;
      }
    } else {
      // Show next profile from the list
      phaseInstruction = `\n\n## שלב: הצגת פרופיל\nשאל שאלה-שתיים של הרחבה על התגובה של המשתמש (מה אהבת? מה פחות דיבר אליך?). אם התשובה כבר מפורטת — עבור ישר לפרופיל הבא.\nהצג את הפרופיל הבא מהרשימה (לפי הסדר — הפרופיל שעוד לא הוצג). העתק אותו בדיוק. אחרי הפרופיל שאל: עד כמה הוא/היא הטעם שלך מ-1 עד 10?`;
    }

    // Inject all selected profiles — AI picks the next one in order
    let profileBlock = "";
    if (tasteUserMsgCount >= profileStartMsg && !allProfilesDone) {
      profileBlock = `\n\n## רשימת הפרופילים — חובה לקחת מכאן בלבד!\nהצג פרופיל אחד בכל תור, לפי הסדר. אל תמציא פרופילים. אל תשנה את התוכן. העתק מהרשימה בדיוק.\n\n${allProfilesText}`;
    }

    // End of taste test — simple closing, frontend handles navigation
    let navigationInstruction = "";
    if (allProfilesDone && tasteUserMsgCount > 1) {
      navigationInstruction = `\n\nאחרי הסיכום והחידוד, כתוב: "תודה על הפתיחות, זה מאוד עוזר לי לדייק את ההתאמה."`;
    }

    const systemPrompt = TASTE_TEST_PROMPT + genderInstruction + coupleInstruction + phaseInstruction + profileBlock + reentryInstruction + navigationInstruction;
    // Taste is "closed" only when all profiles done, OR user said "enough" after mid-summary
    const wantsToStop = reachedMinimum && /מספיק|לא|סיימתי|די|נסגור|לא צריך/i.test(message.trim());
    const closingStage = ((allProfilesDone || wantsToStop) && tasteUserMsgCount > 1) ? 3 : 0;
    return { systemPrompt, intent: "general", phase: detectPhase(messageCount), closingStage };
  }

  const intent = detectIntent(message);
  const phase = detectPhase(messageCount);

  let contextBlock = "";

  if (intent === "profile") {
    const safeProfile = await getSafeUserProfile(userId);
    const profileText = formatSafeProfileForPrompt(safeProfile);
    if (profileText.trim()) {
      contextBlock = "\n\n" + PROFILE_CONTEXT + "\n\n## פרופיל המשתמש\n" + profileText;
    } else {
      if (userSummary) {
        const summaryText = formatSummaryForPrompt(userSummary);
        contextBlock = "\n\n" + PROFILE_CONTEXT + "\n\n## מה שלמדתי עליך מהשיחה (טרם בוצע ניתוח רשמי)\n" + summaryText + "\n\nהערה: זה מבוסס על מה שהמשתמש שיתף בשיחה. עדיין לא בוצע ניתוח אישיות מלא. שתף תובנות בצורה חמה ומעצימה, והדגש שככל שנמשיך לשוחח תוכל ללמוד עליו עוד.";
      } else {
        contextBlock = "\n\n" + PROFILE_CONTEXT + "\n\n## פרופיל המשתמש\nאין עדיין נתוני פרופיל מובנים. אתה יכול לשתף רשמים כלליים וחיוביים מהשיחה, אבל הדגש שעדיין לא למדת מספיק ועודד להמשיך לשוחח.";
      }
    }
  } else if (intent === "system") {
    contextBlock = "\n\n" + SYSTEM_CONTEXT;
  }

  // ── Build prompt based on conversation state ──────────────
  let systemPrompt: string;

  if (intent === "system" || intent === "profile") {
    // System/profile question — answer briefly, ask to continue
    convState.off_topic_turns++;
    saveConversationState(userId, convState);
    const ctx = intent === "system" ? SYSTEM_CONTEXT : (contextBlock || PROFILE_CONTEXT);
    systemPrompt = buildPromptC(ctx, genderInstruction);

  } else if (convState.closing_stage >= 3) {
    // Conversation already closed — respond briefly
    systemPrompt = buildPromptD(genderInstruction);

  } else if (convState.closing_stage === 2) {
    // User responded to insight — final close
    convState.closing_stage = 3;
    saveConversationState(userId, convState);
    systemPrompt = buildPromptEFinal(genderInstruction);

  } else if (convState.closing_stage === 1) {
    // All topics done, give insight
    convState.closing_stage = 2;
    saveConversationState(userId, convState);
    systemPrompt = buildPromptEInsight(genderInstruction);

  } else {
    // Normal flow — micro-topics
    // Reset off-topic counter
    if (convState.off_topic_turns > 0) {
      convState.off_topic_turns = 0;
    }

    const currentTopic = getCurrentTopic(convState);

    if (!currentTopic) {
      // All topics done — enter closing stage 1 (insight)
      convState.closing_stage = 1;
      saveConversationState(userId, convState);
      systemPrompt = buildPromptEInsight(genderInstruction);

    } else if (convState.turn_in_topic === 0) {
      // Opening question for this topic — Prompt A
      systemPrompt = buildPromptA(
        currentTopic.openingQuestion,
        genderInstruction,
        coupleInstruction,
        currentTopic.guideline,
      );
      // Advance to follow-up turn
      convState.turn_in_topic = 1;
      saveConversationState(userId, convState);

    } else {
      // Follow-up turn — Prompt B
      const fallback = currentTopic.followUpQuestions.length > 0
        ? currentTopic.followUpQuestions[0]
        : null;
      systemPrompt = buildPromptB(fallback, genderInstruction, coupleInstruction);
      // Advance to next topic
      advanceToNextTopic(convState);
      saveConversationState(userId, convState);
    }
  }

  return { systemPrompt, intent, phase, closingStage: convState.closing_stage };
}
