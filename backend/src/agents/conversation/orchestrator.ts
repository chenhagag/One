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
  // Mandatory question tracking
  asked_appearance: boolean;     // "איך היית מתאר/ת את המראה שלך"
  asked_dealbreakers: boolean;   // "משהו מהותי בזהות שלך" — must be last
  asked_worst_match: boolean;    // "בן/בת זוג שהכי לא מתאים"
  asked_last_relationship: boolean; // "מערכת היחסים האחרונה"
  asked_simulation: boolean;     // at least 1 simulation question asked
  asked_cognition: boolean;      // at least 1 cognition question asked
  // Return-to-conversation tracking
  returned_at_turn: number;      // turn_count when user returned (0 = new conversation)
  // Forced question tracking — prevents asking the same mandatory twice
  forced_questions: Set<string>; // mandatory keys that were already forced
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

// ── Mandatory question detection ──────────────────────────────

function scanMandatoryQuestions(state: ConversationState): void {
  for (const t of state.turns) {
    if (t.role !== "assistant") continue;
    const c = t.content;

    // Appearance — broad detection
    if (c.includes("מראה שלך") || c.includes("מראה") && c.includes("מתאר")
      || c.includes("חזות") || c.includes("תופס") && c.includes("מראה")
      || c.includes("מעטפת החיצונית")) {
      state.asked_appearance = true;
    }
    // Identity / deal-breakers
    if (c.includes("מהותי בזהות") || c.includes("דיל ברייקר") || c.includes("פרט חשוב")
      || c.includes("שחשוב שאדע") || c.includes("זהות שלך") || c.includes("זהות העמוקה")) {
      state.asked_dealbreakers = true;
    }
    // Worst match — broad detection
    if (c.includes("לא מתאים") || c.includes("לא מתאימה") || c.includes("הפוך")
      || c.includes("לא בשביל") || c.includes("לא הולם") || c.includes("לא מהדהד")) {
      state.asked_worst_match = true;
    }
    // Last relationship
    if (c.includes("יחסים האחרונ") || c.includes("קשר האחרון") || c.includes("הקשר האחרון")
      || c.includes("מערכת יחסים") && (c.includes("אחרונה") || c.includes("קודמת"))) {
      state.asked_last_relationship = true;
    }
    // Simulation — broad detection (covers all simulation question variants)
    if (c.includes("מיליון דולר") || c.includes("מיליון") || c.includes("משיכה פיזית")
      || c.includes("לוקח קרדיט") || c.includes("שפע") || c.includes("זוכה ב")
      || c.includes("דייט ראשון") || c.includes("לא מתאים לך") && c.includes("מתמודד")) {
      state.asked_simulation = true;
    }
    // Cognition — broad detection (covers all cognition question variants)
    if (c.includes("חייזר") || c.includes("כריזמה") || c.includes("קנאה")
      || c.includes("טעות מוחלטת") || c.includes("להסביר ל") && c.includes("מה זה")
      || c.includes("מנגנון") || c.includes("רוב האנשים") && c.includes("מסכימים")) {
      state.asked_cognition = true;
    }
  }
}

function getMissingMandatory(state: ConversationState): string[] {
  const missing: string[] = [];
  if (!state.asked_worst_match) missing.push("worst_match");
  if (!state.asked_last_relationship) missing.push("last_relationship");
  if (!state.asked_appearance) missing.push("appearance");
  if (!state.asked_simulation) missing.push("simulation");
  if (!state.asked_cognition) missing.push("cognition");
  // dealbreakers is always last — tracked separately
  if (!state.asked_dealbreakers) missing.push("dealbreakers");
  return missing;
}

function allMandatoryCovered(state: ConversationState): boolean {
  return state.asked_appearance && state.asked_dealbreakers
    && state.asked_worst_match && state.asked_last_relationship
    && state.asked_simulation && state.asked_cognition;
}

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
  db: Database.Database,
  userId: number,
  analysis: AnalysisAgentOutput | null,
  turnCount: number,
  cov?: CoverageResult,
  state?: ConversationState
): string {
  // ── Returning user: first response after coming back ──
  const isReturnFirstTurn = state && state.returned_at_turn > 0 && turnCount === state.returned_at_turn + 1;
  if (isReturnFirstTurn) {
    return [
      "המשתמש/ת חזר/ה לשיחה קיימת והגיב/ה להודעת החזרה.",
      "התחל/י עם: 'תן/י לי רגע להיזכר על מה דיברנו...' (התאם/י מגדרית)",
      "אחרי זה כתוב סיכום קצר (2-3 משפטים) של הנושאים המרכזיים מהשיחה הקודמת.",
      "אסור לכלול בסיכום: מראה חיצוני, אינטליגנציה, מצב תעסוקתי, תכונות רגישות, ניתוח פנימי.",
      "הסיכום חייב להכיל רק מידע שהמשתמש/ת שיתף/ה מפורשות — נושאים ניטרליים בלבד.",
      "מיד אחרי הסיכום — שאל/י שאלה חדשה מבנק השאלות (העדף/י שאלות שעדיין לא נשאלו).",
      "זו המשכה של השיחה הקודמת — לא התחלה חדשה. המשך/י לפי כל הכללים הרגילים.",
    ].join("\n");
  }

  if (!analysis && turnCount <= 4 && (!state || state.returned_at_turn === 0)) {
    // Pre-analysis: structured turn-by-turn guidance (new conversations only)
    if (turnCount <= 1) return "המשתמש/ת הגיב/ה להודעת הפתיחה. שאל/י עכשיו את שאלת היום האידיאלי: 'בוא/י נתחיל קליל - תאר/י לי את היום האידיאלי בשבילך. איפה את/ה קם/ה בבוקר, מה את/ה עושה, עם מי, ואיך את/ה מסיים/ת את היום?' (התאם/י מגדרית)";
    if (turnCount === 2) return "המשתמש/ת ענה/תה על שאלת היום האידיאלי. הגב/י בקצרה ושאל/י את שאלת ההמשך: 'ומה קורה בפועל? איך נראה היום יום האמיתי שלך?' (התאם/י מגדרית)";
    if (turnCount === 3) return "המשך/י עם אחת מהשאלות מבנק השאלות — העדף/י שאלת סימולציה או שאלה חוויתית ספציפית. התאם/י מגדרית. אל תשאל/י שאלות כלליות או מופשטות.";
    return "המשך/י עם שאלות מבנק השאלות. העדף/י שאלות סימולציה. התאם/י מגדרית. אל תשאל/י שאלות כלליות.";
  }

  const lines: string[] = [];
  const topics = getCoveredTopics(db, userId);

  // Already covered (read from DB, not from analysis state)
  if (topics.covered.length > 0) {
    lines.push(`נושאים שכבר כוסו (אסור לשאול עליהם שוב, גם לא בניסוח אחר): ${topics.covered.join(", ")}`);
  }

  // Unmet traits from coverage check — the real priority
  if (cov && cov.unmet_traits.length > 0) {
    const priorityTopics = cov.unmet_traits
      .filter(m => !["toxicity_score", "trollness", "sexual_identity"].includes(m))
      .slice(0, 6)
      .map(traitToTopic);
    if (priorityTopics.length > 0) {
      lines.push(`PRIORITY — these traits still need stronger signal. Ask about one: ${priorityTopics.join(", ")}`);
    }
  }

  // Missing traits from probe/analysis (secondary, deduped against unmet)
  if (analysis && analysis.missing_traits.length > 0) {
    const secondary = analysis.missing_traits
      .filter(m => !["toxicity_score", "trollness", "sexual_identity"].includes(m))
      .filter(m => !(cov?.unmet_traits || []).includes(m))
      .slice(0, 4)
      .map(traitToTopic);
    if (secondary.length > 0) {
      lines.push(`Also missing: ${secondary.join(", ")}`);
    }
  }

  // Weak traits (read from DB)
  if (topics.weak.length > 0) {
    lines.push(`Weak (needs refinement from a new angle): ${topics.weak.join(", ")}`);
  }

  // External trait gaps (read from DB)
  if (!topics.hasDesiredLook) lines.push("MISSING: physical attraction / what kind of look draws them in");
  if (!topics.hasPersonalLook) lines.push("MISSING: their own appearance / style / presence");

  // Mandatory question status — tell the LLM what's still needed
  if (state) {
    const missing = getMissingMandatory(state);
    if (missing.length > 0) {
      const labels: Record<string, string> = {
        worst_match: "שאלת פרטנר לא מתאים",
        last_relationship: "שאלת מערכת יחסים אחרונה",
        appearance: "שאלת מראה",
        simulation: "שאלת סימולציה (לפחות 1)",
        cognition: "שאלת קוגניציה (לפחות 1)",
        dealbreakers: "שאלת זהות/דיל ברייקרס (חובה אחרונה!)",
      };
      const missingLabels = missing.map(m => labels[m] || m).join(", ");
      lines.push(`שאלות חובה שעדיין לא נשאלו: ${missingLabels}`);
      lines.push("כשמגיע הזמן לשאול שאלת חובה — התאם מגדרית ושאל. אל תשכח לשאול את כולן.");

      // Urgency based on remaining turns
      const turnsLeft = MAX_QUESTIONS - turnCount;
      const mandatoryCount = missing.filter(m => m !== "dealbreakers").length + (missing.includes("dealbreakers") ? 1 : 0);
      if (turnsLeft <= mandatoryCount + 2) {
        lines.push(`דחוף: נשארו רק ${turnsLeft} תורות. חובה לשאול עכשיו שאלת חובה מהרשימה למעלה.`);
      }

      if (missing.includes("dealbreakers") && missing.length === 1) {
        lines.push("זו השאלה האחרונה שצריך לשאול — שאלת הזהות/דיל ברייקרס. שאל אותה עכשיו.");
      }
    }
  }

  // (guide-switch context removed — single unified conversation)

  // Probes from analysis/coverage probe
  if (analysis && analysis.recommended_probes.length > 0) {
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

// Builds a unified transcript from all conversation messages for the analyzer.
export function buildAnalysisTranscript(db: Database.Database, userId: number): string {
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

  // 2b. Detect user frustration / repetition signals → mark forced questions as done
  const msgLower = userMessage.trim();
  const isRepetitionSignal = msgLower.includes("כבר שאלת") || msgLower.includes("כבר דיברנו")
    || msgLower.includes("חפרת") || msgLower.includes("שוב") && msgLower.includes("שאלה")
    || msgLower === "די" || msgLower.includes("מה יש לך") || msgLower.includes("אותו דבר");
  if (isRepetitionSignal) {
    // Mark ALL currently-missing mandatories as forced so they won't be asked again
    const missing = getMissingMandatory(state);
    for (const m of missing) state.forced_questions.add(m);
    console.log(`[orchestrator] User frustration detected: "${msgLower.substring(0, 40)}". Marked ${missing.length} mandatories as forced to prevent repetition.`);
  }

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

  // 4. Check if a coverage probe should be kicked off (lightweight, non-blocking)
  let analysisKicked = false;
  if (shouldRunAnalysis(state) && !state.analysis_in_flight) {
    fireCoverageProbe(db, state);
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

  // 7. Detect which mandatory questions were asked (scan ALL guide threads, not just current)
  {
    const allAssistantMsgs = db.prepare(
      "SELECT content FROM conversation_messages WHERE user_id = ? AND role = 'assistant' ORDER BY created_at ASC"
    ).all(userId) as { content: string }[];
    const allTurns = allAssistantMsgs.map(m => ({ role: "assistant" as const, content: m.content }));
    const scanState = { ...state, turns: allTurns };
    scanMandatoryQuestions(scanState);
    state.asked_appearance = scanState.asked_appearance;
    state.asked_dealbreakers = scanState.asked_dealbreakers;
    state.asked_worst_match = scanState.asked_worst_match;
    state.asked_last_relationship = scanState.asked_last_relationship;
    state.asked_simulation = scanState.asked_simulation;
    state.asked_cognition = scanState.asked_cognition;
  }

  // 8. Check if we should move to summarizing phase
  // Use session-relative count so returning users aren't immediately at the limit
  const turnsInSession = state.returned_at_turn > 0
    ? state.turn_count - state.returned_at_turn
    : state.turn_count;
  const hitQuestionLimit = turnsInSession >= MAX_QUESTIONS;

  // If user returned mid-conversation, force at least 3 more turns before allowing end
  const MIN_TURNS_AFTER_RETURN = 5;
  const turnsSinceReturn = state.returned_at_turn > 0
    ? state.turn_count - state.returned_at_turn
    : Infinity; // new conversation — no minimum
  const returnGuardMet = turnsSinceReturn >= MIN_TURNS_AFTER_RETURN;

  // All mandatory questions must be covered before ending
  const mandatoriesDone = allMandatoryCovered(state);

  // Safety valve: if we've been going 4+ turns past the limit IN THIS SESSION, end regardless.
  const HARD_LIMIT_EXTRA = 4;
  const turnsThisSession = state.returned_at_turn > 0
    ? state.turn_count - state.returned_at_turn
    : state.turn_count;
  const hardLimitReached = turnsThisSession >= MAX_QUESTIONS + HARD_LIMIT_EXTRA;

  const canEnd = (
    ((cov.profile_complete || hitQuestionLimit) && returnGuardMet && mandatoriesDone)
    || hardLimitReached
  );

  // Diagnostic logging
  if (turnsInSession >= MAX_QUESTIONS - 1) {
    const missing = getMissingMandatory(state);
    console.log(`[orchestrator] End-check at turn ${state.turn_count} (session=${turnsInSession}): hitLimit=${hitQuestionLimit} returnGuard=${returnGuardMet} mandatories=${mandatoriesDone} hardLimit=${hardLimitReached} canEnd=${canEnd} missing=[${missing.join(",")}]`);
  }

  // If we want to end but mandatory questions are missing → force them one by one
  const wantToEnd = (cov.profile_complete || hitQuestionLimit) && returnGuardMet;
  if (wantToEnd && !mandatoriesDone && state.phase === "chatting") {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    const missing = getMissingMandatory(state);

    // Filter out questions that were already forced — never force the same one twice
    const notYetForced = missing.filter(m => !state.forced_questions.has(m));

    // If all missing questions were already forced once, consider them done
    if (notYetForced.length === 0) {
      console.log(`[orchestrator] All missing mandatories already forced once — marking as done. Missing were: [${missing.join(",")}]`);
      // Mark remaining mandatories as covered to break the loop
      state.asked_appearance = true;
      state.asked_dealbreakers = true;
      state.asked_worst_match = true;
      state.asked_last_relationship = true;
      state.asked_simulation = true;
      state.asked_cognition = true;
      // Fall through to canEnd check below (will now pass)
    } else {
    let forcedQuestion = "";

    // Force in priority order (dealbreakers is always last)
    const next = notYetForced.find(m => m !== "dealbreakers") || "dealbreakers";
    state.forced_questions.add(next);
    console.log(`[orchestrator] Forcing mandatory: ${next} (first attempt, won't repeat)`);

    if (next === "worst_match") {
      forcedQuestion = `MANDATORY: שאל עכשיו את שאלת הפרטנר שהכי הכי *לא* מתאים. התאם מגדרית: "בוא/י רגע נעשה את זה הפוך — תן/י לי תיאור של בן/בת הזוג שהכי הכי *לא* מתאים/ה לך, ממש הכי לא בשבילך. מה הווייב? מה הדעות, האמונות והסגנון?"`;
    } else if (next === "last_relationship") {
      forcedQuestion = `MANDATORY: שאל עכשיו על מערכת היחסים האחרונה. התאם מגדרית: "תאר/י לי קצת את מערכת היחסים האחרונה שהייתה לך. מה עבד לך ומה לא עבד?"`;
    } else if (next === "appearance") {
      forcedQuestion = `MANDATORY: שאל עכשיו על מראה. התאם מגדרית: "איך היית מתאר/ת את המראה שלך?" (אחרי התשובה שאל גם על העדפות מראה בפרטנר)`;
    } else if (next === "simulation") {
      forcedQuestion = `MANDATORY: שאל עכשיו שאלת סימולציה. התאם מגדרית: "מחר את/ה זוכה במיליון דולר — מה את/ה עושה עם הכסף?"`;
    } else if (next === "cognition") {
      forcedQuestion = `MANDATORY: שאל עכשיו שאלת קוגניציה. חובה להתחיל עם משפט פתיחה קצר כמו: "בוא נעשה רגע תרגיל מחשבתי..." — ואז שאל. התאם מגדרית: "אם היית צריך/ה להסביר למישהו שמעולם לא חווה קנאה מה זה הרגש הזה, בלי להשתמש במילה 'קנאה', איך היית מתאר/ת את המנגנון שלו?"`;
    } else if (next === "dealbreakers") {
      forcedQuestion = `MANDATORY: זו השאלה האחרונה — שאל את שאלת הזהות/דיל ברייקרס. התאם מגדרית: "האם יש משהו מהותי בזהות שלך, או פרט חשוב עליך, שחשוב שאדע לפני שאני מתאים/ה לך בן/בת זוג?"`;
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

    console.log(`[orchestrator] Forced mandatory: ${next} (missing: ${missing.join(", ")}) at turn ${state.turn_count}`);

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
    } // end else (notYetForced.length > 0)
  }

  // Re-check canEnd after potential forced-questions-done shortcircuit
  const canEndFinal = allMandatoryCovered(state)
    ? (cov.profile_complete || hitQuestionLimit) && returnGuardMet
    : hardLimitReached;

  if ((canEnd || canEndFinal) && state.phase === "chatting") {
    state.phase = "summarizing";

    // Run the FULL grouped analysis now (awaited) — this is the only point in the
    // conversation where actual trait scores get written to the DB.
    let finalAnalysis: AnalysisAgentOutput;
    try {
      finalAnalysis = await runFullAnalysisAtEnd(db, state);
    } catch (err) {
      console.error(`[orchestrator] Final analysis failed for user ${userId}:`, err);
      finalAnalysis = analysis ?? {
        internal_traits: [],
        external_traits: [],
        missing_traits: [],
        recommended_probes: [],
        profiling_completeness: { internal_assessed: 0, internal_total: 0, external_assessed: 0, external_total: 0, coverage_pct: 0, ready_for_matching: false, notes: "fallback after error" },
      };
    }

    // Recompute coverage after the final analysis wrote scores
    const finalCov = computeCoverage(db, userId);
    updateUserReadiness(db, userId, finalCov);

    const profileSummary = buildProfileSummary(finalAnalysis);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;

    const ctx: ConversationContext = {
      user_name: user?.first_name || "there",
      user_age: user?.age,
      user_gender: user?.gender,
      user_city: user?.city,
      conversation_history: formatHistory(state.turns),
      turn_number: state.turn_count,
      stage: "closing",
      coverage_pct: finalCov.coverage_pct,
      guidance_block: (() => {
        const isFem = user?.gender === "female" || user?.gender === "woman" || user?.gender === "נקבה";
        const isMal = user?.gender === "male" || user?.gender === "man" || user?.gender === "זכר";
        const lfFem = user?.looking_for_gender === "female" || user?.looking_for_gender === "woman" || user?.looking_for_gender === "נקבה";
        const lfMal = user?.looking_for_gender === "male" || user?.looking_for_gender === "man" || user?.looking_for_gender === "זכר";
        const youAre = isFem ? "את מישהי" : isMal ? "אתה מישהו" : "את/ה מישהו/י";
        const youWant = isFem ? "שתרצי" : isMal ? "שתרצה" : "שתרצה/י";
        const partnerWord = lfMal ? "בן זוג" : lfFem ? "בת זוג" : "בן/בת זוג";
        const partnerAdj = lfMal ? "מישהו רגיש, שיודע" : lfFem ? "מישהי רגישה, שיודעת" : "מישהו/י רגיש/ה";
        const partnerFit = lfMal ? "יהיה מדויק" : lfFem ? "תהיה מדויקת" : "יתאים";
        const example = `"${youAre} ${isFem ? "שחיה" : isMal ? "שחי" : "שחי/ה"} את הרגע, עם מודעות רגשית גבוהה ורצון לעומק...\nאני ${isFem ? "חושב" : "חושבת"} ש${partnerAdj} לתת מקום אבל גם לצחוק איתך, ${partnerFit} בשבילך."`;
        return `השיחה מגיעה לסיום. כתוב סיכום קצר (2-4 משפטים) בעברית.

מגדר המשתמש/ת: ${user?.gender || "לא ידוע"}
מגדר הפרטנר המבוקש: ${user?.looking_for_gender || "לא ידוע"}

חובה להתאים מגדרית:
- פניות למשתמש/ת → לפי מגדר המשתמש/ת
- כל אזכור של ${partnerWord} → לפי מגדר הפרטנר המבוקש (${user?.looking_for_gender})
- לכתוב "${partnerWord}" ולא "בן/בת זוג"

הסיכום צריך להיות עמוק ומדויק — לא תיאור שטחי:
1. הסגנון הרגשי — איך חווים קשרים, מה האנרגיה, מה חשוב באמת
2. מה צריכים מ${partnerWord} — איזה סוג אדם ישלים אותם
3. תובנה אחת מדויקת — משהו שמרגיש כאילו באמת "תפסת" אותם

דוגמה לכיוון (אל תעתיק — כתוב משהו מקורי):
${example}

חשוב:
- התבסס על כלל השיחה, לא רק על התשובה האחרונה
- אסור לכלול מראה חיצוני, תכונות רגישות, או ניתוח פנימי
- אסור לתאר דברים שטחיים
- טון חם, אישי

מידע מהניתוח:
${profileSummary || "אין — סכם מהשיחה עצמה"}

אחרי הסיכום שאל: "האם קלעתי? יש משהו ${youWant} לחדד?"`;
      })(),
    };

    const assistantMessage = await runConversationAgent(ctx, userId, "conversation_summary");
    state.turns.push({ role: "assistant", content: assistantMessage });
    persistMessage(db, userId, "assistant", assistantMessage);

    console.log(`[orchestrator] Moving to summary: profile_complete=${finalCov.profile_complete}, turns=${state.turn_count}, readiness=${finalCov.readiness_score}`);

    return {
      result: {
        assistant_message: assistantMessage,
        analysis_ran: true,
        analysis_in_background: analysisKicked,
        phase: "summarizing",
        coverage_pct: finalCov.coverage_pct,
        readiness_score: finalCov.readiness_score,
        turn_count: state.turn_count,
      },
      state,
    };
  }

  // 8. Normal turn — generate assistant response immediately
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  const stage = getStage(state.turn_count, cov.profile_complete, state.phase);
  const guidance = buildGuidance(db, userId, analysis, state.turn_count, cov, state);

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
    `ככל ${g.youAnswer} יותר בהרחבה, בפתיחות ובכנות — נוכל למצוא התאמה מדויקת וחזקה יותר.`,
    `אם השיחה ארוכה לך מדי, תמיד אפשר לעצור ולהמשיך בזמן אחר ;)`,
    `חשוב ${g.youKnow} — התשובות כאן לא מתפרסמות בפרופיל, הן לעיני בלבד, כדי שאוכל להכיר ${g.yourSelf} לעומק ולמצוא ${g.theOne}.`,
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

  // A user is "returning" only if they have sent at least one message previously.
  const existingUserMessages = db.prepare(
    "SELECT COUNT(*) as c FROM conversation_messages WHERE user_id = ? AND role = 'user'"
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
    lastMsg.content.includes("אני השדכן שלך")
  );
  if (!lastIsIntro) {
    persistMessage(db, userId, "assistant", introMessage);
  }

  // Count total turns
  let turnCount = 0;
  if (isReturning) {
    turnCount = (db.prepare(
      "SELECT COUNT(*) as c FROM conversation_messages WHERE user_id = ? AND role = 'user'"
    ).get(userId) as { c: number }).c;
  }

  // Load ALL messages (single unified thread)
  let turns: ConversationTurn[] = [];
  if (isReturning) {
    const dbMessages = db.prepare(
      "SELECT role, content FROM conversation_messages WHERE user_id = ? ORDER BY created_at ASC, id ASC"
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
    asked_appearance: false,
    asked_dealbreakers: false,
    asked_worst_match: false,
    asked_last_relationship: false,
    asked_simulation: false,
    asked_cognition: false,
    returned_at_turn: isReturning ? turnCount : 0,
    forced_questions: new Set(),
  };

  // Scan ALL messages for mandatory question coverage
  if (isReturning) {
    const allMessages = db.prepare(
      "SELECT content FROM conversation_messages WHERE user_id = ? AND role = 'assistant' ORDER BY created_at ASC"
    ).all(userId) as { content: string }[];
    const scanState = { ...state, turns: allMessages.map(m => ({ role: "assistant" as const, content: m.content })) };
    scanMandatoryQuestions(scanState);
    state.asked_appearance = scanState.asked_appearance;
    state.asked_dealbreakers = scanState.asked_dealbreakers;
    state.asked_worst_match = scanState.asked_worst_match;
    state.asked_last_relationship = scanState.asked_last_relationship;
    state.asked_simulation = scanState.asked_simulation;
    state.asked_cognition = scanState.asked_cognition;
  }

  return { message: introMessage, state, isReturning };
}
