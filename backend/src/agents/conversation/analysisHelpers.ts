/**
 * Analysis helper functions — extracted from orchestrator.ts.
 * These are still needed by autoAnalysis.ts, admin reanalyze, and coverage endpoints.
 */

import type Database from "better-sqlite3";
import { queryOne as pgQueryOne, queryAll as pgQueryAll, queryRun as pgQueryRun } from "../../db.pg";

// ── Coverage computation ──────────────────────────────────────

export interface CoverageResult {
  coverage_pct: number;
  met_count: number;
  below_count: number;
  missing_count: number;
  total_count: number;
  profile_complete: boolean;
  readiness_score: number;
  ready_for_matching: boolean;
  unmet_traits: string[];
}

export async function computeCoverage(_db: Database.Database, userId: number): Promise<CoverageResult> {
  const EXTERNAL_REQ_CONF = 0.5;

  const internalDefs = await pgQueryAll<{ id: number; internal_name: string; required_confidence: number; weight: number }>(
    "SELECT id, internal_name, required_confidence, weight FROM trait_definitions WHERE is_active = TRUE"
  );

  const userTraits = await pgQueryAll<{ trait_definition_id: number; confidence: number }>(
    "SELECT trait_definition_id, confidence FROM user_traits WHERE user_id = $1",
    [userId]
  );

  const traitConfMap = new Map(userTraits.map(t => [t.trait_definition_id, t.confidence]));

  const externalDefs = await pgQueryAll<{ id: number; internal_name: string; weight: number }>(
    "SELECT id, internal_name, weight FROM look_trait_definitions WHERE is_active = TRUE"
  );

  const userLookTraits = await pgQueryAll<{ look_trait_definition_id: number; d_conf: number | null; p_conf: number | null }>(
    `SELECT look_trait_definition_id,
       desired_value_confidence as d_conf,
       personal_value_confidence as p_conf
     FROM user_look_traits WHERE user_id = $1`,
    [userId]
  );

  const lookConfMap = new Map(userLookTraits.map(t => [t.look_trait_definition_id, Math.max(t.d_conf ?? 0, t.p_conf ?? 0)]));

  let met = 0, below = 0, missing = 0;
  let weightedReadinessSum = 0, totalWeight = 0;
  const unmet: string[] = [];

  for (const def of internalDefs) {
    const reqConf = def.required_confidence || 0.5;
    const w = def.weight;

    const conf = traitConfMap.get(def.id);
    if (conf == null) {
      missing++;
      if (w > 0) totalWeight += w;
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

  for (const def of externalDefs) {
    const reqConf = EXTERNAL_REQ_CONF;
    const w = def.weight;

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
    ? Math.round((weightedReadinessSum / totalWeight) * 1000) / 1000
    : 0;

  const profileComplete = met === total && total > 0;
  const readyForMatching = readinessScore >= 0.9;

  return {
    coverage_pct: coverage, met_count: met, below_count: below,
    missing_count: missing, total_count: total, profile_complete: profileComplete,
    readiness_score: readinessScore, ready_for_matching: readyForMatching, unmet_traits: unmet,
  };
}

/** Persist readiness_score and is_matchable on the user row */
export async function updateUserReadiness(_db: Database.Database, userId: number, cov: CoverageResult): Promise<void> {
  await pgQueryRun(
    "UPDATE users SET readiness_score = $1, is_matchable = $2, updated_at = NOW() WHERE id = $3",
    [cov.readiness_score, cov.ready_for_matching, userId]
  );
}

// ── Build transcript for analysis agent ──────────────────────

export async function buildAnalysisTranscript(
  _db: Database.Database,
  userId: number
): Promise<string> {
  const interviewerMsgs = await pgQueryAll<{ role: string; content: string }>(
    `SELECT role, content FROM conversation_messages
     WHERE user_id = $1 AND (guide IS NULL OR (guide != 'psychologist' AND guide NOT LIKE 'new_chat%'))
     ORDER BY created_at ASC, id ASC`,
    [userId]
  );

  const psychMsgs = await pgQueryAll<{ role: string; content: string }>(
    `SELECT role, content FROM conversation_messages
     WHERE user_id = $1 AND guide = 'psychologist'
     ORDER BY created_at ASC, id ASC`,
    [userId]
  );

  const newChatMsgs = await pgQueryAll<{ role: string; content: string }>(
    `SELECT role, content FROM conversation_messages
     WHERE user_id = $1 AND guide LIKE 'new_chat%'
     ORDER BY created_at ASC, id ASC`,
    [userId]
  );

  const parts: string[] = [];
  const availableParts = [interviewerMsgs.length > 0, psychMsgs.length > 0, newChatMsgs.length > 0].filter(Boolean).length;

  if (availableParts > 1) {
    parts.push("הנחיה: נתח את כל התמלילים הבאים. שיחת המעבדה (חלק 1) - תגובות לסימולציות ודילמות, שיחת העומק (חלק 2) - שיחה שוטפת ורגשית, והשיחה החופשית (חלק 3) - שיחת היכרות כללית. שלב את כולם לפרופיל אחד מדויק.\n");
  }

  if (interviewerMsgs.length > 0) {
    parts.push("### חלק 1: מעבדת האישיות (סימולציות ודילמות)");
    parts.push(interviewerMsgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n"));
  }

  if (psychMsgs.length > 0) {
    parts.push("\n### חלק 2: שיחת עומק (פסיכולוג)");
    parts.push(psychMsgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n"));
  }

  if (newChatMsgs.length > 0) {
    parts.push("\n### חלק 3: שיחה חופשית (היכרות כללית)");
    parts.push(newChatMsgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n"));
  }

  if (parts.length > 0) return parts.join("\n\n");

  // Fallback: old profiles table
  const allAnswers = await pgQueryAll<{ raw_answer: string }>(
    "SELECT raw_answer FROM profiles WHERE user_id = $1 ORDER BY created_at ASC",
    [userId]
  );

  return allAnswers
    .map((a, i) => `[Round ${i + 1}]\nUser: ${a.raw_answer}`)
    .join("\n\n");
}
