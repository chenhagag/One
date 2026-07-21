/**
 * Pipeline Job Runner — reliable background job processing.
 *
 * Jobs are persisted in the `pipeline_jobs` table. The runner:
 * - Polls every 2 minutes for pending/failed jobs
 * - Processes one job at a time per user (prevents concurrent runs)
 * - Retries failed jobs with exponential backoff (attempts * 5 min)
 * - Caps retries at max_attempts (default 3)
 *
 * Usage:
 *   createJob(userId, 'completion')  — create a job (idempotent)
 *   startJobRunner()                 — start the polling interval
 *   processPendingJobs()             — manual trigger (also called by interval)
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { runCompletionPipeline } from "./completionPipeline";
import { analyzeUserPhotos } from "./photoAnalysis";

const JOB_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let reconcileHandle: ReturnType<typeof setInterval> | null = null;

// ── Job creation ─────────────────────────────────────────────────

/**
 * Create a pipeline job. Idempotent — if a pending/running job already
 * exists for this user+type, returns the existing job ID.
 */
export async function createJob(
  userId: number,
  jobType: string,
  metadata?: Record<string, any>
): Promise<number> {
  // Check for existing active job (pending or running)
  const existing = await pgQueryOne<{ id: number }>(
    `SELECT id FROM pipeline_jobs
     WHERE user_id = $1 AND job_type = $2 AND status IN ('pending', 'running')
     LIMIT 1`,
    [userId, jobType]
  );

  if (existing) {
    console.log(`[jobRunner] Job already exists for user ${userId} type=${jobType} (id=${existing.id})`);
    return existing.id;
  }

  const row = await pgQueryOne<{ id: number }>(
    `INSERT INTO pipeline_jobs (user_id, job_type, status, metadata)
     VALUES ($1, $2, 'pending', $3)
     RETURNING id`,
    [userId, jobType, metadata ? JSON.stringify(metadata) : null]
  );

  console.log(`[jobRunner] Created job #${row!.id} for user ${userId} type=${jobType}`);
  return row!.id;
}

/**
 * Re-queue a failed job for retry, or create a new one if none exists.
 * Used by admin endpoint for manual re-trigger.
 */
export async function requeueOrCreateJob(
  userId: number,
  jobType: string,
  metadata?: Record<string, any>
): Promise<number> {
  // Reset any failed job back to pending
  const failed = await pgQueryOne<{ id: number }>(
    `UPDATE pipeline_jobs SET status = 'pending', next_retry_at = NULL, last_error = NULL
     WHERE user_id = $1 AND job_type = $2 AND status = 'failed' AND attempts < max_attempts
     RETURNING id`,
    [userId, jobType]
  );
  if (failed) {
    console.log(`[jobRunner] Re-queued failed job #${failed.id} for user ${userId}`);
    return failed.id;
  }

  return createJob(userId, jobType, metadata);
}

// ── Job processing ───────────────────────────────────────────────

interface PipelineJob {
  id: number;
  user_id: number;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
}

export async function processPendingJobs(): Promise<number> {
  const jobs = await pgQueryAll<PipelineJob>(
    `SELECT id, user_id, job_type, status, attempts, max_attempts
     FROM pipeline_jobs
     WHERE status IN ('pending', 'failed')
       AND attempts < max_attempts
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
     ORDER BY created_at ASC
     LIMIT 10`,
    []
  );

  if (!jobs.length) return 0;

  let processed = 0;
  for (const job of jobs) {
    // Skip if another job is already running for this user+type
    const running = await pgQueryOne<{ id: number }>(
      `SELECT id FROM pipeline_jobs
       WHERE user_id = $1 AND job_type = $2 AND status = 'running' AND id != $3
       LIMIT 1`,
      [job.user_id, job.job_type, job.id]
    );
    if (running) {
      console.log(`[jobRunner] Skipping job #${job.id} — another job running for user ${job.user_id}`);
      continue;
    }

    await processJob(job);
    processed++;
  }

  return processed;
}

async function processJob(job: PipelineJob): Promise<void> {
  const { id, user_id, job_type, attempts } = job;

  // Mark as running
  await pgQueryAll(
    `UPDATE pipeline_jobs SET status = 'running', started_at = NOW(), attempts = $1
     WHERE id = $2`,
    [attempts + 1, id]
  );

  console.log(`[jobRunner] Processing job #${id} (user=${user_id}, type=${job_type}, attempt=${attempts + 1})`);

  try {
    switch (job_type) {
      case "completion":
        await runCompletionPipeline(user_id, id);
        break;
      case "photo_analysis":
        await analyzeUserPhotos(user_id, id);
        break;
      default:
        throw new Error(`Unknown job type: ${job_type}`);
    }

    // Mark completed
    await pgQueryAll(
      `UPDATE pipeline_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [id]
    );
    console.log(`[jobRunner] Job #${id} completed successfully`);

  } catch (err: any) {
    const errorMsg = err.message?.slice(0, 2000) || "Unknown error";
    const nextAttempt = attempts + 1;
    const backoffMinutes = nextAttempt * 5;

    if (nextAttempt >= job.max_attempts) {
      // Max retries exhausted
      await pgQueryAll(
        `UPDATE pipeline_jobs SET status = 'failed', last_error = $1, completed_at = NOW()
         WHERE id = $2`,
        [errorMsg, id]
      );
      console.error(`[jobRunner] Job #${id} FAILED permanently after ${nextAttempt} attempts: ${errorMsg}`);
    } else {
      // Schedule retry
      await pgQueryAll(
        `UPDATE pipeline_jobs SET status = 'failed', last_error = $1,
         next_retry_at = NOW() + INTERVAL '${backoffMinutes} minutes'
         WHERE id = $2`,
        [errorMsg, id]
      );
      console.error(`[jobRunner] Job #${id} failed (attempt ${nextAttempt}/${job.max_attempts}), retry in ${backoffMinutes}min: ${errorMsg}`);
    }
  }
}

// ── Photo reconciliation (daily) ─────────────────────────────────

/**
 * Find users with photo_ai_consent + photos that haven't been analyzed
 * (or have new photos since last analysis), and create photo_analysis jobs.
 */
export async function reconcilePhotoJobs(): Promise<number> {
  // Find users who:
  // 1. Have photo_ai_consent = true
  // 2. Have analysis_run_count >= 2 (completed chat analysis)
  // 3. Have photos
  // 4. Don't have a recent completed photo_analysis job, OR have newer photos
  const candidates = await pgQueryAll<{ user_id: number }>(
    `SELECT DISTINCT u.id AS user_id
     FROM users u
     JOIN user_photos up ON up.user_id = u.id
     WHERE u.photo_ai_consent = TRUE
       AND COALESCE(u.analysis_run_count, 0) >= 2
       AND NOT EXISTS (
         SELECT 1 FROM pipeline_jobs pj
         WHERE pj.user_id = u.id
           AND pj.job_type = 'photo_analysis'
           AND pj.status IN ('pending', 'running')
       )
       AND (
         -- No completed photo analysis job at all
         NOT EXISTS (
           SELECT 1 FROM pipeline_jobs pj
           WHERE pj.user_id = u.id
             AND pj.job_type = 'photo_analysis'
             AND pj.status = 'completed'
         )
         OR
         -- Has photos uploaded after last completed analysis
         EXISTS (
           SELECT 1 FROM user_photos up2
           WHERE up2.user_id = u.id
             AND up2.created_at > (
               SELECT MAX(pj.completed_at) FROM pipeline_jobs pj
               WHERE pj.user_id = u.id
                 AND pj.job_type = 'photo_analysis'
                 AND pj.status = 'completed'
             )
         )
       )`,
    []
  );

  let created = 0;
  for (const c of candidates) {
    await createJob(c.user_id, "photo_analysis");
    created++;
  }

  if (created > 0) {
    console.log(`[reconcile] Created ${created} photo_analysis jobs`);
  }
  return created;
}

// ── Runner lifecycle ─────────────────────────────────────────────

export function startJobRunner(): void {
  if (intervalHandle) return; // Already running

  console.log(`[jobRunner] Starting pipeline job runner (poll every ${JOB_POLL_INTERVAL_MS / 1000}s)`);

  // Process immediately on startup (catch jobs from before restart)
  setTimeout(() => {
    processPendingJobs().catch(err => {
      console.error("[jobRunner] Initial poll error:", err.message);
    });
  }, 5000); // 5 second delay to let DB init complete

  intervalHandle = setInterval(() => {
    processPendingJobs().catch(err => {
      console.error("[jobRunner] Poll error:", err.message);
    });
  }, JOB_POLL_INTERVAL_MS);

  // Daily photo reconciliation (run once on startup after 30s, then every 24h)
  setTimeout(() => {
    reconcilePhotoJobs().catch(err => {
      console.error("[jobRunner] Initial reconciliation error:", err.message);
    });
  }, 30000);

  reconcileHandle = setInterval(() => {
    reconcilePhotoJobs().catch(err => {
      console.error("[jobRunner] Reconciliation error:", err.message);
    });
  }, RECONCILE_INTERVAL_MS);
}

export function stopJobRunner(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (reconcileHandle) {
    clearInterval(reconcileHandle);
    reconcileHandle = null;
  }
  console.log("[jobRunner] Pipeline job runner stopped");
}
