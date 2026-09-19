/**
 * System Activity Log — unified logging for all automated jobs.
 *
 * Writes to `system_activity_log` table. Displayed in admin "לוג מערכת" tab.
 */

import { queryAll as pgQueryAll } from "../db.pg";

export async function logActivity(
  jobType: string,
  userId: number | null,
  userName: string | null,
  action: string,
  details?: string
): Promise<void> {
  try {
    await pgQueryAll(
      `INSERT INTO system_activity_log (job_type, user_id, user_name, action, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [jobType, userId, userName, action, details || null]
    );
  } catch (err: any) {
    console.error(`[activity-log] Failed to log: ${jobType}/${action} for user ${userId}:`, err.message);
  }
}
