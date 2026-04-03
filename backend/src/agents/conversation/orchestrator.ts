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
}

export interface NextTurnResult {
  assistant_message: string;
  analysis_ran: boolean;
  analysis?: AnalysisAgentOutput;
  phase: ConversationPhase;
  coverage_pct: number;
  turn_count: number;
}

// ── Coverage calculation (server-side, confidence-weighted) ────

const CONF_HIGH = 0.50;
const CONF_MEDIUM = 0.30;
const WEIGHT_HIGH = 1.0;
const WEIGHT_MEDIUM = 0.4;
const WEIGHT_LOW = 0.1;

export function computeCoverage(db: Database.Database, userId: number): {
  coverage_pct: number;
  high_count: number;
  medium_count: number;
  weak_count: number;
  missing_count: number;
  ready_for_matching: boolean;
} {
  const totalInternal = (db.prepare(
    "SELECT COUNT(*) as c FROM trait_definitions WHERE is_active = 1"
  ).get() as any).c;

  const internalTraits = db.prepare(
    "SELECT confidence FROM user_traits WHERE user_id = ?"
  ).all(userId) as { confidence: number }[];

  const totalExternal = (db.prepare(
    "SELECT COUNT(*) as c FROM look_trait_definitions WHERE is_active = 1"
  ).get() as any).c;

  const externalTraits = db.prepare(`
    SELECT
      CASE WHEN desired_value IS NOT NULL THEN desired_value_confidence ELSE NULL END as d_conf,
      CASE WHEN personal_value IS NOT NULL THEN personal_value_confidence ELSE NULL END as p_conf
    FROM user_look_traits WHERE user_id = ?
  `).all(userId) as { d_conf: number | null; p_conf: number | null }[];

  const totalTraits = totalInternal + totalExternal;
  if (totalTraits === 0) return { coverage_pct: 0, high_count: 0, medium_count: 0, weak_count: 0, missing_count: 0, ready_for_matching: false };

  let weightedSum = 0;
  let high = 0, medium = 0, weak = 0;

  for (const t of internalTraits) {
    if (t.confidence >= CONF_HIGH) { weightedSum += WEIGHT_HIGH; high++; }
    else if (t.confidence >= CONF_MEDIUM) { weightedSum += WEIGHT_MEDIUM; medium++; }
    else { weightedSum += WEIGHT_LOW; weak++; }
  }

  for (const t of externalTraits) {
    const bestConf = Math.max(t.d_conf ?? 0, t.p_conf ?? 0);
    if (bestConf >= CONF_HIGH) { weightedSum += WEIGHT_HIGH; high++; }
    else if (bestConf >= CONF_MEDIUM) { weightedSum += WEIGHT_MEDIUM; medium++; }
    else { weightedSum += WEIGHT_LOW; weak++; }
  }

  const assessed = internalTraits.length + externalTraits.length;
  const missing = totalTraits - assessed;
  const coverage = Math.round((weightedSum / totalTraits) * 100);
  const ready = coverage >= 50 && high >= 15;

  return { coverage_pct: coverage, high_count: high, medium_count: medium, weak_count: weak, missing_count: missing, ready_for_matching: ready };
}

// ── Checkpoint logic ───────────────────────────────────────────

const FIRST_CHECKPOINT = 4;
const CHECKPOINT_INTERVAL = 2;
const READY_COVERAGE = 50;
const READY_HIGH_MIN = 15;
const MAX_TURNS = 15;

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
  energy_level: "activity level / energy",
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
  bluntness_score: "communication directness",
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

function buildGuidance(analysis: AnalysisAgentOutput | null, turnCount: number): string {
  if (!analysis) {
    // Pre-analysis: give structured turn-by-turn guidance
    if (turnCount <= 1) return "Ask about their work/career and what energizes them day-to-day.";
    if (turnCount === 2) return "Ask about their values — what matters most to them in life or relationships.";
    if (turnCount === 3) return "Ask about what they are looking for in a partner — personality, energy, values.";
    return "Ask about physical attraction — what kind of look or presence draws them in.";
  }

  const lines: string[] = [];

  // Already known (brief, so agent doesn't re-ask)
  const assessed = analysis.internal_traits;
  if (assessed.length > 0) {
    const known = assessed
      .filter(t => t.confidence >= 0.4)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
      .map(t => traitToTopic(t.internal_name))
      .join(", ");
    if (known) lines.push(`Already covered (do NOT ask about these): ${known}`);
  }

  // Missing — these are the priority questions
  const missing = analysis.missing_traits;
  if (missing.length > 0) {
    // Prioritize actionable topics over obscure ones
    const prioritized = missing
      .filter(m => !["toxicity_score", "trollness", "sexual_identity"].includes(m))
      .slice(0, 6)
      .map(traitToTopic);
    if (prioritized.length > 0) {
      lines.push(`PRIORITY — ask about one of these: ${prioritized.join(", ")}`);
    }
  }

  // Weak — could use more signal
  const weakTraits = assessed
    .filter(t => t.confidence > 0 && t.confidence < 0.4)
    .slice(0, 4)
    .map(t => traitToTopic(t.internal_name));
  if (weakTraits.length > 0) {
    lines.push(`Could use more signal: ${weakTraits.join(", ")}`);
  }

  // External trait gaps
  const hasDesired = analysis.external_traits.some(t => t.desired_value);
  const hasPersonal = analysis.external_traits.some(t => t.personal_value);
  if (!hasDesired) lines.push("MISSING: Have not asked about physical attraction / what kind of look they are drawn to");
  if (!hasPersonal) lines.push("MISSING: Have not asked about their own appearance / style / presence");

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

function getStage(turnCount: number, coverage: number, phase: ConversationPhase): ConversationContext["stage"] {
  if (phase === "summarizing") return "closing";
  if (coverage >= READY_COVERAGE) return "closing";
  if (turnCount <= 3) return "early";
  if (turnCount <= 7) return "middle";
  return "later";
}

// ── Conversation history formatting ────────────────────────────

function formatHistory(turns: ConversationTurn[], maxRecent: number = 10): string {
  if (turns.length <= maxRecent) {
    return turns.map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n\n");
  }

  const early = turns.slice(0, turns.length - maxRecent);
  const recent = turns.slice(-maxRecent);

  const earlyTopics = early
    .filter(t => t.role === "user")
    .map(t => t.content.slice(0, 80))
    .join("; ");

  return `[Earlier topics covered: ${earlyTopics}]\n\n` +
    recent.map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n\n");
}

// ── Build transcript for analysis agent ────────────────────────

function buildAnalysisTranscript(db: Database.Database, userId: number): string {
  const allAnswers = db.prepare(
    "SELECT raw_answer, created_at FROM profiles WHERE user_id = ? ORDER BY created_at ASC"
  ).all(userId) as { raw_answer: string; created_at: string }[];

  return allAnswers
    .map((a, i) => `[Round ${i + 1}]\nUser: ${a.raw_answer}`)
    .join("\n\n");
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

  // 2. Store answer in profiles table
  db.prepare(
    "INSERT INTO profiles (user_id, raw_answer, analysis_json) VALUES (?, ?, '{}')"
  ).run(userId, userMessage);

  // 3. If we're in summarizing phase, the user is responding to the summary
  if (state.phase === "summarizing") {
    // The user responded to "Did I get this right?" — mark confirmed
    state.phase = "confirmed";

    // Generate a brief closing message
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    const cov = computeCoverage(db, userId);
    const ctx: ConversationContext = {
      user_name: user?.first_name || "there",
      user_age: user?.age,
      user_gender: user?.gender,
      user_city: user?.city,
      conversation_history: formatHistory(state.turns),
      turn_number: state.turn_count,
      stage: "closing",
      coverage_pct: cov.coverage_pct,
      guidance_block: "The user just confirmed the profile summary. Say something brief and warm like 'Great, we have everything we need. We will start looking for your match now.' Do NOT ask more questions.",
    };

    const assistantMessage = await runConversationAgent(ctx);
    state.turns.push({ role: "assistant", content: assistantMessage });

    return {
      result: {
        assistant_message: assistantMessage,
        analysis_ran: false,
        phase: "confirmed",
        coverage_pct: cov.coverage_pct,
        turn_count: state.turn_count,
      },
      state,
    };
  }

  // 4. Normal chatting phase — run analysis checkpoint if needed
  let analysisRan = false;
  let analysis = state.last_analysis;

  if (shouldRunAnalysis(state)) {
    console.log(`[orchestrator] Running analysis checkpoint at turn ${state.turn_count} for user ${userId}`);
    const transcript = buildAnalysisTranscript(db, userId);
    const input = buildAnalysisInput(db, transcript);
    analysis = await runAnalysisAgent(input);
    const saved = saveAnalysisToDb(db, userId, analysis);

    db.prepare(`
      UPDATE profiles SET analysis_json = ?
      WHERE user_id = ? AND id = (SELECT MAX(id) FROM profiles WHERE user_id = ?)
    `).run(JSON.stringify(analysis), userId, userId);

    state.last_analysis = analysis;
    state.last_analysis_at_turn = state.turn_count;
    analysisRan = true;
  }

  // 5. Compute coverage
  const cov = computeCoverage(db, userId);
  const coveragePct = cov.coverage_pct;

  if (analysisRan) {
    console.log(`[orchestrator] Analysis done. Server coverage: ${coveragePct}% (high=${cov.high_count}, med=${cov.medium_count}, weak=${cov.weak_count}, missing=${cov.missing_count})`);
  }

  // 6. Check if we should move to summarizing phase
  const readyForSummary = (coveragePct >= READY_COVERAGE && cov.high_count >= READY_HIGH_MIN) || state.turn_count >= MAX_TURNS;

  if (readyForSummary && state.phase === "chatting") {
    state.phase = "summarizing";

    // Build summary and generate confirmation message
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
      guidance_block: `We have enough information. Summarize what you learned about the user in a warm, natural way. Include:\n${profileSummary}\n\nThen ask something like: "Does that sound about right? Anything you'd want to add or correct?"`,
    };

    const assistantMessage = await runConversationAgent(ctx);
    state.turns.push({ role: "assistant", content: assistantMessage });

    return {
      result: {
        assistant_message: assistantMessage,
        analysis_ran: analysisRan,
        analysis: analysisRan ? analysis ?? undefined : undefined,
        phase: "summarizing",
        coverage_pct: coveragePct,
        turn_count: state.turn_count,
      },
      state,
    };
  }

  // 7. Normal turn — generate assistant response
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  const stage = getStage(state.turn_count, coveragePct, state.phase);
  const guidance = buildGuidance(analysis, state.turn_count);

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

  const assistantMessage = await runConversationAgent(ctx);
  state.turns.push({ role: "assistant", content: assistantMessage });

  return {
    result: {
      assistant_message: assistantMessage,
      analysis_ran: analysisRan,
      analysis: analysisRan ? analysis ?? undefined : undefined,
      phase: state.phase,
      coverage_pct: coveragePct,
      turn_count: state.turn_count,
    },
    state,
  };
}

// ── Opening message ────────────────────────────────────────────

export async function generateOpeningMessage(
  db: Database.Database,
  userId: number
): Promise<{ message: string; state: ConversationState }> {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;

  const state: ConversationState = {
    user_id: userId,
    turns: [],
    turn_count: 0,
    last_analysis: null,
    last_analysis_at_turn: 0,
    phase: "chatting",
  };

  const ctx: ConversationContext = {
    user_name: user?.first_name || "there",
    user_age: user?.age,
    user_gender: user?.gender,
    user_city: user?.city,
    conversation_history: "(This is the start of the conversation. No messages yet.)",
    turn_number: 0,
    stage: "early",
    coverage_pct: 0,
    guidance_block: "Start with a warm greeting. Ask an open-ended question about who they are or what their life is like. Keep it light and inviting.",
  };

  const message = await runConversationAgent(ctx);
  state.turns.push({ role: "assistant", content: message });

  return { message, state };
}
