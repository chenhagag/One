/**
 * Rating nudge system — reminds users to respond to pending match ratings.
 *
 * Targets users where `sent_for_rating_to` is set and match status is
 * `waiting_first_rating` or `waiting_second_rating`.
 *
 * Reminder schedule (from sent_for_rating_at):
 * Reminder 1: +2 days
 * Reminder 2: +5 days
 * Reminder 3: +12 days (last)
 *
 * Stops automatically when user rates (sent_for_rating_to cleared),
 * self-freezes (sent_for_rating_to cleared), or match is cancelled.
 *
 * Tracking: notification_log event_types: rating_reminder_1..3
 *
 * Only runs in production (unless forced by admin).
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { notifyUser, NotifyPayload, wasAnyNudgeSentToday } from "../notifications";
import { logActivity } from "./activityLog";

// ── Types ────────────────────────────────────────────────────────

interface PendingRating {
  match_id: number;
  user_id: number;
  sent_for_rating_at: string;
  first_name: string | null;
  gender: string | null;
  email: string | null;
}

interface RatingNudgeResult {
  candidates: number;
  reminder1: number;
  reminder2: number;
  reminder3: number;
  errors: number;
  errorDetails: string[];
}

// ── Helpers ──────────────────────────────────────────────────────

function gn(gender: string | null, m: string, f: string): string {
  return gender === "woman" ? f : m;
}

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

// ── Step detection (from notification_log) ──────────────────────

async function getRatingReminderStep(userId: number, sentAt: Date): Promise<number> {
  const row = await pgQueryOne<{ max_step: number }>(
    `SELECT COALESCE(MAX(
       CASE
         WHEN event_type = 'rating_reminder_1' THEN 1
         WHEN event_type = 'rating_reminder_2' THEN 2
         WHEN event_type = 'rating_reminder_3' THEN 3
         ELSE 0
       END
     ), 0) AS max_step
     FROM notification_log
     WHERE user_id = $1
       AND event_type LIKE 'rating_reminder_%'
       AND sent_at > $2`,
    [userId, sentAt.toISOString()]
  );
  return row?.max_step ?? 0;
}

// ── Email builder ───────────────────────────────────────────────

const EMAIL_FOOTER = `<div dir="rtl" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center;line-height:1.8">
<p style="margin:0">לא ניתן להשיב למייל זה.</p>
<p style="margin:4px 0 0">מוזמנים לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a></p>
</div>`;

function buildRatingReminderEmail(name: string, gender: string | null): string {
  const g = (m: string, f: string) => gn(gender, m, f);

  return `<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e; line-height: 1.8;">
  <img src="https://joinone.io/appLogo.png" alt="One" style="height: 44px; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
  <h2 style="font-size: 20px; margin: 0 0 16px;">תזכורת מ-One</h2>
  <div style="font-size: 15px;">
    <p>היי ${name},</p>
    <p>מצאנו ${g("לך", "לך")} התאמה פוטנציאלית ב-One!</p>
    <p>${g("כנס", "כנסי")} למערכת כדי לראות את הפרטים ${g("ולהגיב", "ולהגיב")}.</p>
  </div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:15px">${g("כנס", "כנסי")} לראות</a>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">One</p>
</div>` + EMAIL_FOOTER;
}

// ── Send reminder ───────────────────────────────────────────────

async function sendRatingReminder(
  p: PendingRating,
  step: number
): Promise<true | string> {
  const g = (m: string, f: string) => gn(p.gender, m, f);

  const payload: NotifyPayload = {
    title: "תזכורת מ-One",
    body: `מצאנו לך התאמה פוטנציאלית — ${g("כנס", "כנסי")} לראות ולהגיב`,
    event_type: `rating_reminder_${step}`,
    emailHtml: buildRatingReminderEmail(p.first_name || "", p.gender),
  };

  const result = await notifyUser(p.user_id, payload);
  if (!result.success) {
    return result.error || "notification_failed";
  }
  return true;
}

// ── Timing ──────────────────────────────────────────────────────

const REMINDER_SCHEDULE: Record<number, number> = {
  1: 2,   // +2 days
  2: 5,   // +5 days
  3: 12,  // +12 days (last)
};

// ── Main runner ─────────────────────────────────────────────────

export async function runRatingNudges(force = false): Promise<RatingNudgeResult> {
  const result: RatingNudgeResult = {
    candidates: 0,
    reminder1: 0, reminder2: 0, reminder3: 0,
    errors: 0,
    errorDetails: [],
  };

  if (!force && process.env.NODE_ENV !== "production") {
    console.log("[ratingNudges] Skipping (not production)");
    return result;
  }

  console.log("[ratingNudges] Starting rating nudge run...");

  // Find all pending ratings: sent_for_rating_to is set, status is waiting_*
  // Exclude: test users, couples, frozen, @test.com
  const pending = await pgQueryAll<PendingRating>(`
    SELECT m.id AS match_id, m.sent_for_rating_to AS user_id, m.sent_for_rating_at,
           u.first_name, u.gender, u.email
    FROM matches m
    JOIN users u ON u.id = m.sent_for_rating_to
    WHERE m.sent_for_rating_to IS NOT NULL
      AND m.sent_for_rating_at IS NOT NULL
      AND m.status IN ('waiting_first_rating', 'waiting_second_rating')
      AND u.partner_name IS NULL
      AND COALESCE(u.test_user_type, '') != 'Couple Tester'
      AND COALESCE(u.self_frozen, FALSE) = FALSE
      AND COALESCE(u.email, '') NOT LIKE '%@test.com'
    ORDER BY m.sent_for_rating_at ASC
  `);

  result.candidates = pending.length;

  for (const p of pending) {
    try {
      // Global cooldown: skip if any nudge was sent today
      if (await wasAnyNudgeSentToday(p.user_id)) continue;

      const sentAt = new Date(p.sent_for_rating_at);
      const days = daysSince(sentAt);
      const currentStep = await getRatingReminderStep(p.user_id, sentAt);

      let nextStep = 0;
      if (currentStep < 1 && days >= REMINDER_SCHEDULE[1]) nextStep = 1;
      else if (currentStep < 2 && days >= REMINDER_SCHEDULE[2]) nextStep = 2;
      else if (currentStep < 3 && days >= REMINDER_SCHEDULE[3]) nextStep = 3;

      if (nextStep > 0) {
        const res = await sendRatingReminder(p, nextStep);
        if (res === true) {
          (result as any)[`reminder${nextStep}`]++;
        } else {
          result.errors++;
          result.errorDetails.push(`match ${p.match_id} user ${p.user_id} (${p.first_name || "?"}): ${res}`);
        }
      }
    } catch (err: any) {
      const detail = `match ${p.match_id} user ${p.user_id} (${p.first_name || "?"}): ${err.message}`;
      console.error(`[ratingNudges] Error: ${detail}`);
      result.errors++;
      result.errorDetails.push(detail);
    }
  }

  const totalSent = result.reminder1 + result.reminder2 + result.reminder3;
  const errorSummary = result.errorDetails.length > 0 ? ` | errors: ${result.errorDetails.join("; ")}` : "";
  const summary = `candidates: ${result.candidates}, sent: ${totalSent}, errors: ${result.errors}${errorSummary}`;

  console.log(
    `[ratingNudges] Done. Reminders: ${result.reminder1}/${result.reminder2}/${result.reminder3}, Errors: ${result.errors}`
  );

  logActivity("rating_nudge_run", null, null, "daily_run", summary).catch(() => {});

  return result;
}
