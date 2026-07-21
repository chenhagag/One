/**
 * Send "welcome to matching pool" email to a user.
 *
 * Dedup: uses email_type = 'pool_welcome' with unique index on (user_id, email_type).
 * Will not send if already sent for this user.
 */

import { Resend } from "resend";
import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface WelcomeEmailResult {
  sent: boolean;
  skipped_reason?: string;
}

export async function sendPoolWelcomeEmail(userId: number): Promise<WelcomeEmailResult> {
  if (!resend) {
    return { sent: false, skipped_reason: "no_resend_key" };
  }

  // Check if already sent
  const existing = await pgQueryOne<{ id: number }>(
    "SELECT id FROM email_log WHERE user_id = $1 AND email_type = 'pool_welcome' LIMIT 1",
    [userId]
  );
  if (existing) {
    return { sent: false, skipped_reason: "already_sent" };
  }

  // Load user
  const user = await pgQueryOne<{
    email: string | null;
    first_name: string | null;
    gender: string | null;
  }>(
    "SELECT email, first_name, gender FROM users WHERE id = $1",
    [userId]
  );

  if (!user?.email) {
    return { sent: false, skipped_reason: "no_email" };
  }

  const isFemale = user.gender === "woman";
  const gn = (m: string, f: string) => isFemale ? f : m;

  const subject = "One — ברוכים הבאים למאגר ההתאמות! 🎉";
  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <h2 style="color: #6366f1;">היי ${user.first_name || ""} 👋</h2>
      <p style="line-height: 1.8; font-size: 15px;">
        ${gn("סיימת", "סיימת")} את כל שלבי ההיכרות, ואנחנו ${gn("שמחים", "שמחות")} לעדכן ${gn("אותך", "אותך")} — ${gn("נכנסת", "נכנסת")} למאגר ההתאמות של One! 🎉
      </p>
      <p style="line-height: 1.8; font-size: 15px;">
        מהרגע הזה המערכת תחפש ${gn("עבורך", "עבורך")} התאמות על בסיס הניתוח המעמיק שביצענו — ציוני אישיות, ערכים, סגנון תקשורת, טעם ועוד.
      </p>
      <p style="line-height: 1.8; font-size: 15px;">
        כשנמצא התאמה שאנחנו ${gn("מרגיש", "מרגישה")} ${gn("בטוח", "בטוחה")} לגביה — ${gn("תקבל", "תקבלי")} עדכון.
      </p>
      <p style="line-height: 1.8; font-size: 15px;">
        בינתיים, ${gn("מוזמן", "מוזמנת")} ${gn("להיכנס", "להיכנס")} למערכת, ${gn("להוסיף", "להוסיפי")} תמונות ולקרוא את התובנות האישיות ${gn("שלך", "שלך")}.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="https://joinone.io" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
          ${gn("כנס", "כנסי")} למערכת
        </a>
      </div>
      <p style="font-size: 12px; color: #999; text-align: center;">צוות One</p>
    </div>
  `;

  await resend.emails.send({
    from: "One <noreply@joinone.io>",
    to: user.email,
    subject,
    html,
  });

  // Log with email_type for dedup (unique index will prevent duplicates even under race)
  await pgQueryAll(
    "INSERT INTO email_log (user_id, subject, email_type) VALUES ($1, $2, 'pool_welcome') ON CONFLICT DO NOTHING",
    [userId, subject]
  );

  console.log(`[welcomeEmail] User ${userId}: pool welcome email sent to ${user.email}`);
  return { sent: true };
}
