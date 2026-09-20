/**
 * Message/question nudge system — reminds users to answer unanswered questions/messages.
 *
 * Covers both:
 * - system_questions (closed questions with answer options)
 * - admin_messages with type="question" (open questions answered via chat)
 *
 * Reminder schedule (from creation/send date):
 * Reminder 1: +2 days
 * Reminder 2: +5 days
 * Reminder 3: +12 days (last)
 *
 * Match-linked questions mention "בנוגע להתאמה אפשרית" in copy.
 *
 * Tracking: notification_log event_types:
 *   system_question_reminder_1..3, admin_question_reminder_1..3
 *
 * Only runs in production (unless forced by admin).
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { notifyUser, NotifyPayload } from "../notifications";
import { logActivity } from "./activityLog";

// ── Types ────────────────────────────────────────────────────────

interface UnansweredSystemQuestion {
  id: number;
  user_id: number;
  question_text: string;
  match_id: number | null;
  created_at: string;
  first_name: string | null;
  gender: string | null;
  email: string | null;
}

interface UnansweredAdminMessage {
  user_id: number;
  admin_message: string;
  admin_message_match_id: number | null;
  admin_message_sent_at: string;
  first_name: string | null;
  gender: string | null;
  email: string | null;
}

interface MessageNudgeResult {
  system_questions_checked: number;
  admin_messages_checked: number;
  sq_reminder1: number;
  sq_reminder2: number;
  sq_reminder3: number;
  am_reminder1: number;
  am_reminder2: number;
  am_reminder3: number;
  errors: number;
  errorDetails: string[];
}

// ── Gender helper ────────────────────────────────────────────────

function gn(gender: string | null, m: string, f: string): string {
  return gender === "woman" ? f : m;
}

// ── Day-diff helper ─────────────────────────────────────────────

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

// ── Step detection (from notification_log) ──────────────────────

/**
 * Get how many reminders have already been sent for a system_question.
 * Counts reminders sent after the question was created.
 * Returns the highest step number (0 = none sent).
 */
async function getSystemQuestionReminderStep(userId: number, createdAt: Date): Promise<number> {
  const row = await pgQueryOne<{ max_step: number }>(
    `SELECT COALESCE(MAX(
       CASE
         WHEN event_type = 'system_question_reminder_1' THEN 1
         WHEN event_type = 'system_question_reminder_2' THEN 2
         WHEN event_type = 'system_question_reminder_3' THEN 3
         ELSE 0
       END
     ), 0) AS max_step
     FROM notification_log
     WHERE user_id = $1
       AND event_type LIKE 'system_question_reminder_%'
       AND sent_at > $2`,
    [userId, createdAt.toISOString()]
  );
  return row?.max_step ?? 0;
}

/**
 * Get how many reminders have been sent for the current admin_message question.
 * We track by checking notification_log after admin_message_sent_at.
 */
async function getAdminMessageReminderStep(userId: number, sentAt: Date): Promise<number> {
  const row = await pgQueryOne<{ max_step: number }>(
    `SELECT COALESCE(MAX(
       CASE
         WHEN event_type = 'admin_question_reminder_1' THEN 1
         WHEN event_type = 'admin_question_reminder_2' THEN 2
         WHEN event_type = 'admin_question_reminder_3' THEN 3
         ELSE 0
       END
     ), 0) AS max_step
     FROM notification_log
     WHERE user_id = $1
       AND event_type LIKE 'admin_question_reminder_%'
       AND sent_at > $2`,
    [userId, sentAt.toISOString()]
  );
  return row?.max_step ?? 0;
}

// ── Email builders ──────────────────────────────────────────────

const EMAIL_FOOTER = `<div dir="rtl" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center;line-height:1.8">
<p style="margin:0">לא ניתן להשיב למייל זה.</p>
<p style="margin:4px 0 0">מוזמנים לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a></p>
</div>`;

function buildReminderEmail(
  name: string,
  gender: string | null,
  type: "question" | "message",
  matchLinked: boolean
): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  const typeWord = type === "question" ? "שאלה" : "הודעה";
  const matchPhrase = matchLinked ? " בנוגע להתאמה אפשרית" : "";

  return `<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e; line-height: 1.8;">
  <img src="https://joinone.io/appLogo.png" alt="One" style="height: 44px; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
  <h2 style="font-size: 20px; margin: 0 0 16px;">תזכורת מ-One</h2>
  <div style="font-size: 15px;">
    <p>היי ${name},</p>
    <p>שלחנו לך ${typeWord}${matchPhrase} — נשמח לתשובתך כשנוח לך.</p>
  </div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:15px">${g("כנס", "כנסי")} לענות</a>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">One</p>
</div>` + EMAIL_FOOTER;
}

// ── Send reminder ───────────────────────────────────────────────

async function sendSystemQuestionReminder(
  q: UnansweredSystemQuestion,
  step: number
): Promise<true | string> {
  const g = (m: string, f: string) => gn(q.gender, m, f);
  const matchLinked = !!q.match_id;
  const matchPhrase = matchLinked ? " בנוגע להתאמה אפשרית" : "";

  const payload: NotifyPayload = {
    title: "תזכורת מ-One",
    body: `יש לנו שאלה${matchPhrase} שמחכה לך — ${g("כנס", "כנסי")} לענות`,
    event_type: `system_question_reminder_${step}` as any,
    data: { question_id: String(q.id) },
    emailHtml: buildReminderEmail(q.first_name || "", q.gender, "question", matchLinked),
  };

  const result = await notifyUser(q.user_id, payload);
  if (!result.success) {
    return result.error || "notification_failed";
  }
  return true;
}

async function sendAdminMessageReminder(
  m: UnansweredAdminMessage,
  step: number
): Promise<true | string> {
  const g = (mStr: string, f: string) => gn(m.gender, mStr, f);
  const matchLinked = !!m.admin_message_match_id;
  const matchPhrase = matchLinked ? " בנוגע להתאמה אפשרית" : "";

  const payload: NotifyPayload = {
    title: "תזכורת מ-One",
    body: `יש לנו הודעה${matchPhrase} שמחכה לך — ${g("כנס", "כנסי")} לענות`,
    event_type: `admin_question_reminder_${step}` as any,
    emailHtml: buildReminderEmail(m.first_name || "", m.gender, "message", matchLinked),
  };

  const result = await notifyUser(m.user_id, payload);
  if (!result.success) {
    return result.error || "notification_failed";
  }
  return true;
}

// ── Timing: step → minimum days since creation ──────────────────

const REMINDER_SCHEDULE: Record<number, number> = {
  1: 2,   // +2 days
  2: 5,   // +5 days
  3: 12,  // +12 days (last)
};

// ── Main runner ─────────────────────────────────────────────────

export async function runMessageNudges(force = false): Promise<MessageNudgeResult> {
  const result: MessageNudgeResult = {
    system_questions_checked: 0,
    admin_messages_checked: 0,
    sq_reminder1: 0, sq_reminder2: 0, sq_reminder3: 0,
    am_reminder1: 0, am_reminder2: 0, am_reminder3: 0,
    errors: 0,
    errorDetails: [],
  };

  if (!force && process.env.NODE_ENV !== "production") {
    console.log("[messageNudges] Skipping (not production)");
    return result;
  }

  console.log("[messageNudges] Starting message nudge run...");

  // ─── Part 1: Unanswered system_questions ────────────────────

  const unansweredQuestions = await pgQueryAll<UnansweredSystemQuestion>(`
    SELECT sq.id, sq.user_id, sq.question_text, sq.match_id, sq.created_at,
           u.first_name, u.gender, u.email
    FROM system_questions sq
    JOIN users u ON u.id = sq.user_id
    WHERE sq.answer IS NULL
      AND sq.context IS DISTINCT FROM 'blind_match'
      AND u.partner_name IS NULL
      AND COALESCE(u.test_user_type, '') != 'Couple Tester'
      AND COALESCE(u.self_frozen, FALSE) = FALSE
      AND COALESCE(u.email, '') NOT LIKE '%@test.com'
    ORDER BY sq.created_at ASC
  `);

  result.system_questions_checked = unansweredQuestions.length;

  for (const q of unansweredQuestions) {
    try {
      const createdAt = new Date(q.created_at);
      const days = daysSince(createdAt);
      const currentStep = await getSystemQuestionReminderStep(q.user_id, createdAt);

      // Determine next step
      let nextStep = 0;
      if (currentStep < 1 && days >= REMINDER_SCHEDULE[1]) nextStep = 1;
      else if (currentStep < 2 && days >= REMINDER_SCHEDULE[2]) nextStep = 2;
      else if (currentStep < 3 && days >= REMINDER_SCHEDULE[3]) nextStep = 3;

      if (nextStep > 0) {
        const res = await sendSystemQuestionReminder(q, nextStep);
        if (res === true) {
          (result as any)[`sq_reminder${nextStep}`]++;
        } else {
          result.errors++;
          result.errorDetails.push(`sq ${q.id} user ${q.user_id} (${q.first_name || "?"}): ${res}`);
        }
      }
    } catch (err: any) {
      const detail = `sq ${q.id} user ${q.user_id} (${q.first_name || "?"}): ${err.message}`;
      console.error(`[messageNudges] Error: ${detail}`);
      result.errors++;
      result.errorDetails.push(detail);
    }
  }

  // ─── Part 2: Unanswered admin_messages (type=question) ──────

  const unansweredMessages = await pgQueryAll<UnansweredAdminMessage>(`
    SELECT u.id AS user_id, u.admin_message, u.admin_message_match_id,
           u.admin_message_sent_at, u.first_name, u.gender, u.email
    FROM users u
    WHERE u.admin_message IS NOT NULL
      AND u.admin_message != ''
      AND u.admin_message_type = 'question'
      AND u.admin_message_dismissed = FALSE
      AND u.admin_message_responded_at IS NULL
      AND u.admin_message_sent_at IS NOT NULL
      AND u.partner_name IS NULL
      AND COALESCE(u.test_user_type, '') != 'Couple Tester'
      AND COALESCE(u.self_frozen, FALSE) = FALSE
      AND COALESCE(u.email, '') NOT LIKE '%@test.com'
    ORDER BY u.admin_message_sent_at ASC
  `);

  result.admin_messages_checked = unansweredMessages.length;

  for (const m of unansweredMessages) {
    try {
      const sentAt = new Date(m.admin_message_sent_at);
      const days = daysSince(sentAt);
      const currentStep = await getAdminMessageReminderStep(m.user_id, sentAt);

      let nextStep = 0;
      if (currentStep < 1 && days >= REMINDER_SCHEDULE[1]) nextStep = 1;
      else if (currentStep < 2 && days >= REMINDER_SCHEDULE[2]) nextStep = 2;
      else if (currentStep < 3 && days >= REMINDER_SCHEDULE[3]) nextStep = 3;

      if (nextStep > 0) {
        const res = await sendAdminMessageReminder(m, nextStep);
        if (res === true) {
          (result as any)[`am_reminder${nextStep}`]++;
        } else {
          result.errors++;
          result.errorDetails.push(`am user ${m.user_id} (${m.first_name || "?"}): ${res}`);
        }
      }
    } catch (err: any) {
      const detail = `am user ${m.user_id} (${m.first_name || "?"}): ${err.message}`;
      console.error(`[messageNudges] Error: ${detail}`);
      result.errors++;
      result.errorDetails.push(detail);
    }
  }

  // ─── Summary ────────────────────────────────────────────────

  const totalSent = result.sq_reminder1 + result.sq_reminder2 + result.sq_reminder3 +
                    result.am_reminder1 + result.am_reminder2 + result.am_reminder3;
  const errorSummary = result.errorDetails.length > 0 ? ` | errors: ${result.errorDetails.join("; ")}` : "";
  const summary = `sq_checked: ${result.system_questions_checked}, am_checked: ${result.admin_messages_checked}, sent: ${totalSent}, errors: ${result.errors}${errorSummary}`;

  console.log(
    `[messageNudges] Done. SQ reminders: ${result.sq_reminder1}/${result.sq_reminder2}/${result.sq_reminder3}, ` +
    `AM reminders: ${result.am_reminder1}/${result.am_reminder2}/${result.am_reminder3}, Errors: ${result.errors}`
  );

  logActivity("message_nudge_run", null, null, "daily_run", summary).catch(() => {});

  return result;
}
