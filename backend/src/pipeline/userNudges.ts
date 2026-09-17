/**
 * Automated user nudge system — sends welcome messages and reminders.
 *
 * Three nudge types:
 * 1. welcome       — one-time, sent ~1 hour after registration
 * 2. not_started   — recurring: day 2, 5, 10, 20 (max 4, stop after 30 days)
 * 3. incomplete    — recurring: day 7, 12, 20, 35 (max 4, stop after 60 days)
 *
 * Channel selection:
 * - If user has active FCM token + push_notifications enabled → push notification
 * - Otherwise → email (if email_updates enabled)
 * - Deduplication via notification_log event_type (numbered: nudge_not_started_1, _2, etc.)
 *
 * Only runs in production (NODE_ENV=production) to avoid spamming staging test accounts.
 * Called by jobRunner on a daily schedule.
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { notifyUser, NotifyPayload } from "../notifications";

// ── Nudge schedules ──────────────────────────────────────────────

// Days since registration when each nudge fires
const NOT_STARTED_SCHEDULE = [2, 5, 10, 20];   // max age: 30 days
const INCOMPLETE_SCHEDULE  = [7, 12, 20, 35];   // max age: 60 days

// ── Types ────────────────────────────────────────────────────────

interface NudgeCandidate {
  id: number;
  first_name: string | null;
  gender: string | null;
  email: string | null;
  created_at: string;
}

interface NudgeCategoryResult {
  sent: number;
  skipped: number;
  errors: number;
  users: string[];
}

interface NudgeResult {
  welcome: NudgeCategoryResult;
  not_started: NudgeCategoryResult;
  incomplete: NudgeCategoryResult;
}

// ── Gender helper ────────────────────────────────────────────────

function gn(gender: string | null, m: string, f: string): string {
  return gender === "woman" ? f : m;
}

// ── Check how many nudges of this type were already sent ─────────

async function nudgesSentCount(userId: number, eventPrefix: string): Promise<number> {
  const row = await pgQueryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM notification_log
     WHERE user_id = $1 AND event_type LIKE $2 AND success = TRUE`,
    [userId, eventPrefix + "%"]
  );
  return row ? parseInt(row.count, 10) : 0;
}

/** Check if a specific numbered nudge was already sent */
async function wasNudgeSent(userId: number, eventType: string): Promise<boolean> {
  const notif = await pgQueryOne<{ id: number }>(
    `SELECT id FROM notification_log
     WHERE user_id = $1 AND event_type = $2 AND success = TRUE
     LIMIT 1`,
    [userId, eventType]
  );
  if (notif) return true;

  // Also check email_log for backwards compatibility
  const email = await pgQueryOne<{ id: number }>(
    `SELECT id FROM email_log
     WHERE user_id = $1 AND email_type = $2
     LIMIT 1`,
    [userId, eventType]
  );
  return !!email;
}

// ── Determine which nudge number is due ──────────────────────────

function getDueNudgeIndex(
  registrationDate: Date,
  schedule: number[],
  alreadySent: number
): number | null {
  const now = new Date();
  const daysSinceRegistration = (now.getTime() - registrationDate.getTime()) / (1000 * 60 * 60 * 24);

  if (alreadySent >= schedule.length) return null;

  const nextNudgeIndex = alreadySent;
  const daysRequired = schedule[nextNudgeIndex];

  if (daysSinceRegistration >= daysRequired) {
    return nextNudgeIndex;
  }

  return null;
}

// ── Nudge 1: Welcome (one-time) ──────────────────────────────────

async function sendWelcomeNudges(): Promise<NudgeCategoryResult> {
  const result: NudgeCategoryResult = { sent: 0, skipped: 0, errors: 0, users: [] };

  const candidates = await pgQueryAll<NudgeCandidate>(`
    SELECT id, first_name, gender, email, created_at
    FROM users
    WHERE test_user_type IS NULL
      AND partner_name IS NULL
      AND created_at < NOW() - INTERVAL '1 hour'
      AND created_at > NOW() - INTERVAL '14 days'
  `, []);

  for (const user of candidates) {
    if (await wasNudgeSent(user.id, "welcome")) {
      result.skipped++;
      continue;
    }

    const g = (m: string, f: string) => gn(user.gender, m, f);
    const name = user.first_name || "";

    const payload: NotifyPayload = {
      title: `${g("ברוך הבא", "ברוכה הבאה")} ל-One`,
      body: `היי${name ? " " + name : ""}, ${g("שמחים שהצטרפת", "שמחים שהצטרפת")}. ${g("כנס", "כנסי")} כדי להתחיל את שיחות ההיכרות — זה הבסיס לחיפוש ההתאמות.`,
      event_type: "welcome",
      emailHtml: buildWelcomeEmail(name, user.gender),
    };

    try {
      const res = await notifyUser(user.id, payload);
      if (res.success) {
        result.sent++;
        result.users.push(`${name || "?"} (${user.id})`);
      } else {
        result.errors++;
      }
    } catch (err: any) {
      console.error(`[nudges] Welcome error for user ${user.id}:`, err.message);
      result.errors++;
    }
  }

  return result;
}

// ── Nudge 2: Not Started (recurring) ─────────────────────────────

async function sendNotStartedNudges(): Promise<NudgeCategoryResult> {
  const result: NudgeCategoryResult = { sent: 0, skipped: 0, errors: 0, users: [] };

  const candidates = await pgQueryAll<NudgeCandidate>(`
    SELECT u.id, u.first_name, u.gender, u.email, u.created_at
    FROM users u
    WHERE u.test_user_type IS NULL
      AND u.partner_name IS NULL
      AND u.created_at < NOW() - INTERVAL '48 hours'
      AND u.created_at > NOW() - INTERVAL '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM conversation_messages cm
        WHERE cm.user_id = u.id AND cm.role = 'user'
      )
  `, []);

  for (const user of candidates) {
    const sentCount = await nudgesSentCount(user.id, "nudge_not_started_");
    const dueIndex = getDueNudgeIndex(new Date(user.created_at), NOT_STARTED_SCHEDULE, sentCount);

    if (dueIndex === null) {
      result.skipped++;
      continue;
    }

    const nudgeNumber = dueIndex + 1;
    const eventType = `nudge_not_started_${nudgeNumber}`;

    if (await wasNudgeSent(user.id, eventType)) {
      result.skipped++;
      continue;
    }

    const g = (m: string, f: string) => gn(user.gender, m, f);
    const name = user.first_name || "";
    const { title, body, emailHtml } = getNotStartedContent(nudgeNumber, name, user.gender);

    const payload: NotifyPayload = { title, body, event_type: eventType, emailHtml };

    try {
      const res = await notifyUser(user.id, payload);
      if (res.success) {
        result.sent++;
        result.users.push(`${name || "?"} (${user.id}) [#${nudgeNumber}]`);
      } else {
        result.errors++;
      }
    } catch (err: any) {
      console.error(`[nudges] Not-started error for user ${user.id}:`, err.message);
      result.errors++;
    }
  }

  return result;
}

// ── Nudge 3: Incomplete (recurring) ──────────────────────────────

async function sendIncompleteNudges(): Promise<NudgeCategoryResult> {
  const result: NudgeCategoryResult = { sent: 0, skipped: 0, errors: 0, users: [] };

  const candidates = await pgQueryAll<NudgeCandidate>(`
    SELECT u.id, u.first_name, u.gender, u.email, u.created_at
    FROM users u
    WHERE u.test_user_type IS NULL
      AND u.partner_name IS NULL
      AND u.created_at < NOW() - INTERVAL '7 days'
      AND u.created_at > NOW() - INTERVAL '60 days'
      AND u.in_matching_pool = FALSE
      AND u.admin_processing_done = FALSE
      AND EXISTS (
        SELECT 1 FROM conversation_messages cm
        WHERE cm.user_id = u.id AND cm.role = 'user'
      )
  `, []);

  for (const user of candidates) {
    const sentCount = await nudgesSentCount(user.id, "nudge_incomplete_");
    const dueIndex = getDueNudgeIndex(new Date(user.created_at), INCOMPLETE_SCHEDULE, sentCount);

    if (dueIndex === null) {
      result.skipped++;
      continue;
    }

    const nudgeNumber = dueIndex + 1;
    const eventType = `nudge_incomplete_${nudgeNumber}`;

    if (await wasNudgeSent(user.id, eventType)) {
      result.skipped++;
      continue;
    }

    const g = (m: string, f: string) => gn(user.gender, m, f);
    const name = user.first_name || "";
    const { title, body, emailHtml } = getIncompleteContent(nudgeNumber, name, user.gender);

    const payload: NotifyPayload = { title, body, event_type: eventType, emailHtml };

    try {
      const res = await notifyUser(user.id, payload);
      if (res.success) {
        result.sent++;
        result.users.push(`${name || "?"} (${user.id}) [#${nudgeNumber}]`);
      } else {
        result.errors++;
      }
    } catch (err: any) {
      console.error(`[nudges] Incomplete error for user ${user.id}:`, err.message);
      result.errors++;
    }
  }

  return result;
}

// ── Main: run all nudges ─────────────────────────────────────────

export async function runUserNudges(): Promise<NudgeResult> {
  // Only run in production — staging has real emails on test accounts
  if (process.env.NODE_ENV !== "production") {
    console.log("[nudges] Skipping nudges (not production)");
    return {
      welcome: { sent: 0, skipped: 0, errors: 0, users: [] },
      not_started: { sent: 0, skipped: 0, errors: 0, users: [] },
      incomplete: { sent: 0, skipped: 0, errors: 0, users: [] },
    };
  }

  console.log("[nudges] Starting user nudge run...");

  const welcome = await sendWelcomeNudges();
  const not_started = await sendNotStartedNudges();
  const incomplete = await sendIncompleteNudges();

  const result = { welcome, not_started, incomplete };

  console.log(
    `[nudges] Done. Welcome: ${welcome.sent} sent, ${welcome.skipped} skipped. ` +
    `Not-started: ${not_started.sent} sent, ${not_started.skipped} skipped. ` +
    `Incomplete: ${incomplete.sent} sent, ${incomplete.skipped} skipped.`
  );

  return result;
}

// ── Content variations per nudge number ──────────────────────────

function getNotStartedContent(
  nudgeNumber: number,
  name: string,
  gender: string | null
): { title: string; body: string; emailHtml: string } {
  const g = (m: string, f: string) => gn(gender, m, f);
  const hey = `היי${name ? " " + name : ""}`;

  switch (nudgeNumber) {
    case 1:
      return {
        title: `התחלת התהליך ב-One`,
        body: `${hey}, ${g("נרשמת", "נרשמת")} ל-One אבל עוד לא ${g("התחלת", "התחלת")} את השיחה. ${g("כנס", "כנסי")} כדי להתחיל — זה לוקח כמה דקות.`,
        emailHtml: buildNotStartedEmail(nudgeNumber, name, gender),
      };
    case 2:
      return {
        title: `שיחת ההיכרות ב-One`,
        body: `${hey}, שיחת ההיכרות היא הבסיס לחיפוש ההתאמות. ${g("כנס", "כנסי")} כשנוח ${g("לך", "לך")} — זה קצר ופשוט.`,
        emailHtml: buildNotStartedEmail(nudgeNumber, name, gender),
      };
    case 3:
      return {
        title: `One — התהליך ${g("שלך", "שלך")} מחכה`,
        body: `${hey}, ב-One אפשר להתחיל בכל רגע. השיחה ${g("מחכה לך", "מחכה לך")} — ${g("כנס", "כנסי")} כש${g("מתאים לך", "מתאים לך")}.`,
        emailHtml: buildNotStartedEmail(nudgeNumber, name, gender),
      };
    default: // 4
      return {
        title: `תזכורת אחרונה מ-One`,
        body: `${hey}, עדיין אפשר להתחיל את התהליך ב-One. ${g("כנס", "כנסי")} — אחרי שיחה קצרה, אנחנו מטפלים בהכול.`,
        emailHtml: buildNotStartedEmail(nudgeNumber, name, gender),
      };
  }
}

function getIncompleteContent(
  nudgeNumber: number,
  name: string,
  gender: string | null
): { title: string; body: string; emailHtml: string } {
  const g = (m: string, f: string) => gn(gender, m, f);
  const hey = `היי${name ? " " + name : ""}`;

  switch (nudgeNumber) {
    case 1:
      return {
        title: `השלמת התהליך ב-One`,
        body: `${hey}, ${g("התחלת", "התחלת")} את התהליך ב-One אבל עוד לא ${g("השלמת", "השלמת")}. השלמת השיחות תאפשר ${g("לך", "לך")} להצטרף למאגר ההתאמות.`,
        emailHtml: buildIncompleteEmail(nudgeNumber, name, gender),
      };
    case 2:
      return {
        title: `ההתאמה ${g("שלך", "שלך")} ב-One`,
        body: `${hey}, כל מה ש${g("עשית", "עשית")} ב-One נשמר. ${g("כנס", "כנסי")} להמשיך מאותה נקודה — ככל שנכיר אותך יותר, ההתאמה תהיה מדויקת יותר.`,
        emailHtml: buildIncompleteEmail(nudgeNumber, name, gender),
      };
    case 3:
      return {
        title: `עוד קצת ו${g("סיימת", "סיימת")} ב-One`,
        body: `${hey}, ${g("נשאר לך", "נשאר לך")} עוד קצת עד שנוכל להתחיל לחפש ${g("לך", "לך")} התאמה. ${g("כנס", "כנסי")} להמשיך.`,
        emailHtml: buildIncompleteEmail(nudgeNumber, name, gender),
      };
    default: // 4
      return {
        title: `תזכורת אחרונה מ-One`,
        body: `${hey}, ${g("התחלת", "התחלת")} תהליך ב-One. אחרי שנכיר אותך לעומק, נוכל למצוא ${g("לך", "לך")} את ההתאמה המדויקת ביותר.`,
        emailHtml: buildIncompleteEmail(nudgeNumber, name, gender),
      };
  }
}

// ── Email templates ──────────────────────────────────────────────

const EMAIL_FOOTER = `<div dir="rtl" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center;line-height:1.8">
<p style="margin:0">לא ניתן להשיב למייל זה.</p>
<p style="margin:4px 0 0">מוזמנים לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a></p>
</div>`;

function wrapEmail(content: string): string {
  return `<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e; line-height: 1.8;">
  <img src="https://joinone.io/appLogo.png" alt="One" style="height: 44px; margin-bottom: 24px; display: block; margin-left: auto; margin-right: auto;" />
  ${content}
</div>` + EMAIL_FOOTER;
}

function ctaButton(text: string): string {
  return `<div style="text-align: center; margin: 28px 0;">
    <a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:15px">${text}</a>
  </div>`;
}

function buildWelcomeEmail(name: string, gender: string | null): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  return wrapEmail(`
    <h2 style="font-size: 20px; margin: 0 0 16px;">${g("ברוך הבא", "ברוכה הבאה")} ל-One</h2>
    <p>היי${name ? " " + name : ""},</p>
    <p>${g("שמחים שהצטרפת", "שמחים שהצטרפת")}. One מוצאת ${g("לך", "לך")} התאמה זוגית על בסיס שיחת היכרות אישית — ככל שנכיר אותך יותר, כך נוכל למצוא ${g("לך", "לך")} את ההתאמה המדויקת ביותר.</p>
    <p>השיחה לוקחת כמה דקות, ואפשר תמיד לחזור ולהמשיך מאותה נקודה.</p>
    ${ctaButton(g("כנס", "כנסי") + " להתחיל")}
    <p>בברכה,<br>צוות One</p>
  `);
}

function buildNotStartedEmail(nudgeNumber: number, name: string, gender: string | null): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  const hey = `היי${name ? " " + name : ""}`;

  const bodies: Record<number, string> = {
    1: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">התחלת התהליך ב-One</h2>
      <p>${hey},</p>
      <p>${g("נרשמת", "נרשמת")} ל-One, אבל עוד לא ${g("התחלת", "התחלת")} את שיחת ההיכרות.</p>
      <p>שיחת ההיכרות היא הבסיס לחיפוש ההתאמות: היא עוזרת ל-One להבין מי ${g("אתה", "את")}, מה חשוב ${g("לך", "לך")} בזוגיות ומה הטעם ${g("שלך", "שלך")}. זה לוקח כמה דקות, ואפשר תמיד לחזור ולהמשיך.</p>
      <p>אם ${g("נתקלת", "נתקלת")} בבעיה — ${g("כתוב", "כתבי")} לנו, נשמח לעזור.</p>
      ${ctaButton(g("כנס", "כנסי") + " להתחיל")}
    `,
    2: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">שיחת ההיכרות ב-One</h2>
      <p>${hey},</p>
      <p>שיחת ההיכרות היא הבסיס לחיפוש ההתאמות ב-One. היא קצרה ופשוטה — כמה דקות של שיחה פתוחה, ואנחנו מטפלים בשאר.</p>
      <p>${g("כנס", "כנסי")} כשנוח ${g("לך", "לך")}.</p>
      ${ctaButton(g("כנס", "כנסי") + " להתחיל")}
    `,
    3: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">One — התהליך ${g("שלך", "שלך")} מחכה</h2>
      <p>${hey},</p>
      <p>ב-One אפשר להתחיל בכל רגע. שיחת ההיכרות ${g("מחכה לך", "מחכה לך")} — ${g("כנס", "כנסי")} כש${g("מתאים לך", "מתאים לך")}.</p>
      ${ctaButton(g("כנס", "כנסי") + " להתחיל")}
    `,
    4: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">תזכורת אחרונה מ-One</h2>
      <p>${hey},</p>
      <p>זו התזכורת האחרונה שלנו. עדיין אפשר להתחיל את התהליך ב-One — אחרי שיחה קצרה, אנחנו מטפלים בהכול.</p>
      ${ctaButton(g("כנס", "כנסי") + " להתחיל")}
    `,
  };

  return wrapEmail((bodies[nudgeNumber] || bodies[4]!) + `<p>בברכה,<br>צוות One</p>`);
}

function buildIncompleteEmail(nudgeNumber: number, name: string, gender: string | null): string {
  const g = (m: string, f: string) => gn(gender, m, f);
  const hey = `היי${name ? " " + name : ""}`;

  const bodies: Record<number, string> = {
    1: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">השלמת התהליך ב-One</h2>
      <p>${hey},</p>
      <p>${g("נרשמת", "נרשמת")} ל-One, אבל עדיין לא ${g("השלמת", "השלמת")} את שיחות ההיכרות.</p>
      <p>השיחות הן הבסיס לחיפוש ההתאמות: הן עוזרות ל-One להבין מי ${g("אתה", "את")}, מה חשוב ${g("לך", "לך")} בזוגיות ומה הטעם ${g("שלך", "שלך")}. השלמת התהליך תאפשר ${g("לך", "לך")} להצטרף למאגר, שבו One ${g("מחפש", "מחפשת")} ${g("עבורך", "עבורך")} התאמות — בלי ש${g("תצטרך", "תצטרכי")} לחפש ${g("בעצמך", "בעצמך")}.</p>
      <p>כל מה שכבר ${g("עשית", "עשית")} נשמר, ואפשר להמשיך מאותה נקודה.</p>
      ${ctaButton("להמשך התהליך")}
    `,
    2: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">ההתאמה ${g("שלך", "שלך")} ב-One</h2>
      <p>${hey},</p>
      <p>כל מה ש${g("עשית", "עשית")} ב-One נשמר ואפשר להמשיך מאותה נקודה. ככל שנכיר אותך יותר, ההתאמה תהיה מדויקת יותר.</p>
      <p>${g("כנס", "כנסי")} כשנוח ${g("לך", "לך")}.</p>
      ${ctaButton("להמשך התהליך")}
    `,
    3: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">עוד קצת ו${g("סיימת", "סיימת")} ב-One</h2>
      <p>${hey},</p>
      <p>${g("נשאר לך", "נשאר לך")} עוד קצת עד שנוכל להתחיל לחפש ${g("לך", "לך")} התאמה. ככל שנכיר אותך יותר, כך ההתאמה תהיה מדויקת יותר.</p>
      ${ctaButton("להמשך התהליך")}
    `,
    4: `
      <h2 style="font-size: 20px; margin: 0 0 16px;">תזכורת אחרונה מ-One</h2>
      <p>${hey},</p>
      <p>${g("התחלת", "התחלת")} תהליך ב-One. אחרי שנכיר אותך לעומק, נוכל למצוא ${g("לך", "לך")} את ההתאמה המדויקת ביותר. כל מה ש${g("עשית", "עשית")} נשמר.</p>
      ${ctaButton("להמשך התהליך")}
    `,
  };

  return wrapEmail((bodies[nudgeNumber] || bodies[4]!) + `<p>בברכה,<br>צוות One</p>`);
}
