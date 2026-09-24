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
import { runUserNudges } from "./userNudges";
import { runReanalysisScan } from "./reanalysisScan";
import { promoteAllWaitingMatches } from "./photoMatchPromotion";
import { runDailyMatching, msUntilNextRun, setReconcileFn } from "./dailyMatching";
import { runPhotoNudges } from "./photoNudges";
import { runMessageNudges } from "./messageNudges";
import { runRatingNudges } from "./ratingNudges";
import { upsertUserInsights } from "../rag";

const JOB_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REANALYSIS_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MATCHING_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PHOTO_NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MESSAGE_NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATING_NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let reconcileHandle: ReturnType<typeof setInterval> | null = null;
let nudgeHandle: ReturnType<typeof setInterval> | null = null;
let reanalysisHandle: ReturnType<typeof setInterval> | null = null;
let matchingHandle: ReturnType<typeof setInterval> | null = null;
let photoNudgeHandle: ReturnType<typeof setInterval> | null = null;
let messageNudgeHandle: ReturnType<typeof setInterval> | null = null;
let ratingNudgeHandle: ReturnType<typeof setInterval> | null = null;

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

// ── Insights RAG chunk reconciliation ────────────────────────────

/**
 * Find users who have personal_insights_full in DB but no active RAG chunk,
 * and create the missing chunks. Runs daily to fix any upsert failures.
 */
async function reconcileInsightChunks(): Promise<number> {
  const rows = await pgQueryAll<{ id: number; personal_insights_full: string }>(
    `SELECT u.id, u.personal_insights_full FROM users u
     WHERE u.personal_insights_full IS NOT NULL AND u.personal_insights_full != ''
       AND NOT EXISTS (
         SELECT 1 FROM knowledge_chunks kc
         WHERE kc.scope = 'user' AND kc.user_id = u.id AND kc.category = 'insights' AND kc.active = TRUE
       )
     LIMIT 50`
  );

  if (rows.length === 0) return 0;

  console.log(`[reconcileInsightChunks] Found ${rows.length} users with insights but no active RAG chunk`);
  let created = 0;
  for (const row of rows) {
    try {
      await upsertUserInsights(row.id, row.personal_insights_full);
      created++;
    } catch (err: any) {
      console.error(`[reconcileInsightChunks] Failed for user ${row.id}:`, err.message);
    }
  }
  console.log(`[reconcileInsightChunks] Created ${created} insight chunks`);
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

  // Daily photo reconciliation + match promotion (run once on startup after 30s, then every 24h)
  setTimeout(() => {
    reconcilePhotoJobs().catch(err => {
      console.error("[jobRunner] Initial reconciliation error:", err.message);
    });
    promoteAllWaitingMatches().catch(err => {
      console.error("[jobRunner] Initial photo match promotion error:", err.message);
    });
  }, 30000);

  reconcileHandle = setInterval(() => {
    reconcilePhotoJobs().catch(err => {
      console.error("[jobRunner] Reconciliation error:", err.message);
    });
    promoteAllWaitingMatches().catch(err => {
      console.error("[jobRunner] Photo match promotion error:", err.message);
    });
  }, RECONCILE_INTERVAL_MS);

  // Daily reanalysis scan (check for users needing re-analysis based on new QA messages)
  // + Insights RAG chunk reconciliation (fix any failed upserts)
  // Run once on startup after 90s, then every 24h
  setTimeout(() => {
    runReanalysisScan().catch(err => {
      console.error("[jobRunner] Initial reanalysis scan error:", err.message);
    });
    reconcileInsightChunks().catch(err => {
      console.error("[jobRunner] Initial insight chunk reconciliation error:", err.message);
    });
  }, 90000);

  reanalysisHandle = setInterval(() => {
    runReanalysisScan().catch(err => {
      console.error("[jobRunner] Reanalysis scan error:", err.message);
    });
    reconcileInsightChunks().catch(err => {
      console.error("[jobRunner] Insight chunk reconciliation error:", err.message);
    });
  }, REANALYSIS_INTERVAL_MS);

  // All nudges run at 12:00 PM Israel time (reasonable hour for receiving emails)
  const msToNudges = msUntilNextRun(12);
  const hoursToNudges = Math.round(msToNudges / 1000 / 60 / 60 * 10) / 10;
  console.log(`[jobRunner] All nudges scheduled in ${hoursToNudges}h (12:00 Israel)`);

  setTimeout(() => {
    // Photo nudges first
    runPhotoNudges().catch(err => {
      console.error("[jobRunner] Photo nudge run error:", err.message);
    });
    // User nudges 30s later
    setTimeout(() => {
      runUserNudges().catch(err => {
        console.error("[jobRunner] Nudge run error:", err.message);
      });
    }, 30000);
    // Message nudges 60s later
    setTimeout(() => {
      runMessageNudges().catch(err => {
        console.error("[jobRunner] Message nudge run error:", err.message);
      });
    }, 60000);
    // Rating nudges 90s later
    setTimeout(() => {
      runRatingNudges().catch(err => {
        console.error("[jobRunner] Rating nudge run error:", err.message);
      });
    }, 90000);

    // Repeat every 24h
    photoNudgeHandle = setInterval(() => {
      runPhotoNudges().catch(err => {
        console.error("[jobRunner] Photo nudge run error:", err.message);
      });
    }, PHOTO_NUDGE_INTERVAL_MS);
    nudgeHandle = setInterval(() => {
      runUserNudges().catch(err => {
        console.error("[jobRunner] Nudge run error:", err.message);
      });
    }, NUDGE_INTERVAL_MS);
    messageNudgeHandle = setInterval(() => {
      runMessageNudges().catch(err => {
        console.error("[jobRunner] Message nudge run error:", err.message);
      });
    }, MESSAGE_NUDGE_INTERVAL_MS);
    ratingNudgeHandle = setInterval(() => {
      runRatingNudges().catch(err => {
        console.error("[jobRunner] Rating nudge run error:", err.message);
      });
    }, RATING_NUDGE_INTERVAL_MS);
  }, msToNudges);

  // Daily matching at 4:00 AM Israel time
  const msToFirstRun = msUntilNextRun(4);
  const hoursToFirstRun = Math.round(msToFirstRun / 1000 / 60 / 60 * 10) / 10;
  console.log(`[jobRunner] Daily matching scheduled in ${hoursToFirstRun}h`);

  setTimeout(() => {
    runDailyMatching().catch(err => {
      console.error("[jobRunner] Daily matching error:", err.message);
    });
    // After first run, repeat every 24h
    matchingHandle = setInterval(() => {
      runDailyMatching().catch(err => {
        console.error("[jobRunner] Daily matching error:", err.message);
      });
    }, MATCHING_INTERVAL_MS);
  }, msToFirstRun);
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
  if (nudgeHandle) {
    clearInterval(nudgeHandle);
    nudgeHandle = null;
  }
  if (reanalysisHandle) {
    clearInterval(reanalysisHandle);
    reanalysisHandle = null;
  }
  if (matchingHandle) {
    clearInterval(matchingHandle);
    matchingHandle = null;
  }
  if (photoNudgeHandle) {
    clearInterval(photoNudgeHandle);
    photoNudgeHandle = null;
  }
  if (messageNudgeHandle) {
    clearInterval(messageNudgeHandle);
    messageNudgeHandle = null;
  }
  if (ratingNudgeHandle) {
    clearInterval(ratingNudgeHandle);
    ratingNudgeHandle = null;
  }
  console.log("[jobRunner] Pipeline job runner stopped");
}
