import type Database from "better-sqlite3";
import { runPsychologistAgent } from "./agent";
import { queryAll, queryOne as pgQueryOne } from "../../db.pg";

// ── Types ──────────────────────────────────────────────────────

export interface PsychologistTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PsychologistState {
  user_id: number;
  turns: PsychologistTurn[];
  turn_count: number;
  // Mandatory question tracking
  asked_appearance: boolean;
  asked_dealbreakers: boolean;       // always last
  asked_last_relationship: boolean;
  // Return-to-conversation tracking
  returned_at_turn: number;
  // Forced question tracking
  forced_questions: Set<string>;
}

export interface PsychologistTurnResult {
  assistant_message: string;
  turn_count: number;
}

// ── Constants ──────────────────────────────────────────────────

const PSYCH_GUIDE = "psychologist";
const MAX_QUESTIONS = 12;
const MIN_TURNS_AFTER_RETURN = 5;

// ── Trait-to-topic mapping ─────────────────────────────────────
// Focused traits + Big Five + Schwartz values model

const TRAIT_TO_TOPIC: Record<string, string> = {
  // ── Requested specific traits ──
  emotional_stability: "יציבות רגשית / התמודדות עם לחץ וקונפליקט",
  family_orientation: "חשיבות משפחה",
  career_prestige: "קריירה / רמת השכלה / יוקרה מקצועית",
  deal_breakers: "דיל ברייקרס / קווים אדומים מוחלטים",
  family_of_origin_closeness: "קרבה למשפחת המוצא",
  serious_relationship_intent: "מוכנות לקשר רציני",

  // ── Big Five personality traits ──
  openness_to_experience: "פתיחות לחוויות חדשות / סקרנות / יצירתיות",
  conscientiousness: "מצפוניות / סדר / אחריות / תכנון",
  extraversion: "מוחצנות / אנרגיה חברתית / חיפוש גירויים",
  agreeableness: "נעימות / אמפתיה / שיתופיות / אמון באחרים",
  neuroticism: "רגישות רגשית / נטייה לחרדה / תנודתיות רגשית",

  // ── Schwartz values model ──
  self_direction: "עצמאות / חופש בחירה / יצירתיות",
  stimulation: "חיפוש גירויים / ריגוש / חידוש",
  hedonism: "הנאה / סיפוק חושי / תענוג",
  achievement: "הישגיות / הצלחה / שאפתנות",
  power: "כוח / סטטוס / שליטה / השפעה",
  security: "ביטחון / יציבות / סדר",
  conformity_value: "ציות לנורמות / ריסון עצמי / כיבוד כללים",
  tradition: "מסורת / דת / כבוד למנהגים",
  benevolence: "נדיבות / דאגה לקרובים / נאמנות",
  universalism: "אוניברסליות / צדק חברתי / סובלנות / איכות סביבה",
};

function traitToTopic(name: string): string {
  return TRAIT_TO_TOPIC[name] || name.replace(/_/g, " ");
}

// ── Message persistence ────────────────────────────────────────

function persistMessage(db: Database.Database, userId: number, role: string, content: string): void {
  db.prepare(
    "INSERT INTO conversation_messages (user_id, role, content, guide) VALUES (?, ?, ?, ?)"
  ).run(userId, role, content, PSYCH_GUIDE);
}

// ── Covered topics (from DB) ───────────────────────────────────

/**
 * Reads from pg (user_traits + trait_definitions were migrated in Phase 2).
 * The `_db` sqlite handle is kept in the signature for caller compatibility
 * but is not used here.
 */
async function getCoveredTopics(
  _db: Database.Database,
  userId: number
): Promise<{ covered: string[]; weak: string[] }> {
  const internalRows = await queryAll<{ internal_name: string; confidence: number }>(
    `SELECT td.internal_name, ut.confidence
     FROM user_traits ut
     JOIN trait_definitions td ON td.id = ut.trait_definition_id
     WHERE ut.user_id = $1 AND td.is_active = TRUE`,
    [userId]
  );

  const covered = internalRows
    .filter(r => r.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map(r => traitToTopic(r.internal_name));

  const weak = internalRows
    .filter(r => r.confidence > 0 && r.confidence < 0.4)
    .slice(0, 4)
    .map(r => traitToTopic(r.internal_name));

  return { covered, weak };
}

// ── Mandatory question detection ───────────────────────────────

function scanMandatoryQuestions(state: PsychologistState): void {
  for (const t of state.turns) {
    if (t.role !== "assistant") continue;
    const c = t.content;

    // Appearance
    if (c.includes("מראה שלך") || c.includes("מראה") && c.includes("מתאר")
      || c.includes("חזות") || c.includes("תופס") && c.includes("מראה")
      || c.includes("מעטפת החיצונית")) {
      state.asked_appearance = true;
    }
    // Identity / deal-breakers
    if (c.includes("מהותי בזהות") || c.includes("דיל ברייקר") || c.includes("פרט חשוב")
      || c.includes("שחשוב שאדע") || c.includes("זהות שלך") || c.includes("זהות העמוקה")
      || c.includes("חשוב שבן זוג") || c.includes("חשוב שבת זוג")) {
      state.asked_dealbreakers = true;
    }
    // Last relationship
    if (c.includes("יחסים האחרונ") || c.includes("קשר האחרון") || c.includes("הקשר האחרון")
      || c.includes("מערכת יחסים") && (c.includes("אחרונה") || c.includes("קודמת"))
      || c.includes("חסר לך בקשר")) {
      state.asked_last_relationship = true;
    }
  }
}

function getMissingMandatory(state: PsychologistState): string[] {
  const missing: string[] = [];
  if (!state.asked_last_relationship) missing.push("last_relationship");
  if (!state.asked_appearance) missing.push("appearance");
  // dealbreakers always last
  if (!state.asked_dealbreakers) missing.push("dealbreakers");
  return missing;
}

function allMandatoryCovered(state: PsychologistState): boolean {
  return state.asked_appearance && state.asked_dealbreakers && state.asked_last_relationship;
}

// ── Gender helpers ─────────────────────────────────────────────

function isFemaleGender(g?: string | null): boolean {
  return g === "female" || g === "woman" || g === "נקבה";
}

// ── Guidance builder ───────────────────────────────────────────

async function buildGuidance(
  db: Database.Database,
  userId: number,
  state: PsychologistState
): Promise<string> {
  // Returning user: first turn after coming back
  const isReturnFirstTurn = state.returned_at_turn > 0 && state.turn_count === state.returned_at_turn + 1;
  if (isReturnFirstTurn) {
    return [
      "המשתמש/ת חזר/ה לשיחה. הגב/י בקצרה ובחמימות ושאל/י שאלה חדשה.",
      "אסור לכלול בסיכום: מראה חיצוני, אינטליגנציה, מצב תעסוקתי, תכונות רגישות.",
    ].join("\n");
  }

  // Early turns — let the prompt guide naturally
  if (state.turn_count <= 3) {
    return "";
  }

  const lines: string[] = [];
  const topics = await getCoveredTopics(db, userId);

  // Already covered
  if (topics.covered.length > 0) {
    lines.push(`נושאים שכבר כוסו (אסור לשאול עליהם שוב): ${topics.covered.join(", ")}`);
  }

  // Weak traits
  if (topics.weak.length > 0) {
    lines.push(`נושאים חלשים (צריכים חיזוק מזווית חדשה): ${topics.weak.join(", ")}`);
  }

  // Mandatory question status
  const missing = getMissingMandatory(state);
  if (missing.length > 0) {
    const labels: Record<string, string> = {
      last_relationship: "שאלת מערכת יחסים אחרונה",
      appearance: "שאלת מראה",
      dealbreakers: "שאלת זהות/דיל ברייקרס (חובה אחרונה!)",
    };
    const missingLabels = missing.map(m => labels[m] || m).join(", ");
    lines.push(`שאלות חובה שעדיין לא נשאלו: ${missingLabels}`);

    // Urgency
    const turnsInSession = state.returned_at_turn > 0
      ? state.turn_count - state.returned_at_turn
      : state.turn_count;
    const turnsLeft = MAX_QUESTIONS - turnsInSession;
    if (turnsLeft <= missing.length + 2) {
      lines.push(`דחוף: נשארו רק ${turnsLeft} תורות. חובה לשאול שאלת חובה עכשיו.`);
    }

    if (missing.includes("dealbreakers") && missing.length === 1) {
      lines.push("זו השאלה האחרונה שצריך לשאול — שאלת הזהות/דיל ברייקרס. שאל אותה עכשיו.");
    }
  }

  return lines.join("\n");
}

// ── Opening message ────────────────────────────────────────────

export async function generatePsychologistOpening(
  db: Database.Database,
  userId: number
): Promise<{ message: string; state: PsychologistState; isReturning: boolean }> {
  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [userId]);
  const userName = user?.first_name || "there";

  const existingUserMessages = db.prepare(
    "SELECT COUNT(*) as c FROM conversation_messages WHERE user_id = ? AND role = 'user' AND guide = ?"
  ).get(userId, PSYCH_GUIDE) as { c: number };
  const isReturning = existingUserMessages.c > 0;

  let introMessage: string;
  if (isReturning) {
    const isFem = isFemaleGender(user?.gender);
    const ready = isFem ? "מוכנה" : "מוכן";
    introMessage = `היי ${userName}, כיף שחזרת! נמשיך מאיפה שהפסקנו? ${ready}?`;
  } else {
    const isFem = isFemaleGender(user?.gender);
    const lfFem = user?.looking_for_gender === "female" || user?.looking_for_gender === "woman";
    const lfMal = user?.looking_for_gender === "male" || user?.looking_for_gender === "man";
    const ready = isFem ? "מוכנה" : "מוכן";
    const partnerTerm = lfMal ? "בן הזוג" : lfFem ? "בת הזוג" : "בן/בת הזוג";
    const partnerFit = lfMal ? "שהכי מתאים לך" : lfFem ? "שהכי מתאימה לך" : "שמתאים/ה לך";
    const talkFreely = isFem ? "דברי" : "דבר";
    const youKnow = isFem ? "שתדעי" : "שתדע";
    const open = isFem ? "פתוחה" : "פתוח";
    introMessage = [
      `היי ${userName}, אני המלווה שלך בתהליך 🙂`,
      `כדי שאוכל לדייק ולמצוא לך את ${partnerTerm} ${partnerFit}, אני רוצה שנכיר קצת יותר לעומק.`,
      `חשוב לי ${youKnow} — השיחה הזו היא לעיניי בלבד, שום דבר ממה שנאמר כאן לא יופיע בפרופיל שלך.`,
      `זה המקום שלך להיות הכי ${open} שיש. פשוט ${talkFreely} בחופשיות.`,
      `${ready}?`,
    ].join("\n");
  }

  // Persist intro (skip duplicates)
  const lastMsg = db.prepare(
    "SELECT content FROM conversation_messages WHERE user_id = ? AND role = 'assistant' AND guide = ? ORDER BY created_at DESC, id DESC LIMIT 1"
  ).get(userId, PSYCH_GUIDE) as { content: string } | undefined;
  const lastIsIntro = lastMsg && (
    lastMsg.content.includes("אני המלווה שלך") ||
    lastMsg.content.includes("כיף שחזרת")
  );
  if (!lastIsIntro) {
    persistMessage(db, userId, "assistant", introMessage);
  }

  // Load turns
  let turns: PsychologistTurn[] = [];
  if (isReturning) {
    const dbMessages = db.prepare(
      "SELECT role, content FROM conversation_messages WHERE user_id = ? AND guide = ? ORDER BY created_at ASC, id ASC"
    ).all(userId, PSYCH_GUIDE) as { role: string; content: string }[];
    turns = dbMessages.map(m => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    }));
  } else {
    turns = [{ role: "assistant", content: introMessage }];
  }

  const turnCount = isReturning ? existingUserMessages.c : 0;

  const state: PsychologistState = {
    user_id: userId,
    turns,
    turn_count: turnCount,
    asked_appearance: false,
    asked_dealbreakers: false,
    asked_last_relationship: false,
    returned_at_turn: isReturning ? turnCount : 0,
    forced_questions: new Set(),
  };

  // Scan existing turns
  if (isReturning) {
    const allMsgs = db.prepare(
      "SELECT content FROM conversation_messages WHERE user_id = ? AND role = 'assistant' AND guide = ? ORDER BY created_at ASC"
    ).all(userId, PSYCH_GUIDE) as { content: string }[];
    const scanState = { ...state, turns: allMsgs.map(m => ({ role: "assistant" as const, content: m.content })) };
    scanMandatoryQuestions(scanState);
    state.asked_appearance = scanState.asked_appearance;
    state.asked_dealbreakers = scanState.asked_dealbreakers;
    state.asked_last_relationship = scanState.asked_last_relationship;
  }

  return { message: introMessage, state, isReturning };
}

// ── Main message processing ────────────────────────────────────

export async function processPsychologistMessage(
  db: Database.Database,
  state: PsychologistState,
  userMessage: string
): Promise<{ result: PsychologistTurnResult; state: PsychologistState }> {
  const userId = state.user_id;

  // 1. Record user message
  state.turns.push({ role: "user", content: userMessage });
  state.turn_count++;
  persistMessage(db, userId, "user", userMessage);

  // 2. Detect frustration
  const msgLower = userMessage.trim();
  const isRepetitionSignal = msgLower.includes("כבר שאלת") || msgLower.includes("כבר דיברנו")
    || msgLower.includes("חפרת") || msgLower === "די" || msgLower.includes("אותו דבר");
  if (isRepetitionSignal) {
    const missing = getMissingMandatory(state);
    for (const m of missing) state.forced_questions.add(m);
  }

  // 3. Scan all psychologist messages for mandatory coverage
  {
    const allMsgs = db.prepare(
      "SELECT content FROM conversation_messages WHERE user_id = ? AND role = 'assistant' AND guide = ? ORDER BY created_at ASC"
    ).all(userId, PSYCH_GUIDE) as { content: string }[];
    const scanState = { ...state, turns: allMsgs.map(m => ({ role: "assistant" as const, content: m.content })) };
    scanMandatoryQuestions(scanState);
    state.asked_appearance = scanState.asked_appearance;
    state.asked_dealbreakers = scanState.asked_dealbreakers;
    state.asked_last_relationship = scanState.asked_last_relationship;
  }

  // 4. Check end conditions
  const turnsInSession = state.returned_at_turn > 0
    ? state.turn_count - state.returned_at_turn
    : state.turn_count;
  const hitQuestionLimit = turnsInSession >= MAX_QUESTIONS;
  const returnGuardMet = state.returned_at_turn > 0
    ? (state.turn_count - state.returned_at_turn) >= MIN_TURNS_AFTER_RETURN
    : true;
  const mandatoriesDone = allMandatoryCovered(state);
  const hardLimitReached = turnsInSession >= MAX_QUESTIONS + 4;

  // 5. Force mandatory questions if needed
  const wantToEnd = hitQuestionLimit && returnGuardMet;
  let forcedGuidance = "";
  if (wantToEnd && !mandatoriesDone) {
    const missing = getMissingMandatory(state);
    const notYetForced = missing.filter(m => !state.forced_questions.has(m));

    if (notYetForced.length === 0) {
      state.asked_appearance = true;
      state.asked_dealbreakers = true;
      state.asked_last_relationship = true;
    } else {
      const next = notYetForced.find(m => m !== "dealbreakers") || "dealbreakers";
      state.forced_questions.add(next);

      if (next === "last_relationship") {
        forcedGuidance = `MANDATORY: שאל עכשיו על מערכת היחסים האחרונה. התאם מגדרית.`;
      } else if (next === "appearance") {
        forcedGuidance = `MANDATORY: שאל עכשיו על מראה. התאם מגדרית.`;
      } else if (next === "dealbreakers") {
        forcedGuidance = `MANDATORY: זו השאלה האחרונה — שאל את שאלת הזהות/דיל ברייקרס. התאם מגדרית.`;
      }
    }
  }

  // 6. Build guidance
  const guidance = forcedGuidance || (await buildGuidance(db, userId, state));

  // 7. Build conversation history
  const history = state.turns
    .map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  // 8. Load user data (from pg)
  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [userId]);

  // 9. Call agent
  const assistantMessage = await runPsychologistAgent(
    {
      user_name: user?.first_name || "there",
      user_age: user?.age,
      user_gender: user?.gender,
      user_looking_for: user?.looking_for_gender,
      user_city: user?.city,
      conversation_history: history,
      turn_number: state.turn_count,
      guidance_block: guidance,
    },
    userId,
    "psychologist_turn"
  );

  // 10. Save assistant message
  state.turns.push({ role: "assistant", content: assistantMessage });
  persistMessage(db, userId, "assistant", assistantMessage);

  const missing = getMissingMandatory(state);
  console.log(`[psychologist] User ${userId} turn ${state.turn_count} (session=${turnsInSession}), missing=[${missing.join(",")}]`);

  return {
    result: {
      assistant_message: assistantMessage,
      turn_count: state.turn_count,
    },
    state,
  };
}
