/**
 * Unified notification service — push (FCM) with email (Resend) fallback.
 *
 * Rule: if user has a valid FCM token + push enabled → push.
 *       If push fails (invalid token) → fallback to email for THAT message.
 *       If no token or push disabled → email (if email_updates enabled).
 *
 * Token ownership: based on authenticated user_id at registration time.
 * On account switch, the register endpoint re-assigns the token via upsert.
 */

import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";
import { Resend } from "resend";
import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "./db.pg";

// ── Firebase Admin init ──────────────────────────────────────────
let firebaseApp: App | null = null;
let messaging: Messaging | null = null;

function ensureFirebase(): boolean {
  if (messaging) return true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.warn("[notifications] FIREBASE_SERVICE_ACCOUNT not set — push disabled");
    return false;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      firebaseApp = getApps()[0];
    }
    messaging = getMessaging(firebaseApp);
    console.log("[notifications] Firebase Admin initialized");
    return true;
  } catch (err: any) {
    console.error("[notifications] Firebase init failed:", err.message);
    return false;
  }
}

// ── Resend email client ──────────────────────────────────────────
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const EMAIL_FOOTER = `<div dir="rtl" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center;line-height:1.8">
<p style="margin:0">לא ניתן להשיב למייל זה.</p>
<p style="margin:4px 0 0">מוזמנים לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a></p>
</div>`;

// ── Types ────────────────────────────────────────────────────────
export interface NotifyPayload {
  title: string;
  body: string;
  event_type: string;
  data?: Record<string, string>;   // deep link data for the app
  emailHtml?: string;              // custom email HTML (optional override)
}

export interface NotifyResult {
  channel: "push" | "email" | "none";
  success: boolean;
  error?: string;
}

// ── Core: send notification to a user ────────────────────────────
export async function notifyUser(
  userId: number,
  payload: NotifyPayload
): Promise<NotifyResult> {
  // 1. Load user preferences
  const user = await pgQueryOne<{
    email: string | null;
    push_notifications: boolean;
    email_updates: boolean;
    first_name: string | null;
  }>(
    "SELECT email, push_notifications, email_updates, first_name FROM users WHERE id = $1",
    [userId]
  );

  if (!user) {
    return logAndReturn(userId, payload, "none", false, "user_not_found");
  }

  // 2. Try push if enabled
  if (user.push_notifications !== false) {
    const tokens = await pgQueryAll<{ id: number; token: string }>(
      "SELECT id, token FROM fcm_tokens WHERE user_id = $1 AND permission_status = 'granted'",
      [userId]
    );

    if (tokens.length > 0 && ensureFirebase()) {
      const pushResult = await sendPush(userId, tokens, payload);
      if (pushResult.success) {
        return pushResult;
      }
      // Push failed for ALL tokens — fall through to email
      console.log(`[notifications] Push failed for user ${userId}, falling back to email`);
    }
  }

  // 3. Fallback to email
  if (user.email_updates !== false && user.email) {
    return sendEmail(userId, user.email, payload);
  }

  // 4. No channel available
  return logAndReturn(userId, payload, "none", false, "no_channel_available");
}

// ── Admin-specific: send push only (no silent fallback to email) ─
export async function sendPushOnly(
  userId: number,
  payload: NotifyPayload
): Promise<NotifyResult> {
  const tokens = await pgQueryAll<{ id: number; token: string }>(
    "SELECT id, token FROM fcm_tokens WHERE user_id = $1 AND permission_status = 'granted'",
    [userId]
  );

  if (tokens.length === 0) {
    return logAndReturn(userId, payload, "none", false, "no_fcm_tokens");
  }

  if (!ensureFirebase()) {
    return logAndReturn(userId, payload, "none", false, "firebase_not_configured");
  }

  return sendPush(userId, tokens, payload);
}

// ── Push via FCM ─────────────────────────────────────────────────
async function sendPush(
  userId: number,
  tokens: Array<{ id: number; token: string }>,
  payload: NotifyPayload
): Promise<NotifyResult> {
  const tokenStrings = tokens.map((t) => t.token);

  try {
    const response = await messaging!.sendEachForMulticast({
      tokens: tokenStrings,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: "high",
      },
    });

    // Handle per-token results
    const invalidTokens: string[] = [];
    let anySuccess = false;

    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        anySuccess = true;
      } else {
        const errorCode = resp.error?.code;
        // These codes mean the token is permanently invalid
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokenStrings[idx]);
        } else {
          // Transient error — don't delete token
          console.warn(
            `[notifications] FCM transient error for user ${userId}:`,
            errorCode,
            resp.error?.message
          );
        }
      }
    });

    // Clean up permanently invalid tokens
    if (invalidTokens.length > 0) {
      await pgQueryAll(
        "DELETE FROM fcm_tokens WHERE token = ANY($1::text[])",
        [invalidTokens]
      );
      console.log(
        `[notifications] Removed ${invalidTokens.length} invalid tokens for user ${userId}`
      );
    }

    // Update last_used_at for valid tokens
    if (anySuccess) {
      await pgQueryAll(
        "UPDATE fcm_tokens SET last_used_at = NOW() WHERE user_id = $1 AND permission_status = 'granted'",
        [userId]
      );
    }

    if (anySuccess) {
      return logAndReturn(userId, payload, "push", true);
    }

    // All tokens failed
    return logAndReturn(userId, payload, "push", false, "all_tokens_failed");
  } catch (err: any) {
    console.error(`[notifications] FCM send error for user ${userId}:`, err.message);
    return logAndReturn(userId, payload, "push", false, err.message);
  }
}

// ── Email via Resend ─────────────────────────────────────────────
async function sendEmail(
  userId: number,
  email: string,
  payload: NotifyPayload
): Promise<NotifyResult> {
  if (!resend) {
    return logAndReturn(userId, payload, "email", false, "resend_not_configured");
  }

  const html =
    payload.emailHtml ||
    buildNotificationEmail(payload.title, payload.body);

  try {
    const { error } = await resend.emails.send({
      from: "One <noreply@joinone.io>",
      to: email,
      subject: payload.title,
      html,
    });

    if (error) {
      console.error(`[notifications] Email failed for user ${userId}:`, error);
      return logAndReturn(userId, payload, "email", false, JSON.stringify(error));
    }

    return logAndReturn(userId, payload, "email", true);
  } catch (err: any) {
    console.error(`[notifications] Email error for user ${userId}:`, err.message);
    return logAndReturn(userId, payload, "email", false, err.message);
  }
}

// ── Email template builder ───────────────────────────────────────
function buildNotificationEmail(title: string, body: string): string {
  return `<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; text-align: center;">
  <img src="https://joinone.io/nameLogoTrans.png" alt="One" style="height: 28px; margin-bottom: 24px;" />
  <h2 style="font-size: 20px; color: #1a1a2e; margin: 0 0 12px;">${title}</h2>
  <p style="font-size: 15px; color: #444; line-height: 1.6; margin: 0 0 24px;">${body}</p>
  <a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">פתח את One</a>
</div>` + EMAIL_FOOTER;
}

// ── Log + return helper ──────────────────────────────────────────
async function logAndReturn(
  userId: number,
  payload: NotifyPayload,
  channel: "push" | "email" | "none",
  success: boolean,
  error?: string
): Promise<NotifyResult> {
  try {
    await pgQueryAll(
      `INSERT INTO notification_log (user_id, channel, event_type, title, body, success, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, channel, payload.event_type, payload.title, payload.body, success, error || null]
    );
  } catch (logErr: any) {
    console.error("[notifications] Failed to log notification:", logErr.message);
  }

  const tag = success ? "OK" : "FAIL";
  console.log(
    `[notifications] ${tag} user=${userId} channel=${channel} event=${payload.event_type}${error ? ` error=${error}` : ""}`
  );

  return { channel, success, error };
}

// ── Token management ─────────────────────────────────────────────

/**
 * Register or update an FCM token for a user.
 * Uses upsert on token — if same token exists for a different user (account switch),
 * it reassigns the token to the new user.
 */
export async function registerToken(
  userId: number,
  token: string,
  platform: string = "android",
  permissionStatus: string = "granted"
): Promise<void> {
  await pgQueryAll(
    `INSERT INTO fcm_tokens (user_id, token, platform, permission_status, last_used_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       permission_status = EXCLUDED.permission_status,
       last_used_at = NOW()`,
    [userId, token, platform, permissionStatus]
  );
  console.log(`[notifications] Token registered for user ${userId} (${platform})`);
}

/**
 * Remove a specific FCM token (on logout).
 */
export async function unregisterToken(token: string): Promise<void> {
  await pgQueryAll("DELETE FROM fcm_tokens WHERE token = $1", [token]);
}

/**
 * Update permission status for all tokens of a user.
 * Called when frontend detects permission change (e.g. user revoked in Android settings).
 */
export async function syncPermissionStatus(
  userId: number,
  permissionStatus: string
): Promise<void> {
  await pgQueryAll(
    "UPDATE fcm_tokens SET permission_status = $1 WHERE user_id = $2",
    [permissionStatus, userId]
  );
}

/**
 * Check if a user has any active push tokens.
 */
export async function hasPushTokens(userId: number): Promise<boolean> {
  const row = await pgQueryOne<{ count: string }>(
    "SELECT COUNT(*) AS count FROM fcm_tokens WHERE user_id = $1 AND permission_status = 'granted'",
    [userId]
  );
  return row ? parseInt(row.count, 10) > 0 : false;
}

// ── Trigger helpers ──────────────────────────────────────────────

/** Check if a notification was sent recently (throttle) */
async function wasRecentlySent(userId: number, eventType: string, minutes: number): Promise<boolean> {
  const row = await pgQueryOne<{ id: number }>(
    `SELECT id FROM notification_log
     WHERE user_id = $1 AND event_type = $2 AND success = TRUE
       AND sent_at > NOW() - INTERVAL '1 minute' * $3
     LIMIT 1`,
    [userId, eventType, minutes]
  );
  return !!row;
}

/** Helper to load user name + gender for gendered emails */
async function getUserInfo(userId: number): Promise<{ first_name: string; gender: string; email: string } | null> {
  return pgQueryOne<{ first_name: string; gender: string; email: string }>(
    "SELECT first_name, gender, email FROM users WHERE id = $1",
    [userId]
  );
}

function gn(gender: string | null, m: string, f: string): string {
  return gender === "woman" ? f : m;
}

// ── Trigger: Match card sent ─────────────────────────────────────

export async function notifyMatchCardSent(userId: number, partnerName: string): Promise<void> {
  const user = await getUserInfo(userId);
  if (!user) return;
  const g = (m: string, f: string) => gn(user.gender, m, f);

  await notifyUser(userId, {
    title: "🎉 יש לך התאמה חדשה!",
    body: "כרטיס ההתאמה שלך מחכה לך ב-One",
    event_type: "match_card_sent",
    emailHtml: buildRichEmail(
      "🎉 יש לך התאמה חדשה!",
      `<p>היי ${user.first_name},</p>
       <p>יש לנו חדשות מרגשות — מצאנו ${g("לך", "לך")} התאמה!</p>
       <p>כרטיס ההתאמה ${g("שלך", "שלך")} מוכן ומחכה ${g("לך", "לך")} במערכת. ${g("כנס", "כנסי")} כדי לראות את הפרטים.</p>`,
      g("כנס", "כנסי") + " לראות את ההתאמה"
    ),
  });
}

// ── Trigger: New direct message ──────────────────────────────────

export async function notifyNewMessage(recipientId: number, senderName: string): Promise<void> {
  // Throttle: max 1 notification per 5 minutes per recipient
  if (await wasRecentlySent(recipientId, "new_message", 5)) return;

  const user = await getUserInfo(recipientId);
  if (!user) return;
  const g = (m: string, f: string) => gn(user.gender, m, f);

  await notifyUser(recipientId, {
    title: `הודעה חדשה מ${senderName}`,
    body: `קיבלת הודעה חדשה מההתאמה שלך`,
    event_type: "new_message",
    emailHtml: buildRichEmail(
      `הודעה חדשה מ${senderName}`,
      `<p>היי ${user.first_name},</p>
       <p>${senderName} ${g("שלח לך", "שלחה לך")} הודעה חדשה ב-One.</p>
       <p>${g("כנס", "כנסי")} למערכת כדי לקרוא ולהשיב.</p>`,
      g("כנס", "כנסי") + " לקרוא"
    ),
  });
}

// ── Trigger: Sent for rating ─────────────────────────────────────

export async function notifySentForRating(userId: number): Promise<void> {
  const user = await getUserInfo(userId);
  if (!user) return;
  const g = (m: string, f: string) => gn(user.gender, m, f);

  await notifyUser(userId, {
    title: "✨ מצאנו לך התאמה פוטנציאלית",
    body: g("כנס", "כנסי") + " לראות ולהגיב",
    event_type: "sent_for_rating",
    emailHtml: buildRichEmail(
      "✨ מצאנו לך התאמה פוטנציאלית",
      `<p>היי ${user.first_name},</p>
       <p>מצאנו ${g("לך", "לך")} התאמה פוטנציאלית ב-One!</p>
       <p>${g("כנס", "כנסי")} למערכת כדי לראות את הפרטים ${g("ולהגיב", "ולהגיב")}.</p>`,
      g("כנס", "כנסי") + " לראות"
    ),
  });
}

// ── Trigger: Admin message / question ────────────────────────────

export async function notifyAdminMessage(userId: number, messageType: string, messageText: string): Promise<void> {
  const user = await getUserInfo(userId);
  if (!user) return;
  const g = (m: string, f: string) => gn(user.gender, m, f);

  const isQuestion = messageType === "question";
  const title = isQuestion ? "שאלה מ-One" : "הודעה מ-One";
  const pushBody = isQuestion
    ? "יש לנו שאלה קצרה — " + g("כנס", "כנסי") + " לענות"
    : g("כנס", "כנסי") + " לקרוא את ההודעה";

  await notifyUser(userId, {
    title,
    body: pushBody,
    event_type: isQuestion ? "admin_question" : "admin_message",
    emailHtml: buildRichEmail(
      title,
      `<p>היי ${user.first_name},</p>
       <p>${messageText}</p>
       ${isQuestion ? `<p>${g("כנס", "כנסי")} כדי לענות.</p>` : ""}`,
      isQuestion ? g("כנס", "כנסי") + " לענות" : g("דבר", "דברי") + " איתי על זה"
    ),
  });
}

// ── Rich email builder (with CTA button) ─────────────────────────
function buildRichEmail(title: string, bodyHtml: string, ctaText: string): string {
  return `<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e; line-height: 1.8;">
  <img src="https://joinone.io/nameLogoTrans.png" alt="One" style="height: 28px; margin-bottom: 24px; display: block;" />
  <h2 style="font-size: 20px; margin: 0 0 16px;">${title}</h2>
  <div style="font-size: 15px;">${bodyHtml}</div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:15px">${ctaText}</a>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">צוות One</p>
</div>` + EMAIL_FOOTER;
}
