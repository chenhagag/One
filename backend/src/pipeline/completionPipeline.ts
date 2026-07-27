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
import { generateInsights } from "./generateInsights";

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

  // ── Step 1: Generate insights ─────────────────────────────────
  // This is critical — if it fails, we stop (don't mark analysis_completed)
  console.log(`[pipeline] User ${userId}: step 1 — generating insights...`);
  const insightsResult = await generateInsights(userId);
  result.insights = {
    generated: !insightsResult.skipped,
    skipped: insightsResult.skipped,
    skipped_reason: insightsResult.skipped_reason,
  };
  await updateJobStep(jobId, "insights");
  console.log(`[pipeline] User ${userId}: insights done (generated=${!insightsResult.skipped})`);

  // ── Step 2: Mark analysis_completed ───────────────────────────
  await pgQueryAll(
    "UPDATE users SET analysis_completed = TRUE, updated_at = NOW() WHERE id = $1",
    [userId]
  );
  await updateJobStep(jobId, "analysis_completed");
  console.log(`[pipeline] User ${userId}: analysis_completed = true`);

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
