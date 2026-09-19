/**
 * Reanalysis Scan — daily cron that detects users needing trait re-analysis.
 *
 * Checks two QA channels for new messages since the user's last analysis:
 *
 * 1. qa_about_me (תובנות / מה למדת עליי):
 *    - 5-8 user messages → reanalyze "mbti" group only
 *    - 8+  user messages → full reanalysis
 *
 * 2. qa_refine (הוספה וחידוד):
 *    - 3-8 total messages (≥1 real user msg beyond trigger+reply) → reanalyze "general" group
 *    - 8+  total messages → full reanalysis
 *
 * After reanalysis, updates `last_analysis_at` so future scans only count new messages.
 *
 * Called by jobRunner on a daily schedule.
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import db from "../db";
import { buildAnalysisTranscript } from "../agents/conversation/analysisHelpers";
import { runAnalysisAgent, runSingleGroupAnalysis, buildAnalysisInput, saveAnalysisToDb, saveAnalysisRun } from "../agents/analysis";
import { updateCognitiveScore } from "../cognitiveScore";

// ── Types ────────────────────────────────────────────────────────

interface ReanalysisCandidate {
  id: number;
  first_name: string;
  last_analysis_at: string | null;
}

interface ChannelCounts {
  user_id: number;
  qa_about_me_user: number;
  qa_refine_total: number;
}

// ── Concurrency guard ────────────────────────────────────────────

let scanRunning = false;

// ── Main scan ────────────────────────────────────────────────────

export async function runReanalysisScan(): Promise<void> {
  if (scanRunning) {
    console.log("[reanalysis-scan] Skipping — previous scan still running");
    return;
  }

  scanRunning = true;
  try {
    await runReanalysisScanInner();
  } finally {
    scanRunning = false;
  }
}

async function runReanalysisScanInner(): Promise<void> {
  console.log("[reanalysis-scan] Starting daily scan...");

  // Find users who have completed at least one analysis run
  // Require last_analysis_at to be set — users analyzed before this feature
  // need a one-time backfill (set last_analysis_at = updated_at or NOW())
  const candidates = await pgQueryAll<ReanalysisCandidate>(
    `SELECT id, first_name, last_analysis_at::text
     FROM users
     WHERE COALESCE(analysis_run_count, 0) >= 1
       AND last_analysis_at IS NOT NULL
       AND test_user_type IS NULL
       AND self_frozen IS NOT TRUE`,
    []
  );

  if (!candidates.length) {
    console.log("[reanalysis-scan] No candidates found");
    return;
  }

  console.log(`[reanalysis-scan] Checking ${candidates.length} users...`);

  let reanalyzed = 0;

  for (const user of candidates) {
    try {
      const result = await checkAndReanalyze(user);
      if (result) reanalyzed++;
    } catch (err: any) {
      console.error(`[reanalysis-scan] Error for user ${user.id} (${user.first_name}):`, err.message);
    }
  }

  console.log(`[reanalysis-scan] Done — ${reanalyzed} users re-analyzed out of ${candidates.length} checked`);
}

// ── Per-user check ───────────────────────────────────────────────

async function checkAndReanalyze(user: ReanalysisCandidate): Promise<boolean> {
  const { id: userId, first_name, last_analysis_at } = user;

  // Count new messages since last analysis
  const counts = await getNewMessageCounts(userId, last_analysis_at);

  // Determine what to run
  const action = determineAction(counts);

  if (!action) return false;

  console.log(`[reanalysis-scan] User ${userId} (${first_name}): ${action.reason}`);

  // Build transcript (needed for both partial and full)
  const transcript = await buildAnalysisTranscript(db, userId);
  if (!transcript || transcript.length < 100) {
    console.log(`[reanalysis-scan] User ${userId}: transcript too short, skipping`);
    return false;
  }

  if (action.type === "full") {
    await runFullReanalysis(userId, transcript);
  } else {
    await runPartialReanalysis(userId, transcript, action.group);
  }

  // Update last_analysis_at
  await pgQueryAll(
    "UPDATE users SET last_analysis_at = NOW(), updated_at = NOW() WHERE id = $1",
    [userId]
  );

  return true;
}

// ── Message counting ─────────────────────────────────────────────

async function getNewMessageCounts(
  userId: number,
  lastAnalysisAt: string | null
): Promise<ChannelCounts> {
  const sinceClause = lastAnalysisAt
    ? `AND cm.created_at > $2::timestamptz`
    : "";
  const params: any[] = [userId];
  if (lastAnalysisAt) params.push(lastAnalysisAt);

  const row = await pgQueryOne<{ qa_about_me_user: string; qa_refine_total: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE cm.guide = 'qa_about_me' AND cm.role = 'user') AS qa_about_me_user,
       COUNT(*) FILTER (WHERE cm.guide = 'qa_refine') AS qa_refine_total
     FROM conversation_messages cm
     WHERE cm.user_id = $1 ${sinceClause}`,
    params
  );

  return {
    user_id: userId,
    qa_about_me_user: parseInt(row?.qa_about_me_user || "0", 10),
    qa_refine_total: parseInt(row?.qa_refine_total || "0", 10),
  };
}

// ── Decision logic ───────────────────────────────────────────────

interface ReanalysisAction {
  type: "full" | "partial";
  group: string;
  reason: string;
}

function determineAction(counts: ChannelCounts): ReanalysisAction | null {
  const { qa_about_me_user, qa_refine_total } = counts;

  // Full reanalysis takes priority if either channel has 8+ messages
  if (qa_about_me_user >= 8) {
    return {
      type: "full",
      group: "all",
      reason: `${qa_about_me_user} new qa_about_me user msgs → full reanalysis`,
    };
  }
  if (qa_refine_total >= 8) {
    return {
      type: "full",
      group: "all",
      reason: `${qa_refine_total} new qa_refine msgs → full reanalysis`,
    };
  }

  // Partial: qa_about_me 5-7 → mbti only
  if (qa_about_me_user >= 5) {
    return {
      type: "partial",
      group: "mbti",
      reason: `${qa_about_me_user} new qa_about_me user msgs → reanalyze mbti`,
    };
  }

  // Partial: qa_refine 3-7 → general only
  if (qa_refine_total >= 3) {
    return {
      type: "partial",
      group: "general",
      reason: `${qa_refine_total} new qa_refine msgs → reanalyze general`,
    };
  }

  return null;
}

// ── Reanalysis execution ─────────────────────────────────────────

async function runFullReanalysis(userId: number, transcript: string): Promise<void> {
  console.log(`[reanalysis-scan] User ${userId}: running full reanalysis...`);

  const input = await buildAnalysisInput(db, transcript);
  const output = await runAnalysisAgent(input, userId, "reanalysis_scan");

  const saved = await saveAnalysisToDb(db, userId, output);

  if (output._run_data) {
    await saveAnalysisRun(db, userId, output._run_data.generated_prompt, output._run_data.stage_a_output, output._run_data.stage_b_output, "reanalysis_scan");
  }

  const cogScore = await updateCognitiveScore(userId);

  console.log(`[reanalysis-scan] User ${userId}: full reanalysis DONE — ${saved.internal_saved} internal, ${saved.external_saved} external, cognitive=${cogScore}`);
}

async function runPartialReanalysis(userId: number, transcript: string, group: string): Promise<void> {
  console.log(`[reanalysis-scan] User ${userId}: running partial reanalysis (group="${group}")...`);

  const result = await runSingleGroupAnalysis(group, transcript, userId);

  if (group === "cognitive") {
    await updateCognitiveScore(userId);
  }

  console.log(`[reanalysis-scan] User ${userId}: group "${group}" done — ${result.internal_saved} internal, ${result.external_saved} external`);
}
