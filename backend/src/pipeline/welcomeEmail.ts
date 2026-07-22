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

  const subject = `הניתוח ${gn("שלך", "שלך")} ב-One הושלם`;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#333;max-width:500px">
<p>היי,</p>
<p>${gn("ברוך הבא", "ברוכה הבאה")} ל-One, ${gn("שמחים שהצטרפת", "שמחים שהצטרפת")} אלינו.</p>
<p>הניתוח האישי ${gn("שלך", "שלך")} הושלם, והוא זמין ${gn("עבורך", "עבורך")} כעת בתוך המערכת.</p>
<p>הניתוח מבוסס על השיחה ש${gn("קיימת", "קיימת")} עם One, ונועד לשקף תובנות ראשוניות על סגנון הקשר ${gn("שלך", "שלך")}, ההעדפות המרכזיות ${gn("שלך", "שלך")}, והמאפיינים שעשויים להיות משמעותיים ${gn("עבורך", "עבורך")} בהתאמה זוגית.</p>
<p>בשלב זה ${gn("נכנסת", "נכנסת")} למאגר ההתאמות שלנו.<br>One נמצאת כעת בתהליך התרחבות ואיסוף משתמשים נוספים, וככל שהמאגר יגדל — נוכל לאתר התאמות מדויקות ורלוונטיות יותר.</p>
<p>כדי שנוכל להציג ${gn("לך", "לך")} ולצד השני הסבר אישי על ההתאמה כשנמצא אותה, יש לאשר את בניית <strong>כרטיס ההתאמה</strong> ${gn("שלך", "שלך")} במערכת. הסבר מלא ואפשרות אישור מחכים ${gn("לך", "לך")} בתוך האפליקציה.</p>
<p style="margin:28px 0"><a href="https://joinone.io" style="display:inline-block;background-color:#7b5fa3;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${gn("כנס", "כנסי")} למערכת לאישור</a></p>
<p>מקווים למצוא ${gn("לך", "לך")} את ה-One ${gn("שלך", "שלך")} בקרוב.</p>
<p>בברכה,<br>צוות One</p>
<p style="margin-top:16px;font-size:13px;color:#888">לנוחותך, ניתן להיכנס למערכת גם דרך:<br><a href="https://joinone.io" style="color:#7b5fa3">joinone.io</a></p>
</div>`;

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
