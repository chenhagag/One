/**
 * Auto-Analysis — Triggers full profile analysis at two points:
 *
 * Run 1: When the general chat closes (closing_stage >= 3)
 *         — even without cognitive/taste data
 * Run 2: When all channels are closed (general + cognitive + taste)
 *         — re-analyzes with full data
 *
 * Max 2 automatic runs per user. Admin can always run manual analysis.
 */

import db from "../../db";
import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../../db.pg";
import { buildAnalysisTranscript, computeCoverage } from "./analysisHelpers";
import { runAnalysisAgent, buildAnalysisInput, saveAnalysisToDb, saveAnalysisRun } from "../analysis";
import { updateCognitiveScore } from "../../cognitiveScore";

// ── Auto-analysis execution ─────────────────────────────────────

/**
 * Run full analysis in the background. Call without await for non-blocking.
 */
async function runAnalysis(userId: number, runNumber: number): Promise<void> {
  try {
    console.log(`[auto-analysis] User ${userId}: starting run #${runNumber}...`);

    // Increment run count immediately to prevent duplicate triggers
    await pgQueryAll(
      "UPDATE users SET auto_analyzed = TRUE, analysis_run_count = $2 WHERE id = $1",
      [userId, runNumber]
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

    // Save raw output for admin display
    if (output._run_data) {
      await saveAnalysisRun(db, userId, output._run_data.generated_prompt, output._run_data.stage_a_output, output._run_data.stage_b_output, `auto_run_${runNumber}`);
    }

    // Update cognitive score
    const cogScore = await updateCognitiveScore(userId);

    // Update coverage / matchable status
    const cov = await computeCoverage(db, userId);

    console.log(`[auto-analysis] User ${userId}: run #${runNumber} DONE — ${saved.internal_saved} internal, ${saved.external_saved} external traits, cognitive=${cogScore}, matchable=${cov.ready_for_matching}`);
  } catch (err: any) {
    console.error(`[auto-analysis] User ${userId}: run #${runNumber} ERROR —`, err.message);
  }
}

/**
 * Trigger analysis after general chat closes (run 1).
 * Requirements: closing_stage >= 3 on general chat, run count = 0.
 */
export async function maybeAutoAnalyzeAfterChat(userId: number): Promise<void> {
  const user = await pgQueryOne<{ analysis_run_count: number }>(
    "SELECT COALESCE(analysis_run_count, 0) as analysis_run_count FROM users WHERE id = $1",
    [userId]
  );
  if (!user || user.analysis_run_count >= 1) return;

  console.log(`[auto-analysis] User ${userId}: general chat closed, triggering run #1`);
  runAnalysis(userId, 1).catch(() => {});
}

/**
 * Trigger analysis after all channels are complete (run 2).
 * Requirements: cognitive done + taste done + run count = 1.
 */
export async function maybeAutoAnalyzeAfterAll(userId: number): Promise<void> {
  const user = await pgQueryOne<{ analysis_run_count: number }>(
    "SELECT COALESCE(analysis_run_count, 0) as analysis_run_count FROM users WHERE id = $1",
    [userId]
  );
  if (!user || user.analysis_run_count >= 2) return;

  // Check that cognitive and taste are done
  const result = await pgQueryOne<{ cog: string; taste: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE guide = 'new_chat_cognitive') as cog,
       COUNT(*) FILTER (WHERE guide = 'new_chat_taste') as taste
     FROM conversation_messages
     WHERE user_id = $1 AND role = 'user' AND guide IN ('new_chat_cognitive', 'new_chat_taste')`,
    [userId]
  );
  const cogCount = parseInt(result?.cog || "0", 10);
  const tasteCount = parseInt(result?.taste || "0", 10);

  if (cogCount < 5 || tasteCount < 5) return;

  console.log(`[auto-analysis] User ${userId}: all channels complete, triggering run #2`);
  runAnalysis(userId, 2).catch(() => {});
}

/**
 * Legacy compatibility — called from existing code paths.
 * Checks if run 1 or run 2 should trigger.
 */
export async function maybeAutoAnalyze(userId: number): Promise<void> {
  const user = await pgQueryOne<{ analysis_run_count: number }>(
    "SELECT COALESCE(analysis_run_count, 0) as analysis_run_count FROM users WHERE id = $1",
    [userId]
  );
  if (!user || user.analysis_run_count >= 2) return;

  if (user.analysis_run_count === 0) {
    // Not yet analyzed — legacy path, keep existing behavior (summary + cognitive check)
    return;
  }
  if (user.analysis_run_count === 1) {
    // Already ran once — check if all channels done for run 2
    await maybeAutoAnalyzeAfterAll(userId);
  }
}
