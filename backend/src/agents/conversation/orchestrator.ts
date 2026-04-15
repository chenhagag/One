import type Database from "better-sqlite3";
import { runConversationAgent, type ConversationContext } from "./agent";
import { runAnalysisAgent, runCoverageProbe, buildAnalysisInput, saveAnalysisToDb, saveAnalysisRun, loadInternalTraitDefs } from "../analysis";
import type { AnalysisAgentOutput } from "../analysis";
// Guide system removed — single unified conversation

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
  // Return-to-conversation tracking
  returned_at_turn: number;      // turn_count when user returned (0 = new conversation)
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

// Mandatory question detection removed — interviewer uses question bank only, no mandatory tracking.
// Psychologist has its own mandatory tracking in psychologist-orchestrator.ts.

// ── Checkpoint logic ───────────────────────────────────────────

const FIRST_CHECKPOINT = 4;
const CHECKPOINT_INTERVAL = 2;
const MAX_QUESTIONS = 14;  // stop after 14 agent questions
// Guide system removed — using MIN_TURNS_AFTER_RETURN for returning users

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
  self_awareness: "self-reflection / emotional maturity",
  humor: "sense of humor / what makes them laugh",
  social_involvement: "community involvement / causes",
  positivity: "optimism / outlook on life",
  warmth: "warmth / affection style",
  openness: "openness to new experiences",
  childishness: "maturity level",
  value_rigidity: "flexibility vs strong convictions",
  loves_animals: "attitude toward animals / pets",
  vegetarianism: "dietary values / vegetarian",
  good_kid: "responsibility / reliability",
  appearance_sensitivity: "how much looks matter to them",
  advantages: "potential advantages / unique positive qualities",
  deal_breakers: "absolute deal-breakers in a partner",
  hipsterishness: "cultural style / hipster tendencies",
  broad_appeal: "mainstream vs alternative style",
  nerdiness: "nerdiness / intellectual interests",
  hippie_style: "alternative / spiritual lifestyle",
  soviet_style: "eastern European cultural background",
  conformity: "conformity / how much they follow social norms",
  oriental: "eastern/mizrahi cultural style",
  emotional_expressiveness: "emotional expressiveness / sensitivity",
  family_of_origin_closeness: "closeness to family of origin",
  serious_relationship_intent: "readiness for a serious relationship",
  right_wing: "right-wing political orientation",
  left_wing: "left-wing political orientation",
};

function traitToTopic(name: string): string {
  return TRAIT_TO_TOPIC[name] || name.replace(/_/g, " ");
}

// Read "already covered" topics from the DB (user_traits + user_look_traits)
// This replaces the previous reliance on analysis.internal_traits.
function getCoveredTopics(db: Database.Database, userId: number): { covered: string[]; weak: string[]; hasPersonalLook: boolean; hasDesiredLook: boolean } {
  const internalRows = db.prepare(`
    SELECT td.internal_name, ut.confidence
    FROM user_traits ut
    JOIN trait_definitions td ON td.id = ut.trait_definition_id
    WHERE ut.user_id = ? AND td.is_active = 1
  `).all(userId) as { internal_name: string; confidence: number }[];

  const covered = internalRows
    .filter(r => r.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map(r => traitToTopic(r.internal_name));

  const weak = internalRows
    .filter(r => r.confidence > 0 && r.confidence < 0.4)
    .slice(0, 4)
    .map(r => traitToTopic(r.internal_name));

  const lookRow = db.prepare(`
    SELECT
      SUM(CASE WHEN personal_value IS NOT NULL THEN 1 ELSE 0 END) as has_personal,
      SUM(CASE WHEN desired_value IS NOT NULL THEN 1 ELSE 0 END) as has_desired
    FROM user_look_traits WHERE user_id = ?
  `).get(userId) as { has_personal: number; has_desired: number } | undefined;

  return {
    covered,
    weak,
    hasPersonalLook: (lookRow?.has_personal ?? 0) > 0,
    hasDesiredLook: (lookRow?.has_desired ?? 0) > 0,
  };
}

function buildGuidance(
  state: ConversationState
): string {
  // Returning user: first turn after coming back
  const isReturnFirstTurn = state.returned_at_turn > 0 && state.turn_count === state.returned_at_turn + 1;
  if (isReturnFirstTurn) {
    return [
      "המשתמש/ת חזר/ה לשיחה. הגב/י בקצרה ושאל/י שאלה חדשה מבנק השאלות.",
      "אסור לחזור על שאלות שכבר נשאלו.",
    ].join("\n");
  }

  // First turn — start from the question bank
  if (state.turn_count <= 1) {
    return "המשתמש/ת הגיב/ה להודעת הפתיחה. שאל/י שאלה ראשונה מבנק השאלות. התאם/י מגדרית.";
  }

  // Normal turn — just remind not to repeat
  return "המשך/י עם השאלה הבאה מבנק השאלות. אסור לחזור על שאלות שכבר נשאלו. התאם/י מגדרית.";
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

// Builds a unified transcript from all conversation messages for the analyzer.
// Separates interviewer and psychologist histories with clear labels.
export function buildAnalysisTranscript(db: Database.Database, userId: number): string {
  // Both interviewer AND psychologist messages go to the analyzer.
  const interviewerMsgs = db.prepare(
    "SELECT role, content FROM conversation_messages WHERE user_id = ? AND (guide IS NULL OR guide != 'psychologist') ORDER BY created_at ASC, id ASC"
  ).all(userId) as { role: string; content: string }[];

  const psychMsgs = db.prepare(
    "SELECT role, content FROM conversation_messages WHERE user_id = ? AND guide = 'psychologist' ORDER BY created_at ASC, id ASC"
  ).all(userId) as { role: string; content: string }[];

  const parts: string[] = [];

  if (interviewerMsgs.length > 0 && psychMsgs.length > 0) {
    parts.push("הנחיה: נתח את שני התמלילים. השתמש בשיחת המעבדה (חלק 1) להערכת תגובות לסימולציות ודילמות, ובשיחת העומק (חלק 2) להבנת ערכים עמוקים ודפוסים רגשיים. שלב את שניהם לפרופיל אחד מדויק.\n");
  }

  if (interviewerMsgs.length > 0) {
    parts.push("### חלק 1: מעבדת האישיות (סימולציות ודילמות)");
    parts.push(interviewerMsgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n"));
  }

  if (psychMsgs.length > 0) {
    parts.push("\n### חלק 2: שיחת עומק (פסיכולוג)");
    parts.push(psychMsgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n"));
  }

  if (parts.length > 0) return parts.join("\n\n");

  // Fallback: old profiles table
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

// ── Background runners ─────────────────────────────────────────

// Lightweight coverage probe — runs during conversation.
// Fires non-blocking. Populates state.last_analysis with missing_traits + recommended_probes only
// (no scoring). The NEXT turn's guidance uses this signal.
function fireCoverageProbe(
  db: Database.Database,
  state: ConversationState,
): void {
  const userId = state.user_id;
  const turn = state.turn_count;

  state.analysis_in_flight = true;
  state.analysis_scheduled_at = turn;

  console.log(`[orchestrator] Coverage probe started at turn ${turn} for user ${userId}`);

  const transcript = buildAnalysisTranscript(db, userId);
  const internalDefs = loadInternalTraitDefs(db);

  runCoverageProbe(transcript, internalDefs, userId, "coverage_probe")
    .then((probe) => {
      // Build a minimal AnalysisAgentOutput shape so the rest of the orchestrator works unchanged
      const minimal: AnalysisAgentOutput = {
        internal_traits: [],
        external_traits: [],
        missing_traits: probe.missing_traits,
        recommended_probes: probe.recommended_probes,
        profiling_completeness: {
          internal_assessed: 0,
          internal_total: internalDefs.length,
          external_assessed: 0,
          external_total: 0,
          coverage_pct: 0,
          ready_for_matching: false,
          notes: `Coverage probe at turn ${turn}: ${probe.covered_traits.length} covered, ${probe.missing_traits.length} missing`,
        },
      };
      state.last_analysis = minimal;
      state.last_analysis_at_turn = turn;
      state.analysis_in_flight = false;

      console.log(`[orchestrator] Coverage probe done for user ${userId}: covered=${probe.covered_traits.length}, missing=${probe.missing_traits.length}, probes=${probe.recommended_probes.length}`);
    })
    .catch((err) => {
      console.error(`[orchestrator] Coverage probe failed for user ${userId}:`, err);
      state.analysis_in_flight = false;
    });
}

// Full grouped analysis — runs once at the end of the conversation (phase → summarizing).
// AWAITED, not background — the summary message generation depends on it.
async function runFullAnalysisAtEnd(
  db: Database.Database,
  state: ConversationState,
): Promise<AnalysisAgentOutput> {
  const userId = state.user_id;
  console.log(`[orchestrator] Running full grouped analysis at end for user ${userId} (turn ${state.turn_count})`);

  const transcript = buildAnalysisTranscript(db, userId);
  const input = buildAnalysisInput(db, transcript);

  const output = await runAnalysisAgent(input, userId, "analysis_final");

  // Save run data for admin debugging before stripping
  const runData = (output as any)._run_data;
  if (runData) {
    saveAnalysisRun(db, userId, runData.generated_prompt, runData.stage_a_output, JSON.stringify(runData.stage_b_output), "analysis_final");
  }
  delete (output as any)._run_data;

  saveAnalysisToDb(db, userId, output);

  db.prepare(`
    UPDATE profiles SET analysis_json = ?
    WHERE user_id = ? AND id = (SELECT MAX(id) FROM profiles WHERE user_id = ?)
  `).run(JSON.stringify(output), userId, userId);

  state.last_analysis = output;
  state.last_analysis_at_turn = state.turn_count;

  const cov = computeCoverage(db, userId);
  console.log(`[orchestrator] Full analysis done: coverage=${cov.coverage_pct}%, readiness=${cov.readiness_score}, complete=${cov.profile_complete}`);

  return output;
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

  const analysisKicked = false;

  // 4. Check if we should end the conversation (simple: hit question limit)
  const turnsInSession = state.returned_at_turn > 0
    ? state.turn_count - state.returned_at_turn
    : state.turn_count;
  const hitQuestionLimit = turnsInSession >= MAX_QUESTIONS;
  const MIN_TURNS_AFTER_RETURN = 5;
  const returnGuardMet = state.returned_at_turn > 0
    ? (state.turn_count - state.returned_at_turn) >= MIN_TURNS_AFTER_RETURN
    : true;
  const canEnd = hitQuestionLimit && returnGuardMet;

  if (canEnd && state.phase === "chatting") {
    state.phase = "summarizing";

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;

    const ctx: ConversationContext = {
      user_name: user?.first_name || "there",
      user_age: user?.age,
      user_gender: user?.gender,
      user_looking_for: user?.looking_for_gender,
      user_city: user?.city,
      conversation_history: formatHistory(state.turns),
      turn_number: state.turn_count,
      stage: "closing",
      coverage_pct: 0,
      guidance_block: "השיחה מגיעה לסיום. כתוב הודעת סיום קצרה וחמה בעברית. למשל: 'היה לי ממש כיף לשוחח איתך, למדתי המון על מה יכול להתאים לך.' התאם מגדרית.",
    };

    const assistantMessage = await runConversationAgent(ctx, userId, "conversation_summary");
    state.turns.push({ role: "assistant", content: assistantMessage });
    persistMessage(db, userId, "assistant", assistantMessage);

    console.log(`[orchestrator] Closing conversation at turn ${state.turn_count}`);

    return {
      result: {
        assistant_message: assistantMessage,
        analysis_ran: false,
        analysis_in_background: false,
        phase: "summarizing",
        coverage_pct: 0,
        readiness_score: 0,
        turn_count: state.turn_count,
      },
      state,
    };
  }

  // 5. Normal turn — generate assistant response from question bank
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  const stage = getStage(state.turn_count, false, state.phase);
  const guidance = buildGuidance(state);

  const ctx: ConversationContext = {
    user_name: user?.first_name || "there",
    user_age: user?.age,
    user_gender: user?.gender,
    user_looking_for: user?.looking_for_gender,
    user_city: user?.city,
    conversation_history: formatHistory(state.turns),
    turn_number: state.turn_count,
    stage,
    coverage_pct: 0,
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
      coverage_pct: 0,
      readiness_score: 0,
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
  const fem = isFemaleGender(ctx.gender);
  const mal = isMaleGender(ctx.gender);

  const going    = fem ? "הולכת" : mal ? "הולך" : "הולך/ת";
  const youBe    = fem ? "שתהיי" : mal ? "שתהיה" : "שתהיה/י";
  const open     = fem ? "פתוחה" : mal ? "פתוח" : "פתוח/ה";
  const youReact = fem ? "איך שאת היית מגיבה" : mal ? "איך שאתה היית מגיב" : "איך שהיית מגיב/ה";
  const ready    = fem ? "מוכנה" : mal ? "מוכן" : "מוכן/ה";

  return [
    `היי ${userName}, כדי למצוא לך התאמה של 10/10, אני צריך לראות קצת מעבר למה שכתוב בפרופיל. 😉`,
    ``,
    `אני ${going} לזרוק אותך לכמה סיטואציות לא שגרתיות כדי לראות איך המוח (והלב) שלך עובדים בזמן אמת. בלי מסננים ובלי תשובות \'נכונות\' — פשוט ${youReact} במציאות.`,
    ``,
    `ככל ${youBe} יותר ${open}, ככה הדיוק שלי בשידוך יעלה. הפרטיות שלך היא קודש אצלי והשיחה הזו היא לעיניי בלבד, אז אפשר לדבר חופשי על הכל.`,
    ``,
    `${ready} לצאת לדרך?`,
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

// Varied return greetings — picks one at random
function getReturnIntro(userName: string, ctx: GenderContext): string {
  const g = genderForms(ctx);
  const options = [
    `היי ${userName}, איזה כיף שחזרת! יש עוד כמה דברים שמסקרנים אותי לגביך 🙂 ${g.ready}?`,
    `היי ${userName}, כיף לראות אותך שוב! יש לי עוד כמה שאלות 🙂 ${g.ready}?`,
    `${userName}! חזרת 😊 בואי נמשיך מאיפה שהפסקנו. ${g.ready}?`,
    `היי ${userName}, שמח שחזרת! נמשיך? יש עוד כמה דברים שמעניינים אותי 🙂`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

// "Thinking" message — shown after user responds, NOT on initial return
function getThinkingMessage(ctx: GenderContext): string {
  const fem = isFemaleGender(ctx.gender);
  const mal = isMaleGender(ctx.gender);
  const letMe = fem ? "תני" : mal ? "תן" : "תן/י";
  return `${letMe} לי רגע להיזכר על מה דיברנו...`;
}

export function generateOpeningMessage(
  db: Database.Database,
  userId: number
): { message: string; state: ConversationState; isReturning: boolean } {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  const userName = user?.first_name || "there";
  const gCtx: GenderContext = { gender: user?.gender, lookingFor: user?.looking_for_gender };

  // A user is "returning" to the INTERVIEWER only if they have interviewer messages.
  const existingUserMessages = db.prepare(
    "SELECT COUNT(*) as c FROM conversation_messages WHERE user_id = ? AND role = 'user' AND (guide IS NULL OR guide != 'psychologist')"
  ).get(userId) as { c: number };
  const isReturning = existingUserMessages.c > 0;

  const introMessage = isReturning
    ? getReturnIntro(userName, gCtx)
    : getFixedIntro(userName, gCtx);

  // Persist the intro only once (prevents duplicates on page refresh)
  const lastMsg = db.prepare(
    "SELECT content FROM conversation_messages WHERE user_id = ? AND role = 'assistant' ORDER BY created_at DESC, id DESC LIMIT 1"
  ).get(userId) as { content: string } | undefined;
  const lastIsIntro = lastMsg && (
    lastMsg.content.includes("איזה כיף שחזרת") ||
    lastMsg.content.includes("כיף לראות אותך") ||
    lastMsg.content.includes("חזרת 😊") ||
    lastMsg.content.includes("שמח שחזרת") ||
    lastMsg.content.includes("אני השדכן שלך") ||
    lastMsg.content.includes("התאמה של 10/10")
  );
  if (!lastIsIntro) {
    persistMessage(db, userId, "assistant", introMessage);
  }

  // Count interviewer turns only
  let turnCount = 0;
  if (isReturning) {
    turnCount = (db.prepare(
      "SELECT COUNT(*) as c FROM conversation_messages WHERE user_id = ? AND role = 'user' AND (guide IS NULL OR guide != 'psychologist')"
    ).get(userId) as { c: number }).c;
  }

  // Load only INTERVIEWER messages (exclude psychologist chat)
  let turns: ConversationTurn[] = [];
  if (isReturning) {
    const dbMessages = db.prepare(
      "SELECT role, content FROM conversation_messages WHERE user_id = ? AND (guide IS NULL OR guide != 'psychologist') ORDER BY created_at ASC, id ASC"
    ).all(userId) as { role: string; content: string }[];
    turns = dbMessages.map(m => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.content,
    }));
  } else {
    turns = [{ role: "assistant", content: introMessage }];
  }

  const state: ConversationState = {
    user_id: userId,
    turns,
    turn_count: turnCount,
    last_analysis: null,
    last_analysis_at_turn: 0,
    phase: "chatting",
    analysis_in_flight: false,
    analysis_scheduled_at: 0,
    returned_at_turn: isReturning ? turnCount : 0,
  };

  return { message: introMessage, state, isReturning };
}
