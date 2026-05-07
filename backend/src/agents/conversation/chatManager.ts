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

function getTasteProfile(profiles: { id: string; text: string }[], index: number, isBoth: boolean = false): { id: string; text: string } | null {
  const order = isBoth ? TASTE_SELECTION_ORDER_BOTH : TASTE_SELECTION_ORDER;
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
type ConversationTopic = "intro" | "relationships" | "values" | "culture";

const TOPIC_ORDER: { topic: ConversationTopic; fields: (keyof UserChatSummary)[]; prompt: string }[] = [
  { topic: "intro", fields: ["general_info", "occupation"], prompt: TOPIC_INTRO },
  { topic: "relationships", fields: ["relationships"], prompt: TOPIC_RELATIONSHIPS },
  { topic: "values", fields: ["values"], prompt: TOPIC_VALUES },
  { topic: "culture", fields: ["background_culture", "social_style", "taste_and_style"], prompt: TOPIC_CULTURE },
];

/**
 * Quick keyword scan on recent history to detect topics already discussed.
 * Runs on the history array that's already sent with each request — no DB query needed.
 */
const TOPIC_KEYWORDS: Record<ConversationTopic, RegExp[]> = {
  intro: [/עובד|עבודה|לומד|לימודים|תואר|אוניברסיטה|מכללה|גר ב|גדלתי|מאיפה את/i],
  relationships: [/מחפש|מושך|זוגיות|מערכת יחסים|בן זוג|בת זוג|אקס|נפרדנו|יחסים קודמ/i],
  values: [/חשוב לי|ערך|לא מתפשר|מפריע|נלחם על|שינית דעה|בן אדם טוב/i],
  culture: [/מוזיקה|סרט|סדרה|ספר|תחביב|סופש|חברים|מבלה|זמן פנוי/i],
};

function detectTopicsInHistory(history: { role: string; content: string }[]): Set<ConversationTopic> {
  const discussed = new Set<ConversationTopic>();
  // Scan both user and assistant messages — if the AI asked about relationships and user answered, it's covered
  const text = history.map(m => m.content).join(" ");
  for (const [topic, patterns] of Object.entries(TOPIC_KEYWORDS) as [ConversationTopic, RegExp[]][]) {
    for (const p of patterns) {
      if (p.test(text)) {
        discussed.add(topic);
        break;
      }
    }
  }
  return discussed;
}

/**
 * Detect which topic the user's CURRENT message is steering toward.
 * Returns the topic if detected, null if the message is generic.
 */
function detectUserRequestedTopic(message: string): ConversationTopic | null {
  for (const [topic, patterns] of Object.entries(TOPIC_KEYWORDS) as [ConversationTopic, RegExp[]][]) {
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
function getCurrentTopic(
  summary: UserChatSummary | null,
  history: { role: string; content: string }[],
  currentMessage: string,
): { topic: ConversationTopic; prompt: string } {
  const discussedInHistory = detectTopicsInHistory(history);

  // Build list of uncovered topics (not in summary AND not in history)
  const uncovered: ConversationTopic[] = [];
  for (const entry of TOPIC_ORDER) {
    const coveredBySummary = summary && entry.fields.every(field => {
      const val = summary[field];
      return val && typeof val === "string" && val.trim().length > 0;
    });
    const coveredByHistory = discussedInHistory.has(entry.topic);

    if (!coveredBySummary && !coveredByHistory) {
      uncovered.push(entry.topic);
    }
  }

  // If user's current message steers toward a specific topic — follow them
  const userRequested = detectUserRequestedTopic(currentMessage);
  if (userRequested) {
    const entry = TOPIC_ORDER.find(e => e.topic === userRequested)!;
    return { topic: userRequested, prompt: entry.prompt };
  }

  // Default: first uncovered topic in order
  if (uncovered.length > 0) {
    const entry = TOPIC_ORDER.find(e => e.topic === uncovered[0])!;
    return { topic: uncovered[0], prompt: entry.prompt };
  }

  // All topics covered — fallback to culture
  return { topic: "culture", prompt: TOPIC_CULTURE };
}

/** Minimum filled fields in summary to suggest cognitive/taste */
const MIN_FIELDS_FOR_COGNITIVE_SUGGESTION = 5;

/**
 * Check if we should suggest cognitive questions to the user.
 */
async function shouldSuggestCognitive(userId: number, summary: UserChatSummary | null): Promise<boolean> {
  // Check if user already has cognitive messages
  const cogResult = await pgQueryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM conversation_messages
     WHERE user_id = $1 AND guide = 'new_chat_cognitive' AND role = 'user'`,
    [userId]
  );
  const cogCount = parseInt(cogResult?.count || "0", 10);
  if (cogCount >= 3) return false; // Already done cognitive

  if (!summary) return false;

  const fields = [
    summary.general_info, summary.occupation, summary.background_culture,
    summary.social_style, summary.taste_and_style, summary.relationships,
    summary.values, summary.intellectual_world,
  ];
  const filled = fields.filter(f => f && f.trim().length > 0).length;
  return filled >= MIN_FIELDS_FOR_COGNITIVE_SUGGESTION;
}

const COGNITIVE_SUGGESTION_INSTRUCTION = `

## הנחיה מיוחדת — הפנה למדור סגנון חשיבה

יש לך מספיק מידע על המשתמש בתחומים הכלליים. בתגובה הקרובה שלך (אחרי שתגיב למה שאמר), הפנה אותו בצורה טבעית ללחוץ על הכפתור "בוא נבין את סגנון החשיבה שלי" שנמצא במסך הראשי.
נסח משהו בסגנון: "אגב, אני חושב שיהיה סופר מעניין לבדוק את סגנון החשיבה שלך — תלחץ על 'בוא נבין את סגנון החשיבה שלי' במסך הראשי ונתחיל."
הצע את זה פעם אחת בלבד בשיחה. אל תכריח.`;

const TASTE_SUGGESTION_INSTRUCTION = `

## הנחיה מיוחדת — הפנה לבדיקת טעם

כבר יש מספיק מידע על סגנון החשיבה של המשתמש. בתגובה הקרובה שלך, הפנה אותו ללחוץ על "נתח את הטעם שלי לעומק" במסך הראשי.
נסח משהו בסגנון: "מצוין! עכשיו כדי לדייק עוד יותר — אני ממליץ ללחוץ על 'נתח את הטעם שלי לעומק' במסך הראשי."
הצע את זה פעם אחת בלבד.`;

/**
 * Check if we should suggest taste test to the user.
 * Only when cognitive is done but taste is not.
 */
async function shouldSuggestTaste(userId: number): Promise<boolean> {
  const cogResult = await pgQueryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM conversation_messages
     WHERE user_id = $1 AND guide = 'new_chat_cognitive' AND role = 'user'`,
    [userId]
  );
  const cogCount = parseInt(cogResult?.count || "0", 10);
  if (cogCount < 3) return false; // Cognitive not done yet

  const tasteResult = await pgQueryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM conversation_messages
     WHERE user_id = $1 AND guide = 'new_chat_taste' AND role = 'user'`,
    [userId]
  );
  const tasteCount = parseInt(tasteResult?.count || "0", 10);
  return tasteCount < 3; // Taste not done yet
}

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
): Promise<ChatPromptResult> {
  const genderInstruction = buildGenderInstruction(gender, lookingForGender);

  // Cognitive channel uses a completely separate prompt
  if (channel === "new_chat_cognitive") {
    let cognitiveExtra = "";
    if (lastAssistantMessage && message) {
      const isReentry = /סגנון החשיבה|שאלות סימולציה|בוא נבין/.test(message);
      if (isReentry && lastAssistantMessage.includes("?")) {
        cognitiveExtra = `\n\n## שאלה שלא נענתה\nבפעם הקודמת שאלת שאלה שהמשתמש לא הספיק לענות עליה. ההודעה האחרונה שלך הייתה:\n"${lastAssistantMessage}"\n\nהזכר לו את השאלה בנעימות, למשל: "אגב, לפני כן שאלתי אותך שאלה שלא הספקנו לסיים — רוצה לענות עליה?" ואז חזור על השאלה.`;
      }
    }

    // Count cognitive user messages to detect when to close
    const cogCountResult = await pgQueryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM conversation_messages WHERE user_id = $1 AND guide = 'new_chat_cognitive' AND role = 'user'`,
      [userId]
    );
    const cogUserMsgCount = parseInt(cogCountResult?.count || "0", 10);

    // After ~10 user messages — close and navigate
    if (cogUserMsgCount >= 10) {
      // Check what user still needs
      const tasteResult = await pgQueryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM conversation_messages WHERE user_id = $1 AND guide = 'new_chat_taste' AND role = 'user'`,
        [userId]
      );
      const tasteDone = parseInt(tasteResult?.count || "0", 10) >= 5;
      const { summary } = await getUserSummary(userId);
      const summaryFields = summary ? [summary.general_info, summary.occupation, summary.background_culture, summary.social_style, summary.relationships, summary.values, summary.intellectual_world].filter(f => f && f.trim().length > 0).length : 0;
      const chatDone = summaryFields >= 5;

      let navSuggestion = "";
      if (!tasteDone) {
        navSuggestion = `המלץ למשתמש: "עכשיו אני ממליץ ללחוץ על 'נתח את הטעם שלי לעומק' במסך הראשי — זה יעזור לי לדייק את ההתאמה עוד יותר."`;
      } else if (!chatDone) {
        navSuggestion = `המלץ למשתמש: "מומלץ לחזור לשיחה הראשית כדי שנוכל להמשיך להכיר אותך — לחץ על 'בוא נמשיך' במסך הראשי."`;
      } else {
        navSuggestion = `ספר למשתמש שאספנו מספיק מידע ושאנחנו מעבדים את הנתונים כדי למצוא לו התאמה מדויקת.`;
      }

      cognitiveExtra += `\n\n## שלב: סיום\nאתה מרגיש שהצלחת לקלוט מספיק מסגנון החשיבה של המשתמש. סגור בחיוב: ספר שהתשובות היו מעניינות ושזה עוזר לך מאוד להבין את סגנון החשיבה שלו.\n${navSuggestion}`;
    }

    const systemPrompt = COGNITIVE_PROMPT + genderInstruction + cognitiveExtra;
    return { systemPrompt, intent: "general", phase: detectPhase(messageCount) };
  }

  // Taste test channel — slim prompt + one profile at a time
  if (channel === "new_chat_taste") {
    // Count existing taste test user messages to determine progress
    const tasteCountResult = await pgQueryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM conversation_messages
       WHERE user_id = $1 AND guide = 'new_chat_taste' AND role = 'user'`,
      [userId]
    );
    const tasteUserMsgCount = parseInt(tasteCountResult?.count || "0", 10);

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
    // msg 0 = trigger, msg 1 = "ready" confirmation → profile 0, msg 2 = response → profile 1, etc.
    const profileIndex = tasteUserMsgCount <= 1 ? 0 : tasteUserMsgCount - 1;
    const currentProfile = getTasteProfile(profileBank, profileIndex, isBoth);

    let phaseInstruction = "";
    if (tasteUserMsgCount === 0) {
      // Intro phase — explain + ask if ready. Do NOT show profile yet.
      if (!lookingForGender) {
        phaseInstruction = `\n\n## שלב: פתיחה\nזו ההודעה הראשונה. לפני שמתחילים, שאל את המשתמש/ת בצורה עדינה: "לפני שנתחיל — אני רוצה להציג לך פרופילים של אנשים בסגנונות שונים. מה מעניין אותך — פרופילים של גברים, נשים, או שניהם?"\nחכה לתשובה לפני שמציג פרופיל.`;
      } else {
        phaseInstruction = `\n\n## שלב: פתיחה\nזו ההודעה הראשונה. הסבר למשתמש מה הולך לקרות:\n"בוא/י נעשה רגע בדיקת טעם עמוקה יותר.\nאני אציג לך כמה פרופילים קצרים של אנשים בסגנונות שונים. אין כאן תשובה נכונה — מעניין אותי מה התחושה הראשונית שלך: האם זה מסקרן, מושך, מרתיע, מביך, משעמם, או פשוט לא מרגיש מהעולם שלך.\n\nאחרי כל פרופיל אשאל אותך עד כמה הוא/היא הטעם שלך מ-1 עד 10, מה עובד לך, ומה פחות. מוכן/ה?"\n\nאל תציג פרופיל עדיין — חכה שהמשתמש יגיד שהוא מוכן.`;
      }
    } else if (tasteUserMsgCount === 1) {
      // User confirmed ready — show first profile
      phaseInstruction = `\n\n## שלב: פרופיל ראשון\nהמשתמש אישר שהוא מוכן. הצג את הפרופיל ושאל: עד כמה הוא/היא הטעם שלך מ-1 עד 10?`;
    } else if (!currentProfile) {
      // All profiles shown — summarize + ask if accurate + dynamic navigation
      phaseInstruction = `\n\n## שלב: סיכום\nהצגת מספיק פרופילים. סכם בקצרה (2-3 משפטים) את הדפוס שעולה מהתגובות של המשתמש — מה מושך אותו, מה פחות, איזה סגנון מדבר אליו.\nשאל את המשתמש: "קלטתי נכון? יש משהו שהיית רוצה לדייק?" תן לו להגיב ולתקן אם צריך.`;
    } else {
      phaseInstruction = `\n\n## שלב: הצגת פרופיל\nשאל שאלה-שתיים של הרחבה על התגובה של המשתמש (מה אהבת? מה פחות דיבר אליך?). אם התשובה כבר מפורטת — עבור ישר לפרופיל הבא.\nאחרי ההרחבה, הצג את הפרופיל הבא ושאל: עד כמה הוא/היא הטעם שלך מ-1 עד 10?`;
    }

    // Inject the single profile (if we have one to show) — NOT on intro (msg 0)
    let profileBlock = "";
    if (currentProfile && tasteUserMsgCount >= 1) {
      profileBlock = `\n\n## הפרופיל להצגה\n\n${currentProfile.text}`;
    }

    // Dynamic navigation at end — check what user still needs to do
    let navigationInstruction = "";
    if (!currentProfile && tasteUserMsgCount > 1) {
      // Taste is done — suggest next step
      const cogResult = await pgQueryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM conversation_messages WHERE user_id = $1 AND guide = 'new_chat_cognitive' AND role = 'user'`,
        [userId]
      );
      const cogDone = parseInt(cogResult?.count || "0", 10) >= 5;
      const { summary } = await getUserSummary(userId);
      const summaryFields = summary ? [summary.general_info, summary.occupation, summary.background_culture, summary.social_style, summary.relationships, summary.values, summary.intellectual_world].filter(f => f && f.trim().length > 0).length : 0;
      const chatDone = summaryFields >= 5;

      if (!cogDone) {
        navigationInstruction = `\n\nאחרי הסיכום, המלץ למשתמש: "עכשיו אני ממליץ ללחוץ על 'בוא נבין את סגנון החשיבה שלי' במסך הראשי — זה יעזור לי לדייק את ההתאמה עוד יותר."`;
      } else if (!chatDone) {
        navigationInstruction = `\n\nאחרי הסיכום, המלץ למשתמש: "מומלץ לחזור לשיחה הראשית כדי שנוכל להמשיך להכיר אותך — לחץ על 'בוא נמשיך' במסך הראשי."`;
      } else {
        navigationInstruction = `\n\nאחרי הסיכום, ספר למשתמש שאספנו מספיק מידע ושאנחנו מעבדים את הנתונים כדי למצוא לו התאמה מדויקת.`;
      }
    }

    const systemPrompt = TASTE_TEST_PROMPT + genderInstruction + phaseInstruction + profileBlock + reentryInstruction + navigationInstruction;
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
      const { summary } = await getUserSummary(userId);
      if (summary) {
        const summaryText = formatSummaryForPrompt(summary);
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
  let cognitiveSuggestion = "";

  if (intent === "general") {
    // Get summary + scan history (including current message) to determine current topic
    const { summary } = await getUserSummary(userId);
    const { prompt: topicPrompt } = getCurrentTopic(summary, history, message);
    topicBlock = "\n\n" + topicPrompt;

    // Check if we should suggest cognitive or taste test navigation
    if (phase === "middle" || phase === "deep") {
      const suggestCognitive = await shouldSuggestCognitive(userId, summary);
      if (suggestCognitive) {
        cognitiveSuggestion = COGNITIVE_SUGGESTION_INSTRUCTION;
      } else {
        const suggestTaste = await shouldSuggestTaste(userId);
        if (suggestTaste) {
          cognitiveSuggestion = TASTE_SUGGESTION_INSTRUCTION;
        }
      }
    }
  }

  const systemPrompt = BASE_PROMPT + genderInstruction + topicBlock + contextBlock + cognitiveSuggestion;

  return { systemPrompt, intent, phase };
}
