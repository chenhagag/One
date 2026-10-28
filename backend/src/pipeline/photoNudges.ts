/**
 * Photo upload nudge system — reminds users without photos to upload one.
 *
 * Target: users with 0 photos, registered 3+ days ago, WW only, not frozen/test/couple.
 *
 * 3-step flow:
 * Step 1 (3+ days after registration):  push + email
 * Step 2 (5+ days after step 1):        push + email reminder
 * Step 3 (10+ days after step 2):       push + email last reminder
 *
 * After step 3: restart cycle after 14 days if still no photo.
 *
 * Tracking: notification_log event_types: photo_request_1..3
 * Also logs to system_activity_log.
 *
 * Only runs in production (unless force=true).
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { notifyUser, NotifyPayload, wasAnyNudgeSentToday, buildRichEmail } from "../notifications";
import { logActivity } from "./activityLog";

// ── Types ────────────────────────────────────────────────────────

interface PhotoNudgeCandidate {
  user_id: number;
  first_name: string | null;
  gender: string | null;
  looking_for_gender: string | null;
  email: string | null;
  created_at: string;
}

export interface PhotoNudgeResult {
  candidates: number;
  step1: number;
  step2: number;
  step3: number;
  errors: number;
  errorDetails: string[];
}

// ── Gender helper ────────────────────────────────────────────────

function gn(gender: string | null, m: string, f: string): string {
  return gender === "woman" ? f : m;
}

// ── Days since a date ───────────────────────────────────────────

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

// ── Check if user has photos ────────────────────────────────────

async function userHasPhotos(userId: number): Promise<boolean> {
  const row = await pgQueryOne<{ count: string }>(
    "SELECT COUNT(*) AS count FROM user_photos WHERE user_id = $1",
    [userId]
  );
  return row ? parseInt(row.count, 10) > 0 : false;
}

// ── Check what step user is on ───────────────────────────────────

async function getPhotoNudgeStep(userId: number): Promise<{
  step: number;          // 0 = not started, 1-3 = completed step
  lastSentAt: Date | null;
}> {
  const nudges = await pgQueryAll<{ event_type: string; sent_at: string }>(
    `SELECT event_type, sent_at FROM notification_log
     WHERE user_id = $1 AND success = TRUE
       AND event_type LIKE 'photo_request_%'
     ORDER BY sent_at DESC`,
    [userId]
  );

  if (nudges.length === 0) {
    return { step: 0, lastSentAt: null };
  }

  let maxStep = 0;
  let lastSentAt: Date | null = null;

  for (const n of nudges) {
    if (!lastSentAt || new Date(n.sent_at) > lastSentAt) {
      lastSentAt = new Date(n.sent_at);
    }
    const match = n.event_type.match(/^photo_request_(\d+)$/);
    if (match) {
      const step = parseInt(match[1], 10);
      if (step > maxStep) maxStep = step;
    }
  }

  return { step: maxStep, lastSentAt };
}

// ── Message content per step ────────────────────────────────────

function getStepContent(stepNumber: number, name: string, gender: string | null) {
  const g = (m: string, f: string) => gn(gender, m, f);

  switch (stepNumber) {
    case 1:
      return {
        title: "נשאר רק להעלות תמונה ואת במאגר \u{1F4F8}",
        body: `${g("כנס", "כנסי")} להעלות תמונה`,
        emailBody: `<p>היי ${name},</p>
<p>אנחנו כבר עובדות על הניתוח שלך. נשאר רק להעלות תמונה ונוכל להתחיל לחפש ${g("עבורך", "עבורך")} התאמה מדויקת.</p>`,
      };
    case 2:
      return {
        title: "רק תמונה ואת במאגר \u{1F4F8}",
        body: `נשאר רק להעלות תמונה — ${g("כנס", "כנסי")} להעלות`,
        emailBody: `<p>היי ${name},</p>
<p>תזכורת קטנה — נשאר רק להעלות תמונה ונוכל להתחיל לחפש ${g("עבורך", "עבורך")} את ההתאמה המדויקת.</p>`,
      };
    case 3:
      return {
        title: "עדיין מחכים לתמונה שלך \u{1F4F8}",
        body: "נשמח לראות אותך ולהתחיל לחפש",
        emailBody: `<p>היי ${name},</p>
<p>עדיין מחכים לתמונה שלך. ברגע שתעל${g("ה", "י")} תמונה נוכל להתחיל לחפש ${g("עבורך", "עבורך")} התאמה.</p>`,
      };
    default:
      throw new Error(`Invalid step number: ${stepNumber}`);
  }
}

// ── Send a nudge step ───────────────────────────────────────────

async function sendNudge(user: PhotoNudgeCandidate, stepNumber: number): Promise<true | string> {
  const name = user.first_name || "";
  const content = getStepContent(stepNumber, name, user.gender);

  const payload: NotifyPayload = {
    title: content.title,
    body: content.body,
    event_type: `photo_request_${stepNumber}`,
    emailHtml: buildRichEmail(
      content.title,
      content.emailBody,
      "להעלאת תמונה",
      user.user_id
    ),
  };

  try {
    const res = await notifyUser(user.user_id, payload);
    if (res.success) {
      logActivity("nudge", user.user_id, name, `photo_request_${stepNumber}`, `${res.channel}`).catch(() => {});
      return true;
    }
    return `step${stepNumber} notify failed: ${res.error || res.channel}`;
  } catch (err: any) {
    return `step${stepNumber} exception: ${err.message}`;
  }
}

// ── Main: run photo nudges ──────────────────────────────────────

export async function runPhotoNudges(force = false): Promise<PhotoNudgeResult> {
  const result: PhotoNudgeResult = {
    candidates: 0, step1: 0, step2: 0, step3: 0,
    errors: 0, errorDetails: [],
  };

  // Only run in production (unless forced by admin)
  if (!force && process.env.NODE_ENV !== "production") {
    console.log("[photoNudges] Skipping (not production)");
    return result;
  }

  console.log("[photoNudges] Starting photo nudge run...");

  // Find users without photos who registered 3+ days ago
  // WW only, not frozen/test/couple, has at least one page_view
  const candidates = await pgQueryAll<PhotoNudgeCandidate>(`
    SELECT u.id AS user_id, u.first_name, u.gender, u.looking_for_gender, u.email, u.created_at
    FROM users u
    WHERE (SELECT COUNT(*) FROM user_photos WHERE user_id = u.id) = 0
      AND u.created_at < NOW() - INTERVAL '3 days'
      AND u.partner_name IS NULL
      AND COALESCE(u.test_user_type, '') != 'Couple Tester'
      AND COALESCE(u.self_frozen, FALSE) = FALSE
      AND COALESCE(u.email, '') NOT LIKE '%@test.com'
      AND COALESCE(u.gender, '') != 'man'
      AND COALESCE(u.looking_for_gender, '') != 'man'
      AND EXISTS (SELECT 1 FROM page_views WHERE user_id = u.id LIMIT 1)
  `);

  result.candidates = candidates.length;

  for (const user of candidates) {
    try {
      // Double-check: user still has no photos
      if (await userHasPhotos(user.user_id)) continue;

      // Global cooldown: skip if any nudge was sent today
      if (await wasAnyNudgeSentToday(user.user_id)) continue;

      const { step, lastSentAt } = await getPhotoNudgeStep(user.user_id);

      // Helper: track send result
      const track = (res: true | string, successKey: keyof PhotoNudgeResult) => {
        if (res === true) { (result as any)[successKey]++; }
        else {
          result.errors++;
          result.errorDetails.push(`user ${user.user_id} (${user.first_name || "?"}): ${res}`);
        }
      };

      // Skip if admin already sent a photo request manually (treat as step 1 done)
      const manualRequest = await pgQueryOne<{ photo_request_sent_at: string | null }>(
        "SELECT photo_request_sent_at FROM users WHERE id = $1",
        [user.user_id]
      );

      // After step 3, restart cycle after 14 days
      if (step >= 3) {
        if (lastSentAt && daysSince(lastSentAt) >= 14) {
          track(await sendNudge(user, 1), "step1");
        }
        continue;
      }

      if (step === 0 && manualRequest?.photo_request_sent_at) {
        // Admin sent manually — treat as step 1 done, check if ready for step 2
        const manualDate = new Date(manualRequest.photo_request_sent_at);
        if (daysSince(manualDate) >= 5) {
          track(await sendNudge(user, 2), "step2");
        }
      } else if (step === 0) {
        // Step 1: 3+ days after registration (already filtered in query)
        track(await sendNudge(user, 1), "step1");
      } else if (step === 1 && lastSentAt && daysSince(lastSentAt) >= 5) {
        track(await sendNudge(user, 2), "step2");
      } else if (step === 2 && lastSentAt && daysSince(lastSentAt) >= 10) {
        track(await sendNudge(user, 3), "step3");
      }
    } catch (err: any) {
      const detail = `user ${user.user_id} (${user.first_name || "?"}): ${err.message}`;
      console.error(`[photoNudges] Error processing ${detail}`);
      result.errors++;
      result.errorDetails.push(detail);
    }
  }

  const total = result.step1 + result.step2 + result.step3;
  const errorSummary = result.errorDetails.length > 0 ? ` | errors: ${result.errorDetails.join("; ")}` : "";
  const summary = `candidates: ${result.candidates}, sent: ${total}, errors: ${result.errors}${errorSummary}`;

  console.log(
    `[photoNudges] Done. Step1: ${result.step1}, Step2: ${result.step2}, ` +
    `Step3: ${result.step3}, Errors: ${result.errors}`
  );

  // Always log run to system_activity_log (even if nothing sent)
  logActivity("photo_nudge_run", null, null, "daily_run", summary).catch(() => {});

  return result;
}
