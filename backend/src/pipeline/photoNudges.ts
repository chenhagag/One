/**
 * Photo request nudge system — reminds users to upload photos for waiting_for_photo matches.
 *
 * Per-user flow (not per-match):
 * Step 1 (day 0):  admin_message + push/email — "you have a match, upload a photo"
 * Step 2 (day 2):  reminder push/email
 * Step 3a (day 7): reminder push/email — if only one side missing photo
 * Step 3b (day 5): system_question "blind match?" — if BOTH sides missing photos
 * Step 4 (day 14): last reminder push/email — only for 3a path
 *
 * Stops if: user uploads a photo.
 * Restarts after: 14 days from last nudge if still no photo and has qualifying match.
 *
 * Blind match: if both answer positively → match moves to blind_match_candidate.
 *
 * Tracking: notification_log event_types: photo_request_1..4, photo_blind_question
 * Also logs to system_activity_log.
 *
 * Only runs in production.
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { notifyUser, NotifyPayload } from "../notifications";
import { logActivity } from "./activityLog";

// ── Types ────────────────────────────────────────────────────────

interface PhotoNudgeCandidate {
  user_id: number;
  first_name: string | null;
  gender: string | null;
  looking_for_gender: string | null;
  email: string | null;
}

interface PhotoNudgeResult {
  step1: number;
  step2: number;
  step3_reminder: number;
  step3_blind: number;
  step4: number;
  blind_promoted: number;
  errors: number;
}

// ── Gender helper ────────────────────────────────────────────────

function gn(gender: string | null, m: string, f: string): string {
  return gender === "woman" ? f : m;
}

// ── Check what step user is on ───────────────────────────────────

async function getPhotoNudgeStep(userId: number): Promise<{
  step: number;         // 0 = not started, 1-4 = completed step
  lastSentAt: Date | null;
  blindQuestionSent: boolean;
}> {
  // Check all photo_request nudges sent to this user
  const nudges = await pgQueryAll<{ event_type: string; sent_at: string }>(
    `SELECT event_type, sent_at FROM notification_log
     WHERE user_id = $1 AND success = TRUE
       AND (event_type LIKE 'photo_request_%' OR event_type = 'photo_blind_question')
     ORDER BY sent_at DESC`,
    [userId]
  );

  if (nudges.length === 0) {
    return { step: 0, lastSentAt: null, blindQuestionSent: false };
  }

  let maxStep = 0;
  let lastSentAt: Date | null = null;
  let blindQuestionSent = false;

  for (const n of nudges) {
    if (!lastSentAt || new Date(n.sent_at) > lastSentAt) {
      lastSentAt = new Date(n.sent_at);
    }
    if (n.event_type === "photo_blind_question") {
      blindQuestionSent = true;
      if (maxStep < 3) maxStep = 3;
    }
    const match = n.event_type.match(/^photo_request_(\d+)$/);
    if (match) {
      const step = parseInt(match[1], 10);
      if (step > maxStep) maxStep = step;
    }
  }

  return { step: maxStep, lastSentAt, blindQuestionSent };
}

// ── Check if user has photos ────────────────────────────────────

async function userHasPhotos(userId: number): Promise<boolean> {
  const row = await pgQueryOne<{ count: string }>(
    "SELECT COUNT(*) AS count FROM user_photos WHERE user_id = $1",
    [userId]
  );
  return row ? parseInt(row.count, 10) > 0 : false;
}

// ── Check if user has a qualifying match ─────────────────────────

/** Returns true if user has at least one waiting_for_photo match with internal_profile_score >= 72 */
async function hasQualifyingMatch(userId: number): Promise<boolean> {
  const row = await pgQueryOne<{ id: number }>(`
    SELECT m.id FROM matches m
    JOIN candidate_matches cm ON
      (cm.user_id = m.user1_id AND cm.candidate_user_id = m.user2_id)
      OR (cm.user_id = m.user2_id AND cm.candidate_user_id = m.user1_id)
    WHERE m.status = 'waiting_for_photo'
      AND (m.user1_id = $1 OR m.user2_id = $1)
      AND COALESCE(cm.internal_profile_score, 0) >= 72
    LIMIT 1
  `, [userId]);
  return !!row;
}

/** Returns true if user has a waiting_for_photo match where BOTH sides have no photos */
async function hasBothSidesNoPhotoMatch(userId: number): Promise<boolean> {
  const row = await pgQueryOne<{ id: number }>(`
    SELECT m.id FROM matches m
    JOIN candidate_matches cm ON
      (cm.user_id = m.user1_id AND cm.candidate_user_id = m.user2_id)
      OR (cm.user_id = m.user2_id AND cm.candidate_user_id = m.user1_id)
    WHERE m.status = 'waiting_for_photo'
      AND (m.user1_id = $1 OR m.user2_id = $1)
      AND COALESCE(cm.internal_profile_score, 0) >= 72
      AND (SELECT COUNT(*) FROM user_photos WHERE user_id = m.user1_id) = 0
      AND (SELECT COUNT(*) FROM user_photos WHERE user_id = m.user2_id) = 0
    LIMIT 1
  `, [userId]);
  return !!row;
}

/** Check if the other side of a qualifying match has photos */
async function otherSideHasPhoto(userId: number): Promise<boolean> {
  const row = await pgQueryOne<{ other_id: number }>(`
    SELECT CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END AS other_id
    FROM matches m
    JOIN candidate_matches cm ON
      (cm.user_id = m.user1_id AND cm.candidate_user_id = m.user2_id)
      OR (cm.user_id = m.user2_id AND cm.candidate_user_id = m.user1_id)
    WHERE m.status = 'waiting_for_photo'
      AND (m.user1_id = $1 OR m.user2_id = $1)
      AND COALESCE(cm.internal_profile_score, 0) >= 72
    ORDER BY cm.internal_profile_score DESC
    LIMIT 1
  `, [userId]);
  if (!row) return false;
  return userHasPhotos(row.other_id);
}

// ── Days since a date ───────────────────────────────────────────

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

// ── Message content ─────────────────────────────────────────────

function buildPhotoRequestMessage(
  gender: string | null,
  lookingFor: string | null,
  otherHasPhoto: boolean
): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  const lookingForFemale = lookingFor === "woman";
  const otherGenderLabel = lookingForFemale ? "המשתמשת" : lookingFor === "man" ? "המשתמש" : "המשתמש/ת";
  const toYouAndThem = lookingForFemale ? "לך ולה" : lookingFor === "man" ? "לך ולו" : "לשניכם";

  if (otherHasPhoto) {
    return `הודעה ממערכת One: מצאנו ${g("עבורך", "עבורך")} כיוון להתאמה 😊\n\n${otherGenderLabel} שמצאנו כבר ${lookingForFemale ? "העלתה" : "העלה"} תמונה, ונשמח לאפשר ${toYouAndThem} לבדוק גם התאמה ראשונית מבחינת משיכה. כדי לשמור על הוגנות והדדיות, נוכל לשתף את התמונה ${lookingForFemale ? "שלה" : "שלו"} רק לאחר שתעל${g("ה", "י")} גם תמונה ${g("משלך", "משלך")}.\n\nבהצלחה מצוות One!`;
  }

  return `הודעה ממערכת One: מצאנו ${g("עבורך", "עבורך")} כיוון להתאמה 😊\n\nכדי לבדוק התאמה ראשונית מבחינת משיכה, חשוב שגם ${g("אתה וגם הצד השני תעלו", "את וגם הצד השני תעלו")} תמונות. כדי לשמור על הוגנות והדדיות — נשמח ${g("שתעלה", "שתעלי")} תמונה ${g("משלך", "משלך")}.\n\nבהצלחה מצוות One!`;
}

function buildPhotoRequestEmail(
  name: string,
  gender: string | null,
  lookingFor: string | null
): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  const toYouAndThem = lookingFor === "woman" ? "לך ולה" : lookingFor === "man" ? "לך ולו" : "לשניכם";

  return `<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e; line-height: 1.8;">
  <img src="https://joinone.io/appLogo.png" alt="One" style="height: 44px; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
  <h2 style="font-size: 20px; margin: 0 0 16px; color: #1B1464;">היי ${name},</h2>
  <p>מצאנו ${g("עבורך", "עבורך")} כיוון להתאמה 😊</p>
  <p>נשמח לאפשר ${toYouAndThem} לבדוק גם התאמה ראשונית מבחינת משיכה. כדי לשמור על הוגנות והדדיות, ${g("נוכל", "נוכל")} להתקדם רק לאחר שתעל${g("ה", "י")} גם תמונה ${g("משלך", "משלך")}.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:15px">להעלאת תמונה</a>
  </div>
  <p>בהצלחה,<br>צוות One</p>
</div><div dir="rtl" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center;line-height:1.8">
<p style="margin:0">לא ניתן להשיב למייל זה.</p>
<p style="margin:4px 0 0">מוזמנים לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a></p>
</div>`;
}

function buildBlindMatchQuestion(name: string, gender: string | null): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  return `היי ${name}, אנחנו רואים ${g("לך", "לך")} התאמה מעניינת ולא היינו ${g("רוצים שתפספס", "רוצים שתפספסי")} אותה. ${g("האם אתה מעדיף", "האם את מעדיפה")}, במידה ותהיה הסכמה גם מהצד השני, לדלג על שלב התמונות ולהתקדם להתאמה עיוורת — כלומר לקבל כרטיס התאמה בלי תמונות? אם ${g("תרצו", "תרצו")}, ${g("תוכלו", "תוכלו")} לשתף תמונות אחד עם השנייה בהמשך. מה ${g("אתה אומר", "את אומרת")}?`;
}

// ── Step 1: Set admin_message + send notification ────────────────

async function sendStep1(user: PhotoNudgeCandidate): Promise<boolean> {
  const otherHas = await otherSideHasPhoto(user.user_id);
  const message = buildPhotoRequestMessage(user.gender, user.looking_for_gender, otherHas);

  // Set admin_message on user (only if no active one)
  const existing = await pgQueryOne<{ admin_message: string | null }>(
    "SELECT admin_message FROM users WHERE id = $1",
    [user.user_id]
  );
  if (!existing?.admin_message || existing.admin_message === "") {
    await pgQueryAll(
      `UPDATE users SET
        admin_message = $1,
        admin_message_type = 'info',
        admin_message_sent_at = NOW(),
        admin_message_dismissed = FALSE,
        photo_request_sent_at = NOW()
      WHERE id = $2`,
      [message, user.user_id]
    );
  }

  // Send push/email notification
  const name = user.first_name || "";
  const g = (m: string, f: string) => gn(user.gender, m, f);

  const payload: NotifyPayload = {
    title: `יש ${g("לך", "לך")} כיוון להתאמה ב-One 😊`,
    body: `מצאנו ${g("עבורך", "עבורך")} כיוון להתאמה. ${g("כנס", "כנסי")} להעלות תמונה כדי להתקדם.`,
    event_type: "photo_request_1",
    emailHtml: buildPhotoRequestEmail(name, user.gender, user.looking_for_gender),
  };

  try {
    const res = await notifyUser(user.user_id, payload);
    if (res.success) {
      logActivity("nudge", user.user_id, name, "photo_request_1", `${res.channel}`).catch(() => {});
      return true;
    }
  } catch (err: any) {
    console.error(`[photoNudges] Step 1 error for user ${user.user_id}:`, err.message);
  }
  return false;
}

// ── Steps 2-4: Send reminder notification ────────────────────────

async function sendReminder(user: PhotoNudgeCandidate, stepNumber: number): Promise<boolean> {
  const name = user.first_name || "";
  const g = (m: string, f: string) => gn(user.gender, m, f);

  const payload: NotifyPayload = {
    title: `יש ${g("לך", "לך")} כיוון להתאמה ב-One 😊`,
    body: `מצאנו ${g("עבורך", "עבורך")} כיוון להתאמה. ${g("כנס", "כנסי")} להעלות תמונה כדי להתקדם.`,
    event_type: `photo_request_${stepNumber}`,
    emailHtml: buildPhotoRequestEmail(name, user.gender, user.looking_for_gender),
  };

  try {
    const res = await notifyUser(user.user_id, payload);
    if (res.success) {
      logActivity("nudge", user.user_id, name, `photo_request_${stepNumber}`, `${res.channel}`).catch(() => {});
      return true;
    }
  } catch (err: any) {
    console.error(`[photoNudges] Step ${stepNumber} error for user ${user.user_id}:`, err.message);
  }
  return false;
}

// ── Step 3b: Send blind match question ──────────────────────────

async function sendBlindMatchQuestion(user: PhotoNudgeCandidate): Promise<boolean> {
  const name = user.first_name || "";
  const questionText = buildBlindMatchQuestion(name, user.gender);

  // Check if user already has blind_match_consent
  const u = await pgQueryOne<{ blind_match_consent: boolean }>(
    "SELECT blind_match_consent FROM users WHERE id = $1",
    [user.user_id]
  );
  if (u?.blind_match_consent) {
    // Already consented, no need to ask
    logActivity("nudge", user.user_id, name, "photo_blind_question", "skipped — already consented").catch(() => {});
    return true;
  }

  // Create system question with context
  await pgQueryAll(
    `INSERT INTO system_questions (user_id, question_text, context) VALUES ($1, $2, 'blind_match')`,
    [user.user_id, questionText]
  );

  // Send notification about the question
  const g = (m: string, f: string) => gn(user.gender, m, f);
  const payload: NotifyPayload = {
    title: "שאלה מ-One",
    body: `יש לנו שאלה קצרה — ${g("כנס", "כנסי")} לענות`,
    event_type: "photo_blind_question",
    emailHtml: buildBlindQuestionEmail(name, user.gender, questionText),
  };

  try {
    const res = await notifyUser(user.user_id, payload);
    if (res.success) {
      logActivity("nudge", user.user_id, name, "photo_blind_question", `${res.channel}`).catch(() => {});
      return true;
    }
  } catch (err: any) {
    console.error(`[photoNudges] Blind question error for user ${user.user_id}:`, err.message);
  }
  return false;
}

function buildBlindQuestionEmail(name: string, gender: string | null, questionText: string): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  return `<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e; line-height: 1.8;">
  <img src="https://joinone.io/appLogo.png" alt="One" style="height: 44px; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
  <h2 style="font-size: 20px; margin: 0 0 16px;">שאלה מ-One</h2>
  <p>${questionText}</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:15px">${g("כנס", "כנסי")} לענות</a>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">One</p>
</div><div dir="rtl" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center;line-height:1.8">
<p style="margin:0">לא ניתן להשיב למייל זה.</p>
<p style="margin:4px 0 0">מוזמנים לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a></p>
</div>`;
}

// ── Blind match promotion: check pairs and promote ──────────────

async function promoteBlindMatchPairs(): Promise<number> {
  // Find waiting_for_photo matches where BOTH users have blind_match_consent
  // and at least one has no photos (otherwise it should have been promoted already)
  const matches = await pgQueryAll<{
    match_id: number;
    user1_id: number;
    user2_id: number;
    u1_name: string;
    u2_name: string;
  }>(`
    SELECT m.id AS match_id, m.user1_id, m.user2_id,
           u1.first_name AS u1_name, u2.first_name AS u2_name
    FROM matches m
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    JOIN candidate_matches cm ON
      (cm.user_id = m.user1_id AND cm.candidate_user_id = m.user2_id)
      OR (cm.user_id = m.user2_id AND cm.candidate_user_id = m.user1_id)
    WHERE m.status = 'waiting_for_photo'
      AND u1.blind_match_consent = TRUE
      AND u2.blind_match_consent = TRUE
      AND COALESCE(cm.internal_profile_score, 0) >= 72
  `);

  let promoted = 0;
  for (const match of matches) {
    await pgQueryAll(
      "UPDATE matches SET status = 'blind_match_candidate', previous_status = 'waiting_for_photo', updated_at = NOW() WHERE id = $1",
      [match.match_id]
    );
    logActivity(
      "photo_promotion", null,
      `${match.u1_name || "?"} + ${match.u2_name || "?"}`,
      "blind_match_candidate",
      `match #${match.match_id} — both consented to blind match`
    ).catch(() => {});
    promoted++;
  }

  return promoted;
}

// ── Main: run photo nudges ──────────────────────────────────────

export async function runPhotoNudges(): Promise<PhotoNudgeResult> {
  const result: PhotoNudgeResult = {
    step1: 0, step2: 0, step3_reminder: 0, step3_blind: 0, step4: 0,
    blind_promoted: 0, errors: 0,
  };

  // Only run in production
  if (process.env.NODE_ENV !== "production") {
    console.log("[photoNudges] Skipping (not production)");
    return result;
  }

  console.log("[photoNudges] Starting photo nudge run...");

  // Find users without photos who have qualifying matches
  // Filter: not test, not frozen, not couple
  const candidates = await pgQueryAll<PhotoNudgeCandidate>(`
    SELECT DISTINCT u.id AS user_id, u.first_name, u.gender, u.looking_for_gender, u.email
    FROM users u
    JOIN matches m ON (m.user1_id = u.id OR m.user2_id = u.id)
    JOIN candidate_matches cm ON
      (cm.user_id = m.user1_id AND cm.candidate_user_id = m.user2_id)
      OR (cm.user_id = m.user2_id AND cm.candidate_user_id = m.user1_id)
    WHERE m.status = 'waiting_for_photo'
      AND COALESCE(cm.internal_profile_score, 0) >= 72
      AND (SELECT COUNT(*) FROM user_photos WHERE user_id = u.id) = 0
      AND u.test_user_type IS NULL
      AND u.partner_name IS NULL
      AND COALESCE(u.self_frozen, FALSE) = FALSE
  `);

  for (const user of candidates) {
    try {
      // Double-check: user still has no photos
      if (await userHasPhotos(user.user_id)) continue;

      const { step, lastSentAt, blindQuestionSent } = await getPhotoNudgeStep(user.user_id);

      // Flow completed + 14 days passed → can restart
      if (step >= 4 || (blindQuestionSent && step >= 3)) {
        if (lastSentAt && daysSince(lastSentAt) >= 14) {
          // Restart: treat as step 0
          if (await hasQualifyingMatch(user.user_id)) {
            if (await sendStep1(user)) result.step1++;
            else result.errors++;
          }
        }
        continue;
      }

      if (step === 0) {
        // Not started: send step 1
        if (await sendStep1(user)) result.step1++;
        else result.errors++;
      } else if (step === 1 && lastSentAt && daysSince(lastSentAt) >= 2) {
        // Step 1 done, 2+ days passed: send step 2
        if (await sendReminder(user, 2)) result.step2++;
        else result.errors++;
      } else if (step === 2 && lastSentAt && daysSince(lastSentAt) >= 3) {
        // Step 2 done, check path
        const bothNoPhoto = await hasBothSidesNoPhotoMatch(user.user_id);
        if (bothNoPhoto && daysSince(lastSentAt) >= 3) {
          // Both sides no photo → blind match question (day 5 from start)
          if (await sendBlindMatchQuestion(user)) result.step3_blind++;
          else result.errors++;
        } else if (daysSince(lastSentAt) >= 5) {
          // One side has photo → reminder (day 7 from start)
          if (await sendReminder(user, 3)) result.step3_reminder++;
          else result.errors++;
        }
      } else if (step === 3 && !blindQuestionSent && lastSentAt && daysSince(lastSentAt) >= 7) {
        // Step 3a done (reminder path), 7+ days passed → last reminder (day 14)
        if (await sendReminder(user, 4)) result.step4++;
        else result.errors++;
      }
    } catch (err: any) {
      console.error(`[photoNudges] Error processing user ${user.user_id}:`, err.message);
      result.errors++;
    }
  }

  // Check for blind match pairs to promote
  try {
    result.blind_promoted = await promoteBlindMatchPairs();
  } catch (err: any) {
    console.error("[photoNudges] Error promoting blind matches:", err.message);
  }

  console.log(
    `[photoNudges] Done. Step1: ${result.step1}, Step2: ${result.step2}, ` +
    `Reminder: ${result.step3_reminder}, Blind: ${result.step3_blind}, ` +
    `Step4: ${result.step4}, BlindPromoted: ${result.blind_promoted}, Errors: ${result.errors}`
  );

  return result;
}
