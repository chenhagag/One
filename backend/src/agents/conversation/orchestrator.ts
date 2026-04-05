import type Database from "better-sqlite3";
import { runConversationAgent, type ConversationContext } from "./agent";
import { runAnalysisAgent, buildAnalysisInput, saveAnalysisToDb } from "../analysis";
import type { AnalysisAgentOutput } from "../analysis";

// ── Types ──────────────────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// Phase tracks where the conversation is in its lifecycle
export type ConversationPhase =
  | "chatting"      // normal conversation
  | "summarizing"   // assistant sent a summary, waiting for user confirmation
  | "confirmed"     // user confirmed the summary — ready for results
  | "paused";       // user chose to continue later

export interface ConversationState {
  user_id: number;
  turns: ConversationTurn[];
  turn_count: number;            // user turns only
  last_analysis: AnalysisAgentOutput | null;
  last_analysis_at_turn: number; // user turn when analysis last ran
  phase: ConversationPhase;
  // Background analysis tracking
  analysis_in_flight: boolean;
  analysis_scheduled_at: number;
  // Mandatory question tracking
  asked_appearance: boolean;     // "יש משהו במראה שלך..."
  asked_dealbreakers: boolean;   // "יש משהו חשוב עלייך..."
}

export interface NextTurnResult {
  assistant_message: string;
  analysis_ran: boolean;
  analysis_in_background: boolean;
  phase: ConversationPhase;
  coverage_pct: number;
  readiness_score: number;
  turn_count: number;
}

// ── Coverage calculation (per-trait required_confidence) ───────

export interface CoverageResult {
  coverage_pct: number;         // % of traits that meet their required_confidence
  met_count: number;            // traits meeting required_confidence
  below_count: number;          // traits assessed but below required_confidence
  missing_count: number;        // traits not assessed at all
  total_count: number;
  profile_complete: boolean;    // ALL traits meet their required_confidence
  readiness_score: number;      // weighted readiness 0.0-1.0: sum(w*min(conf/req,1)) / sum(w)
  ready_for_matching: boolean;  // readiness_score >= 0.9
  unmet_traits: string[];       // internal_names of traits not yet meeting their threshold
}

export function computeCoverage(db: Database.Database, userId: number): CoverageResult {
  const EXTERNAL_REQ_CONF = 0.5;

  // Internal traits
  const internalDefs = db.prepare(
    "SELECT id, internal_name, required_confidence, weight FROM trait_definitions WHERE is_active = 1"
  ).all() as { id: number; internal_name: string; required_confidence: number; weight: number }[];

  const userTraits = db.prepare(
    "SELECT trait_definition_id, confidence FROM user_traits WHERE user_id = ?"
  ).all(userId) as { trait_definition_id: number; confidence: number }[];

  const traitConfMap = new Map(userTraits.map(t => [t.trait_definition_id, t.confidence]));

  // External traits
  const externalDefs = db.prepare(
    "SELECT id, internal_name, weight FROM look_trait_definitions WHERE is_active = 1"
  ).all() as { id: number; internal_name: string; weight: number }[];

  const userLookTraits = db.prepare(`
    SELECT look_trait_definition_id,
      desired_value_confidence as d_conf,
      personal_value_confidence as p_conf
    FROM user_look_traits WHERE user_id = ?
  `).all(userId) as { look_trait_definition_id: number; d_conf: number | null; p_conf: number | null }[];

  const lookConfMap = new Map(userLookTraits.map(t => [t.look_trait_definition_id, Math.max(t.d_conf ?? 0, t.p_conf ?? 0)]));

  let met = 0, below = 0, missing = 0;
  let weightedReadinessSum = 0, totalWeight = 0;
  const unmet: string[] = [];

  // Score internal traits
  for (const def of internalDefs) {
    const reqConf = def.required_confidence || 0.5;
    const w = def.weight;  // use actual weight, do NOT default 0→1

    const conf = traitConfMap.get(def.id);
    if (conf == null) {
      missing++;
      if (w > 0) totalWeight += w; // only count weighted traits in denominator
      if (w >= 3) unmet.push(def.internal_name);
    } else if (conf >= reqConf) {
      met++;
      if (w > 0) { totalWeight += w; weightedReadinessSum += w * 1.0; }
    } else {
      below++;
      if (w > 0) { totalWeight += w; weightedReadinessSum += w * Math.min(conf / reqConf, 1.0); }
      if (w >= 3) unmet.push(def.internal_name);
    }
  }

  // Score external traits
  for (const def of externalDefs) {
    const reqConf = EXTERNAL_REQ_CONF;
    const w = def.weight;  // use actual weight, do NOT default 0→1

    const conf = lookConfMap.get(def.id);
    if (conf == null || conf === 0) {
      missing++;
      if (w > 0) totalWeight += w;
      if (w >= 20) unmet.push(def.internal_name);
    } else if (conf >= reqConf) {
      met++;
      if (w > 0) { totalWeight += w; weightedReadinessSum += w * 1.0; }
    } else {
      below++;
      if (w > 0) { totalWeight += w; weightedReadinessSum += w * Math.min(conf / reqConf, 1.0); }
      if (w >= 20) unmet.push(def.internal_name);
    }
  }

  const total = internalDefs.length + externalDefs.length;
  const coverage = total > 0 ? Math.round((met / total) * 100) : 0;
  const readinessScore = totalWeight > 0
    ? Math.round((weightedReadinessSum / totalWeight) * 1000) / 1000  // 3 decimal places
    : 0;

  const profileComplete = met === total && total > 0;
  const readyForMatching = readinessScore >= 0.9;

  return {
    coverage_pct: coverage,
    met_count: met,
    below_count: below,
    missing_count: missing,
    total_count: total,
    profile_complete: profileComplete,
    readiness_score: readinessScore,
    ready_for_matching: readyForMatching,
    unmet_traits: unmet,
  };
}

/** Persist readiness_score and is_matchable on the user row */
function updateUserReadiness(db: Database.Database, userId: number, cov: CoverageResult): void {
  db.prepare(
    "UPDATE users SET readiness_score = ?, is_matchable = ? WHERE id = ?"
  ).run(cov.readiness_score, cov.ready_for_matching ? 1 : 0, userId);
}

// ── Checkpoint logic ───────────────────────────────────────────

const FIRST_CHECKPOINT = 4;
const CHECKPOINT_INTERVAL = 2;
const MAX_QUESTIONS = 10;  // temp rule: stop after 10 agent questions

function shouldRunAnalysis(state: ConversationState): boolean {
  const { turn_count, last_analysis_at_turn } = state;
  if (turn_count >= FIRST_CHECKPOINT && last_analysis_at_turn === 0) return true;
  if (last_analysis_at_turn > 0 && turn_count - last_analysis_at_turn >= CHECKPOINT_INTERVAL) return true;
  return false;
}

// ── Guidance builder ───────────────────────────────────────────

// Map technical trait names to conversational question areas
const TRAIT_TO_TOPIC: Record<string, string> = {
  cognitive_profile: "intellectual style / how they think",
  emotional_stability: "how they handle stress or conflict",
  neuroticism: "anxiety level / emotional reactivity",
  family_orientation: "family importance / wanting kids",
  party_orientation: "nightlife / going out",
  luxury_orientation: "lifestyle expectations / materialism",
  extrovert: "social energy / introvert vs extrovert",
  career_prestige: "career / education level / professional prestige",
  intellectualism: "intellectual depth / abstract thinking",
  analytical_tendency: "how they make decisions",
  seriousness: "how serious vs playful they are",
  goofiness: "humor style / silliness",
  self_awareness: "self-reflection / emotional maturity",
  humor: "sense of humor / what makes them laugh",
  political_orientation: "political views",
  social_involvement: "community involvement / causes",
  positivity: "optimism / outlook on life",
  warmth: "warmth / affection style",
  openness: "openness to new experiences",
  childishness: "maturity level",
  value_rigidity: "flexibility vs strong convictions",
  loves_animals: "attitude toward animals / pets",
  zionism: "relationship to Israel / Zionism",
  political_leaning: "political direction (left/right)",
  vegetarianism: "dietary values / vegetarian",
  work_ethic: "ambition / career drive",
  good_kid: "responsibility / reliability",
  appearance_sensitivity: "how much looks matter to them",
  advantages: "potential advantages / unique positive qualities",
  deal_breakers: "absolute deal-breakers in a partner",
  hipsterishness: "cultural style / hipster tendencies",
  tel_aviv_style: "urban / Tel Aviv lifestyle",
  mainstream_style: "mainstream vs alternative",
  nerdiness: "nerdiness / intellectual interests",
  hippie_style: "alternative / spiritual lifestyle",
  soviet_style: "eastern European cultural background",
};

function traitToTopic(name: string): string {
  return TRAIT_TO_TOPIC[name] || name.replace(/_/g, " ");
}

function buildGuidance(analysis: AnalysisAgentOutput | null, turnCount: number, cov?: CoverageResult): string {
  if (!analysis) {
    // Pre-analysis: structured turn-by-turn guidance
    if (turnCount <= 1) return "Ask about their work/career and what energizes them day-to-day.";
    if (turnCount === 2) return "Ask about their values — what matters most to them in life or relationships.";
    if (turnCount === 3) return "Ask about what they are looking for in a partner — personality, energy, values.";
    return "Ask about physical attraction — what kind of look or presence draws them in.";
  }

  const lines: string[] = [];

  // Already covered (so agent doesn't re-ask)
  const assessed = analysis.internal_traits;
  if (assessed.length > 0) {
    const known = assessed
      .filter(t => t.confidence >= 0.4)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(t => traitToTopic(t.internal_name))
      .join(", ");
    if (known) lines.push(`Already covered (do NOT re-ask): ${known}`);
  }

  // Unmet traits from coverage check — these are the real priority
  if (cov && cov.unmet_traits.length > 0) {
    const topics = cov.unmet_traits
      .filter(m => !["toxicity_score", "trollness", "sexual_identity"].includes(m))
      .slice(0, 6)
      .map(traitToTopic);
    if (topics.length > 0) {
      lines.push(`PRIORITY — these traits still need stronger signal. Ask about one: ${topics.join(", ")}`);
    }
  }

  // Also include analysis-reported missing traits as secondary
  const missing = analysis.missing_traits;
  if (missing.length > 0) {
    const secondary = missing
      .filter(m => !["toxicity_score", "trollness", "sexual_identity"].includes(m))
      .filter(m => !(cov?.unmet_traits || []).includes(m)) // don't duplicate
      .slice(0, 4)
      .map(traitToTopic);
    if (secondary.length > 0) {
      lines.push(`Also missing: ${secondary.join(", ")}`);
    }
  }

  // Weak traits (assessed but below their required confidence)
  const weakTraits = assessed
    .filter(t => t.confidence > 0 && t.confidence < 0.4)
    .slice(0, 4)
    .map(t => traitToTopic(t.internal_name));
  if (weakTraits.length > 0) {
    lines.push(`Weak (needs refinement from a new angle): ${weakTraits.join(", ")}`);
  }

  // External trait gaps
  const hasDesired = analysis.external_traits.some(t => t.desired_value);
  const hasPersonal = analysis.external_traits.some(t => t.personal_value);
  if (!hasDesired) lines.push("MISSING: physical attraction / what kind of look draws them in");
  if (!hasPersonal) lines.push("MISSING: their own appearance / style / presence");

  // Probes from analysis agent
  if (analysis.recommended_probes.length > 0) {
    lines.push(`Suggested questions: ${analysis.recommended_probes.slice(0, 3).join("; ")}`);
  }

  return lines.join("\n");
}

// ── Summary builder for the confirmation step ──────────────────

function buildProfileSummary(analysis: AnalysisAgentOutput): string {
  const lines: string[] = [];

  // Personality highlights (high confidence traits)
  const personality = analysis.internal_traits
    .filter(t => t.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
    .map(t => `${t.internal_name.replace(/_/g, " ")} (${t.score > 60 ? "high" : t.score > 40 ? "moderate" : "low"})`)
    .join(", ");
  if (personality) lines.push(`Personality: ${personality}`);

  // What they want in a partner
  const partnerTraits = analysis.internal_traits
    .filter(t => t.weight_for_match != null && t.weight_for_match > 0)
    .map(t => t.internal_name.replace(/_/g, " "))
    .join(", ");
  if (partnerTraits) lines.push(`Important in a partner: ${partnerTraits}`);

  // External preferences
  const desired = analysis.external_traits
    .filter(t => t.desired_value)
    .map(t => `${t.internal_name.replace(/_/g, " ")}: ${t.desired_value}`)
    .join(", ");
  if (desired) lines.push(`Physical preferences: ${desired}`);

  // Their own appearance
  const personal = analysis.external_traits
    .filter(t => t.personal_value)
    .map(t => `${t.internal_name.replace(/_/g, " ")}: ${t.personal_value}`)
    .join(", ");
  if (personal) lines.push(`Their appearance: ${personal}`);

  return lines.join("\n");
}

function getStage(turnCount: number, profileComplete: boolean, phase: ConversationPhase): ConversationContext["stage"] {
  if (phase === "summarizing") return "closing";
  if (profileComplete) return "closing";
  if (turnCount <= 3) return "early";
  if (turnCount <= 7) return "middle";
  return "later";
}

// ── Conversation history formatting ────────────────────────────

// Full conversation history — the agent needs it to avoid repeating questions.
// Assistant messages are truncated to save tokens (user messages are kept in full
// because they contain the actual information the agent must not re-ask about).
function formatHistory(turns: ConversationTurn[]): string {
  // Full history — both roles untruncated so the agent can see what it already asked
  return turns.map(t => {
    const label = t.role === "user" ? "User" : "Assistant";
    return `${label}: ${t.content}`;
  }).join("\n\n");
}

// ── Build transcript for analysis agent ────────────────────────

function buildAnalysisTranscript(db: Database.Database, userId: number): string {
  // Try full conversation (both roles) from conversation_messages
  const fullMessages = db.prepare(
    "SELECT role, content FROM conversation_messages WHERE user_id = ? ORDER BY created_at ASC, id ASC"
  ).all(userId) as { role: string; content: string }[];

  if (fullMessages.length > 0) {
    return fullMessages
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
  }

  // Fallback: old profiles table (user messages only)
  const allAnswers = db.prepare(
    "SELECT raw_answer FROM profiles WHERE user_id = ? ORDER BY created_at ASC"
  ).all(userId) as { raw_answer: string }[];

  return allAnswers
    .map((a, i) => `[Round ${i + 1}]\nUser: ${a.raw_answer}`)
    .join("\n\n");
}

// ── Persist a message to conversation_messages ──────────────────

function persistMessage(db: Database.Database, userId: number, role: string, content: string): void {
  db.prepare(
    "INSERT INTO conversation_messages (user_id, role, content) VALUES (?, ?, ?)"
  ).run(userId, role, content);
}

// ── Background analysis runner ─────────────────────────────────

// Fires analysis in the background without blocking the caller.
// When done, updates state.last_analysis and saves to DB.
// The NEXT turn's processUserMessage will see the updated analysis.
function fireBackgroundAnalysis(
  db: Database.Database,
  state: ConversationState,
): void {
  const userId = state.user_id;
  const turn = state.turn_count;

  state.analysis_in_flight = true;
  state.analysis_scheduled_at = turn;

  console.log(`[orchestrator] Background analysis started at turn ${turn} for user ${userId}`);

  const transcript = buildAnalysisTranscript(db, userId);
  const input = buildAnalysisInput(db, transcript);

  runAnalysisAgent(input, userId, "analysis")
    .then((output) => {
      saveAnalysisToDb(db, userId, output);

      db.prepare(`
        UPDATE profiles SET analysis_json = ?
        WHERE user_id = ? AND id = (SELECT MAX(id) FROM profiles WHERE user_id = ?)
      `).run(JSON.stringify(output), userId, userId);

      // Update state (still referenced by the conversationStates Map)
      state.last_analysis = output;
      state.last_analysis_at_turn = turn;
      state.analysis_in_flight = false;

      const cov = computeCoverage(db, userId);
      console.log(`[orchestrator] Background analysis done for user ${userId}: coverage=${cov.coverage_pct}%, readiness=${cov.readiness_score}, complete=${cov.profile_complete} (met=${cov.met_count}, below=${cov.below_count}, missing=${cov.missing_count})`);
    })
    .catch((err) => {
      console.error(`[orchestrator] Background analysis failed for user ${userId}:`, err);
      state.analysis_in_flight = false;
    });
}

// ── Main orchestration function ────────────────────────────────

export async function processUserMessage(
  db: Database.Database,
  state: ConversationState,
  userMessage: string
): Promise<{ result: NextTurnResult; state: ConversationState }> {

  const userId = state.user_id;

  // 1. Record user message
  state.turns.push({ role: "user", content: userMessage });
  state.turn_count++;

  // 2. Store in both profiles (legacy) and conversation_messages (full history)
  db.prepare(
    "INSERT INTO profiles (user_id, raw_answer, analysis_json) VALUES (?, ?, '{}')"
  ).run(userId, userMessage);
  persistMessage(db, userId, "user", userMessage);

  // 3. If we're in summarizing phase, the user is responding to the summary → confirm
  if (state.phase === "summarizing") {
    state.phase = "confirmed";
    const userRow = db.prepare("SELECT gender, looking_for_gender FROM users WHERE id = ?").get(userId) as any;
    const closing = getFixedClosing({ gender: userRow?.gender, lookingFor: userRow?.looking_for_gender });
    state.turns.push({ role: "assistant", content: closing });
    persistMessage(db, userId, "assistant", closing);
    const cov = computeCoverage(db, userId);
    updateUserReadiness(db, userId, cov);

    return {
      result: {
        assistant_message: closing,
        analysis_ran: false,
        analysis_in_background: false,
        phase: "confirmed",
        coverage_pct: cov.coverage_pct,
        readiness_score: cov.readiness_score,
        turn_count: state.turn_count,
      },
      state,
    };
  }

  // 4. Check if a background analysis should be kicked off (non-blocking)
  let analysisKicked = false;
  if (shouldRunAnalysis(state) && !state.analysis_in_flight) {
    fireBackgroundAnalysis(db, state);
    analysisKicked = true;
  }

  // 5. Use the LATEST COMPLETED analysis for guidance
  const analysis = state.last_analysis;

  // 6. Compute coverage + readiness from DB
  const cov = computeCoverage(db, userId);
  const coveragePct = cov.coverage_pct;

  // Persist readiness_score and is_matchable on every turn that has coverage data
  if (cov.readiness_score > 0) {
    updateUserReadiness(db, userId, cov);
  }

  // 7. Detect if mandatory questions were asked (scan assistant messages)
  if (!state.asked_appearance || !state.asked_dealbreakers) {
    for (const t of state.turns) {
      if (t.role !== "assistant") continue;
      const lc = t.content.toLowerCase();
      if (lc.includes("מראה") || lc.includes("סטייל") || lc.includes("חזות") || lc.includes("מבנה גוף")) {
        state.asked_appearance = true;
      }
      if (lc.includes("דיל ברייקר") || lc.includes("שוברי עסקאות") || lc.includes("דברים שחשוב") || lc.includes("ערכים") && lc.includes("זהות")) {
        state.asked_dealbreakers = true;
      }
    }
  }

  // 8. Check if we should move to summarizing phase
  const hitQuestionLimit = state.turn_count >= MAX_QUESTIONS;
  const canEnd = cov.profile_complete || hitQuestionLimit;

  // If we hit the limit but mandatory questions weren't asked, force them instead of ending
  if (canEnd && state.phase === "chatting" && (!state.asked_appearance || !state.asked_dealbreakers)) {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    let forcedQuestion = "";
    if (!state.asked_appearance) {
      forcedQuestion = "MANDATORY: You MUST ask the appearance/presence question now. Ask in Hebrew: יש משהו במראה שלך, בסטייל או באנרגיה שלך, שחשוב שניקח בחשבון בשידוך?";
    } else {
      forcedQuestion = "MANDATORY: You MUST ask the deal-breakers/identity question now. Ask in Hebrew: יש משהו חשוב עלייך — באורח החיים, בזהות, בערכים, או דברים שהם דיל ברייקרס מבחינתך — שחשוב שאדע?";
    }

    const ctx: ConversationContext = {
      user_name: user?.first_name || "there",
      user_age: user?.age,
      user_gender: user?.gender,
      user_city: user?.city,
      conversation_history: formatHistory(state.turns),
      turn_number: state.turn_count,
      stage: "later",
      coverage_pct: coveragePct,
      guidance_block: forcedQuestion,
    };

    const assistantMessage = await runConversationAgent(ctx, userId, "conversation_turn");
    state.turns.push({ role: "assistant", content: assistantMessage });
    persistMessage(db, userId, "assistant", assistantMessage);

    console.log(`[orchestrator] Forced mandatory question (appearance=${state.asked_appearance}, dealbreakers=${state.asked_dealbreakers}) at turn ${state.turn_count}`);

    return {
      result: {
        assistant_message: assistantMessage,
        analysis_ran: false,
        analysis_in_background: analysisKicked,
        phase: state.phase,
        coverage_pct: coveragePct,
        readiness_score: cov.readiness_score,
        turn_count: state.turn_count,
      },
      state,
    };
  }

  if (canEnd && state.phase === "chatting") {
    state.phase = "summarizing";

    const profileSummary = analysis ? buildProfileSummary(analysis) : "Profile data gathered.";
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;

    const ctx: ConversationContext = {
      user_name: user?.first_name || "there",
      user_age: user?.age,
      user_gender: user?.gender,
      user_city: user?.city,
      conversation_history: formatHistory(state.turns),
      turn_number: state.turn_count,
      stage: "closing",
      coverage_pct: coveragePct,
      guidance_block: `The conversation is ending. Summarize what you learned about the user in a warm, natural way. Include:\n${profileSummary}\n\nThen ask: "זה נשמע נכון? יש משהו שתרצי להוסיף או לתקן?"`,
    };

    const assistantMessage = await runConversationAgent(ctx, userId, "conversation_summary");
    state.turns.push({ role: "assistant", content: assistantMessage });
    persistMessage(db, userId, "assistant", assistantMessage);

    console.log(`[orchestrator] Moving to summary: profile_complete=${cov.profile_complete}, turns=${state.turn_count}, readiness=${cov.readiness_score}`);

    return {
      result: {
        assistant_message: assistantMessage,
        analysis_ran: false,
        analysis_in_background: analysisKicked,
        phase: "summarizing",
        coverage_pct: coveragePct,
        readiness_score: cov.readiness_score,
        turn_count: state.turn_count,
      },
      state,
    };
  }

  // 8. Normal turn — generate assistant response immediately
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  const stage = getStage(state.turn_count, cov.profile_complete, state.phase);
  const guidance = buildGuidance(analysis, state.turn_count, cov);

  const ctx: ConversationContext = {
    user_name: user?.first_name || "there",
    user_age: user?.age,
    user_gender: user?.gender,
    user_city: user?.city,
    conversation_history: formatHistory(state.turns),
    turn_number: state.turn_count,
    stage,
    coverage_pct: coveragePct,
    guidance_block: guidance,
  };

  const assistantMessage = await runConversationAgent(ctx, userId, "conversation_turn");
  state.turns.push({ role: "assistant", content: assistantMessage });
  persistMessage(db, userId, "assistant", assistantMessage);

  return {
    result: {
      assistant_message: assistantMessage,
      analysis_ran: false,
      analysis_in_background: analysisKicked,
      phase: state.phase,
      coverage_pct: coveragePct,
      readiness_score: cov.readiness_score,
      turn_count: state.turn_count,
    },
    state,
  };
}

// ── Gender-adapted fixed messages ──────────────────────────────

interface GenderContext {
  gender?: string | null;         // user's gender
  lookingFor?: string | null;     // what gender they seek
}

function isFemaleGender(g?: string | null): boolean {
  return g === "female" || g === "woman" || g === "נקבה";
}
function isMaleGender(g?: string | null): boolean {
  return g === "male" || g === "man" || g === "זכר";
}

function genderForms(ctx: GenderContext) {
  const fem = isFemaleGender(ctx.gender);
  const mal = isMaleGender(ctx.gender);

  // Forms addressing the user
  const ready = fem ? "מוכנה" : mal ? "מוכן" : "מוכן/ה";
  const youAnswer = fem ? "שתעני" : mal ? "שתענה" : "שתענה/י";
  const youKnow = fem ? "שתדעי" : mal ? "שתדע" : "שתדע/י";
  const yourSelf = "אותך"; // same in both genders in this context

  // "The one" — depends on who they're looking for
  const seeksFemale = isFemaleGender(ctx.lookingFor);
  const seeksMale = isMaleGender(ctx.lookingFor);
  let theOne: string;
  if (seeksMale && !seeksFemale) theOne = "את האחד שמתאים לך";
  else if (seeksFemale && !seeksMale) theOne = "את האחת שמתאימה לך";
  else theOne = "את האדם שמתאים לך";

  // Matchmaker self-reference (always male persona)
  const iKnow = "שאני מכיר";

  return { ready, youAnswer, youKnow, yourSelf, theOne, iKnow };
}

function getFixedIntro(userName: string, ctx: GenderContext): string {
  const g = genderForms(ctx);
  return [
    `היי ${userName}, אני השדכן שלך 😊`,
    `כדי למצוא לך מישהו מתאים ברמה הכי מדויקת שיש, אני צריך להכיר ${g.yourSelf} לעומק.`,
    `אשמח לשאול ${g.yourSelf} כמה שאלות — ככל ${g.youAnswer} יותר בהרחבה, בפתיחות ובכנות, נוכל למצוא התאמה מדויקת וחזקה יותר.`,
    `אנחנו לא מתפשרים על איכות, ולכן אוספים כמה שיותר מידע.`,
    `אם השיחה ארוכה לך מדי, תמיד אפשר לעצור ולהמשיך בזמן אחר ;)`,
    `וחשוב ${g.youKnow} — התשובות כאן לא מתפרסמות בפרופיל, הן לעיני בלבד, כדי שאוכל להכיר ${g.yourSelf} לעומק ולמצוא ${g.theOne}.`,
    `${g.ready}?`,
  ].join("\n");
}

function getFixedClosing(ctx: GenderContext): string {
  const g = genderForms(ctx);
  return [
    `מעולה, אני מרגיש ${g.iKnow} ${g.yourSelf} מספיק כדי למצוא ${g.theOne} ברמה העמוקה ביותר.`,
    `${g.ready} להתחיל את התהליך?`,
  ].join("\n");
}

// ── Opening message ────────────────────────────────────────────

export function generateOpeningMessage(
  db: Database.Database,
  userId: number
): { message: string; state: ConversationState } {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  const userName = user?.first_name || "there";
  const gCtx: GenderContext = { gender: user?.gender, lookingFor: user?.looking_for_gender };

  const introMessage = getFixedIntro(userName, gCtx);
  persistMessage(db, userId, "assistant", introMessage);

  const state: ConversationState = {
    user_id: userId,
    turns: [{ role: "assistant", content: introMessage }],
    turn_count: 0,
    last_analysis: null,
    last_analysis_at_turn: 0,
    phase: "chatting",
    analysis_in_flight: false,
    analysis_scheduled_at: 0,
    asked_appearance: false,
    asked_dealbreakers: false,
  };

  return { message: introMessage, state };
}
