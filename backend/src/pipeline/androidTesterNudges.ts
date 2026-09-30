/**
 * Android Tester Nudges — push reminders for the 13 Android testers.
 *
 * These are personal friends/family testing the Android app, NOT real users.
 * Sends a push every 2 days at 13:00 asking them to open the app
 * so Google Play sees activity.
 *
 * IMPORTANT: This targets ONLY the hardcoded email list below.
 */

import { queryAll as pgQueryAll, queryOne as pgQueryOne } from "../db.pg";
import { sendPushOnly, NotifyPayload } from "../notifications";

// ── Hardcoded tester list (13 users) ────────────────────────────
const TESTER_EMAILS = [
  "natalys73337@gmail.com",
  "anchu.gross@gmail.com",
  "hagar.david84@gmail.com",
  "bsc545@gmail.com",
  "galsedai@gmail.com",
  "shani.zandberg@gmail.com",
  "ron915228@gmail.com",
  "hindies@gmail.com",
  "elishmaya@gmail.com",
  "yonam92@gmail.com",
  "hedva.hagag@gmail.com",
  "shovalzandberg1@gmail.com",
  "ayagall@gmail.com",
];

const EVENT_TYPE = "android_tester_reminder";

export async function runAndroidTesterNudges(force = false): Promise<{ candidates: number; sent: number; skipped: number }> {
  const result = { candidates: 0, sent: 0, skipped: 0 };

  // Only run in production (unless forced for testing)
  if (!force && (process.env.NODE_ENV !== "production" || process.env.STAGING_URL)) {
    console.log("[androidTesterNudges] Skipping (not production)");
    return result;
  }

  // Find users matching the tester email list
  const placeholders = TESTER_EMAILS.map((_, i) => `$${i + 1}`).join(", ");
  const testers = await pgQueryAll<{ id: number; first_name: string; gender: string | null; email: string }>(
    `SELECT id, first_name, gender, email FROM users WHERE email IN (${placeholders})`,
    TESTER_EMAILS
  );

  result.candidates = testers.length;
  console.log(`[androidTesterNudges] Found ${testers.length} testers in DB`);

  for (const user of testers) {
    // Check if we already sent this nudge in the last 44 hours (leave buffer for 48h cadence)
    const recentlySent = await pgQueryOne<{ id: number }>(
      `SELECT id FROM notification_log
       WHERE user_id = $1 AND event_type = $2 AND success = TRUE
         AND sent_at > NOW() - INTERVAL '44 hours'
       LIMIT 1`,
      [user.id, EVENT_TYPE]
    );

    if (recentlySent) {
      result.skipped++;
      continue;
    }

    // Gender-aware copy
    const isFemale = user.gender === "woman";
    const isMale = user.gender === "man";
    const body = isFemale
      ? "פליז כנסי ותעשי כמה פעולות באפליקציה כדי שגוגל יראו פעילות :("
      : isMale
        ? "פליז כנס ותעשה כמה פעולות באפליקציה כדי שגוגל יראו פעילות :("
        : "פליז כנסו ותעשו כמה פעולות באפליקציה כדי שגוגל יראו פעילות :(";

    const payload: NotifyPayload = {
      title: "תזכורת מ-One",
      body,
      event_type: EVENT_TYPE,
    };

    try {
      // sendPushOnly — no email fallback, no preference checks, bypasses couple tester filters
      const res = await sendPushOnly(user.id, payload);
      if (res.success) {
        result.sent++;
        console.log(`[androidTesterNudges] Sent to ${user.first_name} (${user.email}) via ${res.channel}`);
      } else {
        result.skipped++;
        console.log(`[androidTesterNudges] Failed for ${user.first_name}: ${res.error}`);
      }
    } catch (err: any) {
      result.skipped++;
      console.error(`[androidTesterNudges] Error for user ${user.id}: ${err.message}`);
    }
  }

  console.log(`[androidTesterNudges] Done. Sent: ${result.sent}, Skipped: ${result.skipped}`);
  return result;
}
