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

const BASE_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "new-chat-base.txt"), "utf-8");
const PROFILE_CONTEXT = fs.readFileSync(path.join(PROMPTS_DIR, "context-profile.txt"), "utf-8");
const SYSTEM_CONTEXT = fs.readFileSync(path.join(PROMPTS_DIR, "context-system-info.txt"), "utf-8");

// Topic-based guidance prompts (injected one at a time based on coverage)
const TOPIC_INTRO = fs.readFileSync(path.join(PROMPTS_DIR, "topic-intro.txt"), "utf-8");
const TOPIC_RELATIONSHIPS = fs.readFileSync(path.join(PROMPTS_DIR, "topic-relationships.txt"), "utf-8");
const TOPIC_PERSONALITY = fs.readFileSync(path.join(PROMPTS_DIR, "topic-personality.txt"), "utf-8");
const TOPIC_VALUES = fs.readFileSync(path.join(PROMPTS_DIR, "topic-values.txt"), "utf-8");
const TOPIC_CULTURE = fs.readFileSync(path.join(PROMPTS_DIR, "topic-culture.txt"), "utf-8");

// Cognitive chat prompt (separate conversation mode)
const COGNITIVE_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "cognitive-chat.txt"), "utf-8");

// Taste test prompts + profile bank
const TASTE_TEST_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "taste-test-chat.txt"), "utf-8");
const TASTE_PROFILES_FEMALE = parseTasteProfiles(fs.readFileSync(path.join(PROMPTS_DIR, "taste-profiles-female.txt"), "utf-8"));
const TASTE_PROFILES_MALE = parseTasteProfiles(fs.readFileSync(path.join(PROMPTS_DIR, "taste-profiles-male.txt"), "utf-8"));

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
const TASTE_SELECTION_ORDER = [0, 3, 9, 14, 11, 17, 21, 5, 12, 16, 7, 19, 22];

/**
 * For "both" — alternates male and female profiles (indices into combined 48-profile array).
 * Male profiles are indices 0-23, female are 24-47.
 */
const TASTE_SELECTION_ORDER_BOTH = [0, 24+3, 9, 24+14, 11, 24+17, 21, 24+5, 12, 24+16, 7, 24+19, 22];

/** Shorter selection for couple testers — 5 diverse profiles */
const TASTE_SELECTION_ORDER_COUPLE = [0, 3, 9, 14, 21];
const TASTE_SELECTION_ORDER_COUPLE_BOTH = [0, 24+3, 9, 24+14, 21];

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

// ── Topic-based conversation flow ──────────────────────────────

/**
 * Topics in order. Each topic maps to summary fields that indicate coverage.
 * When all fields for a topic are filled, we move to the next topic.
 */
type ConversationTopic = "intro" | "relationships" | "personality" | "values" | "culture";

const TOPIC_ORDER: { topic: ConversationTopic; prompt: string; minInjections: number }[] = [
  { topic: "intro", prompt: TOPIC_INTRO, minInjections: 3 },
  { topic: "relationships", prompt: TOPIC_RELATIONSHIPS, minInjections: 3 },
  { topic: "personality", prompt: TOPIC_PERSONALITY, minInjections: 4 },
  { topic: "values", prompt: TOPIC_VALUES, minInjections: 3 },
  { topic: "culture", prompt: TOPIC_CULTURE, minInjections: 2 },
];

/** Topic injection counts — how many times each topic was served as the active topic */
export type TopicInjectionCounts = Record<ConversationTopic, number>;

/** Load topic injection counts from DB (stored in user_chat_summaries) */
async function getTopicInjectionCounts(userId: number): Promise<TopicInjectionCounts> {
  const row = await pgQueryOne<{ topic_injection_counts: TopicInjectionCounts }>(
    "SELECT topic_injection_counts FROM user_chat_summaries WHERE user_id = $1",
    [userId]
  );
  return row?.topic_injection_counts || { intro: 0, relationships: 0, personality: 0, values: 0, culture: 0 };
}


/**
 * Keywords for detecting what topic the user is REQUESTING to discuss.
 * Used only for steering — when user explicitly asks about a topic.
 */
const TOPIC_STEER_KEYWORDS: Record<ConversationTopic, RegExp[]> = {
  intro: [/עובד|עבודה|לומד|לימודים|תואר|אוניברסיטה|מכללה|גר ב|גדלתי/i],
  relationships: [/מחפש|זוגיות|מערכת יחסים|בן זוג|בת זוג|אקס|נפרדנו/i],
  personality: [/אופי|אישיות|קונפליקט|מתנהג|מגיב|מתמודד/i],
  values: [/ערך|ערכים|חשוב לי|לא מתפשר|מפריע|דת|מסורת|פוליטי/i],
  culture: [/מוזיקה|סרט|סדרה|ספר|תחביב|סופש|חברים|מבלה/i],
};

function detectUserRequestedTopic(message: string): ConversationTopic | null {
  for (const [topic, patterns] of Object.entries(TOPIC_STEER_KEYWORDS) as [ConversationTopic, RegExp[]][]) {
    for (const p of patterns) {
      if (p.test(message)) return topic;
    }
  }
  return null;
}

/**
 * Determine the current topic based on:
 * 1. User's current message direction (highest priority — follow the user)
 * 2. Summary coverage + history scan (fallback — pick first uncovered topic)
 */
/**
 * Determine the current topic based on injection counts.
 * A topic is "covered" when it was injected >= minInjections times.
 * User steering takes priority.
 */
function getCurrentTopic(
  injectionCounts: TopicInjectionCounts,
  currentMessage: string,
): { topic: ConversationTopic; prompt: string } {
  // If user's current message steers toward a specific topic — follow them
  const userRequested = detectUserRequestedTopic(currentMessage);
  if (userRequested) {
    const entry = TOPIC_ORDER.find(e => e.topic === userRequested)!;
    return { topic: userRequested, prompt: entry.prompt };
  }

  // Find first topic that hasn't been injected enough times
  for (const entry of TOPIC_ORDER) {
    const count = injectionCounts[entry.topic] || 0;
    if (count < entry.minInjections) {
      return { topic: entry.topic, prompt: entry.prompt };
    }
  }

  // All topics covered — fallback to culture
  return { topic: "culture", prompt: TOPIC_CULTURE };
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

  // Load summary + channel counts + topic injection counts once — reused across all logic
  const { summary: userSummary } = await getUserSummary(userId);
  const { cogCount, tasteCount } = await getChannelCounts(userId);
  const topicCounts = await getTopicInjectionCounts(userId);

  // Cognitive channel uses a completely separate prompt
  if (channel === "new_chat_cognitive") {
    let cognitiveExtra = "";
    if (lastAssistantMessage && message) {
      const isReentry = /סגנון החשיבה|שאלות סימולציה|בוא נבין/.test(message);
      if (isReentry && lastAssistantMessage.includes("?")) {
        cognitiveExtra = `\n\n## שאלה שלא נענתה\nבפעם הקודמת שאלת שאלה שהמשתמש לא הספיק לענות עליה. ההודעה האחרונה שלך הייתה:\n"${lastAssistantMessage}"\n\nהזכר לו את השאלה בנעימות, למשל: "אגב, לפני כן שאלתי אותך שאלה שלא הספקנו לסיים — רוצה לענות עליה?" ואז חזור על השאלה.`;
      }
    }

    // After ~10 user messages — close (couples: after 4)
    // Note: current message not yet saved to DB, so count is N-1
    const cogCloseThreshold = testUserType === "Couple Tester" ? 4 : 9;
    if (cogCount >= cogCloseThreshold) {
      cognitiveExtra += `\n\n## שלב: סיום\nאתה מרגיש שהצלחת לקלוט מספיק מסגנון החשיבה של המשתמש. סגור בחיוב: ספר שהתשובות היו מעניינות ושזה עוזר לך מאוד להבין את סגנון החשיבה שלו. אל תתן תובנות על אישיות המשתמש — רק סגירה חיובית.\nכתוב: "תודה, זה מאוד עוזר לי להבין את סגנון החשיבה שלך. אם יש עוד משהו — אני כאן."`;
    }

    const systemPrompt = COGNITIVE_PROMPT + genderInstruction + coupleInstruction + cognitiveExtra;
    return { systemPrompt, intent: "general", phase: detectPhase(messageCount) };
  }

  // Taste test channel — slim prompt + one profile at a time
  if (channel === "new_chat_taste") {
    const tasteUserMsgCount = tasteCount; // from getChannelCounts()

    // Select the right profile bank
    const profileBank = lookingForGender === "woman" ? TASTE_PROFILES_FEMALE
      : lookingForGender === "man" ? TASTE_PROFILES_MALE
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

    // Profile index: first profile at profileStartMsg, then +1 per msg
    const profileIndex = tasteUserMsgCount <= profileStartMsg ? 0 : tasteUserMsgCount - profileStartMsg;
    const isCoupleTest = testUserType === "Couple Tester";
    const currentProfile = getTasteProfile(profileBank, profileIndex, isBoth, isCoupleTest);

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
      phaseInstruction = `\n\n## שלב: פרופיל ראשון\nהמשתמש אישר שהוא מוכן. הצג את הפרופיל ושאל: עד כמה הוא/היא הטעם שלך מ-1 עד 10?`;
    } else if (!currentProfile) {
      // All profiles shown — summarize + ask if accurate
      phaseInstruction = `\n\n## שלב: סיכום\nהצגת מספיק פרופילים. סכם בקצרה (2-3 משפטים) את הדפוס שעולה מהתגובות של המשתמש — מה מושך אותו, מה פחות, איזה סגנון מדבר אליו.\nשאל את המשתמש: "קלטתי נכון? יש משהו שהיית רוצה לדייק?" תן לו להגיב ולתקן אם צריך.`;
    } else {
      phaseInstruction = `\n\n## שלב: הצגת פרופיל\nשאל שאלה-שתיים של הרחבה על התגובה של המשתמש (מה אהבת? מה פחות דיבר אליך?). אם התשובה כבר מפורטת — עבור ישר לפרופיל הבא.\nאחרי ההרחבה, הצג את הפרופיל הבא ושאל: עד כמה הוא/היא הטעם שלך מ-1 עד 10?`;
    }

    // Inject the single profile — only in profile phases
    let profileBlock = "";
    if (currentProfile && tasteUserMsgCount >= profileStartMsg) {
      profileBlock = `\n\n## הפרופיל להצגה\n\n${currentProfile.text}`;
    }

    // End of taste test — simple closing, frontend handles navigation
    let navigationInstruction = "";
    if (!currentProfile && tasteUserMsgCount > 1) {
      navigationInstruction = `\n\nאחרי הסיכום והחידוד, כתוב: "תודה על הפתיחות, זה מאוד עוזר לי לדייק את ההתאמה. אם יש עוד משהו שתרצה להוסיף — אני כאן."`;
    }

    const systemPrompt = TASTE_TEST_PROMPT + genderInstruction + coupleInstruction + phaseInstruction + profileBlock + reentryInstruction + navigationInstruction;
    return { systemPrompt, intent: "general", phase: detectPhase(messageCount) };
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

  // Topic-based guidance (RAG) — inject only the current topic's prompt
  let topicBlock = "";

  if (intent === "general") {
    const { topic: currentTopic, prompt: topicPrompt } = getCurrentTopic(topicCounts, message);
    topicBlock = "\n\n" + topicPrompt;

    // Increment topic count every OTHER substantive message per topic.
    // _skip_topic stores which topic was last incremented. If same topic → skip (follow-up turn).
    // If different topic or first time → increment (new bank question).
    const isSubstantive = message.trim().length >= 15;
    const lastIncrementedTopic = (topicCounts as any)._last_incremented || "";

    if (isSubstantive) {
      if (lastIncrementedTopic === currentTopic) {
        // Same topic as last increment → this is a follow-up turn, skip but clear
        const updated = { ...topicCounts, _last_incremented: "" };
        pgQueryOne(
          `INSERT INTO user_chat_summaries (user_id, summary_json, message_count_at, topic_injection_counts, updated_at)
           VALUES ($1, '{}'::jsonb, 0, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE SET topic_injection_counts = $2::jsonb, updated_at = NOW()`,
          [userId, JSON.stringify(updated)]
        ).catch(() => {});
      } else {
        // Different topic or cleared → this is a bank question turn, increment
        const updated = { ...topicCounts, [currentTopic]: (topicCounts[currentTopic] || 0) + 1, _last_incremented: currentTopic };
        pgQueryOne(
          `INSERT INTO user_chat_summaries (user_id, summary_json, message_count_at, topic_injection_counts, updated_at)
           VALUES ($1, '{}'::jsonb, 0, $2::jsonb, NOW())
           ON CONFLICT (user_id) DO UPDATE SET topic_injection_counts = $2::jsonb, updated_at = NOW()`,
          [userId, JSON.stringify(updated)]
        ).catch(() => {});
      }
    }
  }

  // Closing logic — managed as a state machine via _closing_stage in topicCounts
  // Stage 0 (or absent): not closing yet
  // Stage 1: all topics covered → inject "give insight + ask if accurate"
  // Stage 2: user responded to insight → inject "thank + close"
  let closingInstruction = "";
  if (intent === "general") {
    const closingStage = (topicCounts as any)._closing_stage || 0;
    const allTopicsCovered = TOPIC_ORDER.every(entry => (topicCounts[entry.topic] || 0) >= entry.minInjections);

    if (closingStage === 2) {
      // Stage 2: user responded to our insight — close the conversation
      closingInstruction = `\n\n## שלב: סגירת שיחה\nתגיב בקצרה למה שהמשתמש אמר (אם תיקן — הכר בתיקון). ואז כתוב הודעת סיום:\n"תודה רבה על הפתיחות! אנחנו מתחילים לנתח את הפרופיל שלך ולבדוק התאמות אפשריות. נעדכן אותך כשנמצא אפשרויות מתאימות, או אם נצטרך ממך מידע נוסף. אנחנו כאן לכל מה שתצטרך."`;
    } else if (closingStage === 1) {
      // Stage 1 was set last turn — now advance to stage 2
      const updated = { ...topicCounts, _closing_stage: 2 };
      pgQueryOne(
        `UPDATE user_chat_summaries SET topic_injection_counts = $1::jsonb, updated_at = NOW() WHERE user_id = $2`,
        [JSON.stringify(updated), userId]
      ).catch(() => {});
      // Still inject insight instruction (in case stage 1 reply didn't include it)
      closingInstruction = `\n\n## שלב: תובנה וסיכום\nתגיב למה שהמשתמש אמר, ואז תן תובנה קצרה (2-3 משפטים) על מה שלמדת עליו — מה מאפיין אותו, מה הוא מחפש, ומה לדעתך ידבר אליו בבן/בת זוג. שאל: "דייקתי? יש משהו שהיית רוצה להוסיף או לתקן?"`;
    } else if (allTopicsCovered && closingStage === 0) {
      // All topics done — enter stage 1: give insight
      const updated = { ...topicCounts, _closing_stage: 1 };
      pgQueryOne(
        `UPDATE user_chat_summaries SET topic_injection_counts = $1::jsonb, updated_at = NOW() WHERE user_id = $2`,
        [JSON.stringify(updated), userId]
      ).catch(() => {});
      closingInstruction = `\n\n## שלב: תובנה וסיכום\nכיסינו את כל הנושאים. תגיב למה שהמשתמש אמר, ואז תן תובנה קצרה (2-3 משפטים) על מה שלמדת עליו — מה מאפיין אותו, מה הוא מחפש, ומה לדעתך ידבר אליו בבן/בת זוג. שאל: "דייקתי? יש משהו שהיית רוצה להוסיף או לתקן?"`;
    }
  }

  const systemPrompt = BASE_PROMPT + genderInstruction + coupleInstruction + topicBlock + contextBlock + closingInstruction;

  return { systemPrompt, intent, phase };
}
