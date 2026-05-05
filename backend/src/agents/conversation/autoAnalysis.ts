/**
 * Auto-Analysis — Triggers full profile analysis once conditions are met.
 *
 * Conditions for auto-analysis:
 * 1. User summary is sufficiently complete (≥5 of 8 content fields filled)
 * 2. User has at least 5 cognitive/simulation messages
 * 3. Auto-analysis hasn't already run for this user
 *
 * Runs in the background — does not block chat responses.
 */

import db from "../../db";
import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../../db.pg";
import { getUserSummary, type UserChatSummary } from "./summarizer";
import { buildAnalysisTranscript } from "./orchestrator";
import { runAnalysisAgent, buildAnalysisInput, saveAnalysisToDb } from "../analysis";
import { computeCoverage } from "./index";
import { updateCognitiveScore } from "../../cognitiveScore";

// ── Config ──────────────────────────────────────────────────────

/** Minimum filled fields in summary to consider it "complete enough" */
const MIN_SUMMARY_FIELDS = 5;

/** Minimum user messages in cognitive chat */
const MIN_COGNITIVE_MESSAGES = 5;

// ── Readiness check ─────────────────────────────────────────────

/**
 * Count how many content fields in the summary are filled (non-null, non-empty).
 */
function countFilledFields(summary: UserChatSummary): number {
  const fields = [
    summary.general_info,
    summary.occupation,
    summary.background_culture,
    summary.social_style,
    summary.taste_and_style,
    summary.relationships,
    summary.values,
    summary.intellectual_world,
  ];
  return fields.filter(f => f && f.trim().length > 0).length;
}

/**
 * Check if all conditions for auto-analysis are met.
 */
export async function checkAutoAnalysisReady(userId: number): Promise<{
  ready: boolean;
  reason?: string;
}> {
  // 1. Check if already auto-analyzed
  const user = await pgQueryOne<{ auto_analyzed: boolean }>(
    "SELECT auto_analyzed FROM users WHERE id = $1",
    [userId]
  );
  if (!user) return { ready: false, reason: "user_not_found" };
  if (user.auto_analyzed) return { ready: false, reason: "already_analyzed" };

  // 2. Check summary completeness
  const { summary } = await getUserSummary(userId);
  if (!summary) return { ready: false, reason: "no_summary" };

  const filledFields = countFilledFields(summary);
  if (filledFields < MIN_SUMMARY_FIELDS) {
    return { ready: false, reason: `summary_incomplete (${filledFields}/${MIN_SUMMARY_FIELDS})` };
  }

  // 3. Check cognitive messages count (user messages only)
  const cogResult = await pgQueryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM conversation_messages
     WHERE user_id = $1 AND guide = 'new_chat_cognitive' AND role = 'user'`,
    [userId]
  );
  const cogCount = parseInt(cogResult?.count || "0", 10);
  if (cogCount < MIN_COGNITIVE_MESSAGES) {
    return { ready: false, reason: `cognitive_insufficient (${cogCount}/${MIN_COGNITIVE_MESSAGES})` };
  }

  return { ready: true };
}

// ── Auto-analysis execution ─────────────────────────────────────

/**
 * Run full analysis in the background. Call without await for non-blocking.
 */
export async function triggerAutoAnalysis(userId: number): Promise<void> {
  try {
    console.log(`[auto-analysis] User ${userId}: starting automatic analysis...`);

    // Mark as analyzed immediately to prevent duplicate triggers
    await pgQueryAll(
      "UPDATE users SET auto_analyzed = TRUE WHERE id = $1",
      [userId]
    );

    // Build transcript (includes all three chat types)
    const transcript = await buildAnalysisTranscript(db, userId);
    if (!transcript || transcript.length < 100) {
      console.log(`[auto-analysis] User ${userId}: transcript too short (${transcript.length} chars), aborting`);
      return;
    }

    console.log(`[auto-analysis] User ${userId}: transcript=${transcript.length} chars, running analysis...`);

    // Build input and run analysis
    const input = await buildAnalysisInput(db, transcript);
    const output = await runAnalysisAgent(input, userId, "auto_analysis");

    // Save results
    const saved = await saveAnalysisToDb(db, userId, output);

    // Update cognitive score
    const cogScore = await updateCognitiveScore(userId);

    // Update coverage / matchable status
    const cov = await computeCoverage(db, userId);

    console.log(`[auto-analysis] User ${userId}: DONE — ${saved.internal_saved} internal, ${saved.external_saved} external traits, cognitive=${cogScore}, matchable=${cov.ready_for_matching}`);
  } catch (err: any) {
    console.error(`[auto-analysis] User ${userId}: ERROR —`, err.message);
    // Don't revert auto_analyzed flag — we don't want to retry on error
    // Admin can always run manual reanalysis
  }
}

/**
 * Check readiness and trigger if ready. Safe to call frequently — no-ops if not ready.
 */
export async function maybeAutoAnalyze(userId: number): Promise<void> {
  const { ready, reason } = await checkAutoAnalysisReady(userId);
  if (ready) {
    // Fire and forget — don't await
    triggerAutoAnalysis(userId).catch(() => {});
  } else {
    // Only log if it's close to ready (has summary but missing cognitive)
    if (reason && reason.startsWith("cognitive_insufficient")) {
      console.log(`[auto-analysis] User ${userId}: not ready yet — ${reason}`);
    }
  }
}
