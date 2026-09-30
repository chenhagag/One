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
  pool: { entered: boolean; already_in_pool?: boolean; blocked_reason?: string };
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

  // ── Step 3: Enter matching pool (only if fully ready) ────────
  // Check prerequisites: all channels closed + has photo + profile details
  const readiness = await pgQueryOne<{
    has_photo: boolean;
    age: number | null;
    city: string | null;
    general_closed: boolean;
    cog_done: boolean;
    taste_done: boolean;
  }>(`
    SELECT
      EXISTS(SELECT 1 FROM user_photos WHERE user_id = $1) AS has_photo,
      u.age,
      u.city,
      COALESCE((s.topic_injection_counts->>'general_closing_stage')::int, 0) >= 3 AS general_closed,
      COALESCE((s.topic_injection_counts->>'cognitive_closing_stage')::int, 0) >= 3
        OR (SELECT COUNT(*) FROM conversation_messages WHERE user_id = $1 AND role = 'user' AND guide = 'new_chat_cognitive') >= 7 AS cog_done,
      COALESCE((s.topic_injection_counts->>'taste_closing_stage')::int, 0) >= 3
        OR (SELECT COUNT(*) FROM conversation_messages WHERE user_id = $1 AND role = 'user' AND guide = 'new_chat_taste') >= 10 AS taste_done
    FROM users u
    LEFT JOIN user_chat_summaries s ON s.user_id = u.id
    WHERE u.id = $1
  `, [userId]);

  const missingReqs: string[] = [];
  if (!readiness?.general_closed) missingReqs.push("general chat not closed");
  if (!readiness?.cog_done) missingReqs.push("cognitive not done");
  if (!readiness?.taste_done) missingReqs.push("taste not done");
  if (!readiness?.has_photo) missingReqs.push("no photo");
  if (!readiness?.age) missingReqs.push("no age");
  if (!readiness?.city) missingReqs.push("no city");

  if (missingReqs.length > 0) {
    console.log(`[pipeline] User ${userId}: NOT entering pool — missing: ${missingReqs.join(", ")}`);
    result.pool = { entered: false, already_in_pool: false, blocked_reason: missingReqs.join(", ") };
    await updateJobStep(jobId, "pool_blocked");
    return result;
  }

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
