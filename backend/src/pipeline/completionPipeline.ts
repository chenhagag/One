/**
 * Completion Pipeline — runs when a user finishes all chat channels.
 *
 * Steps (with dependency rules):
 * 1. Generate final insights (if insights fail → stop, don't mark completed)
 * 2. Mark analysis_completed = true
 * 3. Enter matching pool (atomic UPDATE with RETURNING)
 * 4. Send welcome email (only if actually entered pool; email failure is non-blocking)
 *
 * Called by the job runner, not directly.
 */

import db from "../db";
import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { computeCoverage, updateUserReadiness } from "../agents/conversation";
// NOTE: Insights generation is now handled manually by Claude agent (daily pipeline run).
// The auto-generated insights were too generic. See Docs/insights-writing-guide.md.

export interface CompletionResult {
  insights: { generated: boolean; skipped?: boolean; skipped_reason?: string };
  pool: { entered: boolean; already_in_pool?: boolean };
  email: { sent: boolean; skipped_reason?: string };
}

/**
 * Run the completion pipeline for a user.
 * Updates step_reached on the job row as each step completes.
 */
export async function runCompletionPipeline(
  userId: number,
  jobId: number
): Promise<CompletionResult> {
  const result: CompletionResult = {
    insights: { generated: false },
    pool: { entered: false },
    email: { sent: false },
  };

  // ── Step 1: Skip insights — handled by Claude agent daily run ──
  // Auto-generated insights were too generic. Claude writes them manually
  // during the daily pipeline run. See Docs/insights-writing-guide.md.
  result.insights = { generated: false, skipped: true, skipped_reason: "manual_by_claude_agent" };
  await updateJobStep(jobId, "insights_skipped");
  console.log(`[pipeline] User ${userId}: insights skipped (handled by Claude agent)`);

  // ── Step 2: Skip marking analysis_completed — admin reviews first
  // (analysis_completed stays FALSE until admin manually approves)
  await updateJobStep(jobId, "analysis_completed_skipped");
  console.log(`[pipeline] User ${userId}: analysis_completed NOT set (admin will review)`);

  // ── Step 2.5: Recompute coverage (for matchStage accuracy) ────
  const cov = await computeCoverage(db, userId);
  await updateUserReadiness(db, userId, cov);

  // ── Step 3: Enter matching pool (atomic) ──────────────────────
  const poolEntry = await pgQueryOne<{ id: number }>(
    `UPDATE users SET in_matching_pool = TRUE, updated_at = NOW()
     WHERE id = $1 AND in_matching_pool = FALSE
     RETURNING id`,
    [userId]
  );

  if (poolEntry) {
    result.pool = { entered: true };
    await updateJobStep(jobId, "pool_entered");
    console.log(`[pipeline] User ${userId}: entered matching pool`);

    // ── Step 4: Mark email pending (admin sends manually) ─────
    await pgQueryAll(
      "UPDATE users SET pool_email_pending = TRUE WHERE id = $1",
      [userId]
    );
    await updateJobStep(jobId, "email_pending");
    result.email = { sent: false, skipped_reason: "pending_admin" };
    console.log(`[pipeline] User ${userId}: pool_email_pending = true (admin will send manually)`);
  } else {
    result.pool = { entered: false, already_in_pool: true };
    console.log(`[pipeline] User ${userId}: already in matching pool`);
  }

  return result;
}

async function updateJobStep(jobId: number, step: string): Promise<void> {
  await pgQueryAll(
    "UPDATE pipeline_jobs SET step_reached = $1 WHERE id = $2",
    [step, jobId]
  );
}
