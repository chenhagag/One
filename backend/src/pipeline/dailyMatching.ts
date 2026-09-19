/**
 * Daily Matching — runs the full matching algorithm once per day.
 *
 * Executes at ~4:00 AM Israel time:
 *   Stage 1 (candidate pairs) → Stage 2 (scoring) → Reconcile (freeze/unfreeze + photo status)
 *
 * Called by jobRunner with a calculated delay to hit 4:00 AM.
 *
 * Future consideration: per-user triggers on profile change / reanalysis / pool entry
 * may be needed if once-daily isn't frequent enough.
 */

import db from "../db";
import { runStage1 } from "../matchStage1";
import { runStage2 } from "../matchStage2";
import { logActivity } from "./activityLog";

// reconcileMatchStatuses is defined in index.ts — we import it dynamically to avoid circular deps
let reconcileMatchStatuses: (() => Promise<{ frozen: number; unfrozen: number }>) | null = null;

export function setReconcileFn(fn: () => Promise<{ frozen: number; unfrozen: number }>) {
  reconcileMatchStatuses = fn;
}

export async function runDailyMatching(): Promise<void> {
  console.log("[daily-matching] Starting daily matching run...");

  try {
    const stage1 = await runStage1(db);
    console.log(`[daily-matching] Stage 1: ${stage1.pairs} pairs from ${stage1.users} users (${stage1.skipped} skipped)`);

    const stage2 = await runStage2(db);
    console.log(`[daily-matching] Stage 2: ${stage2.scored} scored, ${stage2.skipped} skipped`);

    let reconciled = { frozen: 0, unfrozen: 0 };
    if (reconcileMatchStatuses) {
      reconciled = await reconcileMatchStatuses();
      console.log(`[daily-matching] Reconcile: ${reconciled.frozen} frozen, ${reconciled.unfrozen} unfrozen`);
    }

    await logActivity("matching", null, null, "ריצה יומית",
      `pairs: ${stage1.pairs}, scored: ${stage2.scored}, frozen: ${reconciled.frozen}, unfrozen: ${reconciled.unfrozen}`
    );

    console.log("[daily-matching] Done.");
  } catch (err: any) {
    console.error("[daily-matching] Error:", err.message);
    await logActivity("matching", null, null, "שגיאה בריצה יומית", err.message).catch(() => {});
  }
}

/**
 * Calculate ms until next 4:00 AM Israel time.
 */
export function msUntilNextRun(targetHour = 4): number {
  const now = new Date();
  // Israel time = UTC+2 (winter) or UTC+3 (summer)
  const israelNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const target = new Date(israelNow);
  target.setHours(targetHour, 0, 0, 0);

  // If target already passed today, schedule for tomorrow
  if (target <= israelNow) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - israelNow.getTime();
}
