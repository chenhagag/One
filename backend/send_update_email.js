const { Pool } = require('pg');
const { Resend } = require('resend');
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZWbozClRQOUwUZqoUaqQvPHstweWnzGY@nozomi.proxy.rlwy.net:32470/railway',
  ssl: { rejectUnauthorized: false }
});

function buildHtml(name) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#333;max-width:500px;margin:0 auto;text-align:right">
<h2 style="color:#1B1464">היי ${name},</h2>
<p>אנחנו יודעים שחלקכם כבר מחכים להתאמה, ורצינו לעדכן איפה הדברים עומדים.</p>
<p>קודם כל – תודה על הסבלנות ועל האמון שאתם נותנים בנו. 💙</p>
<p>One עדיין נמצאת בגרסת בטא, ובכל שבוע מצטרפים משתמשים חדשים ואנחנו ממשיכים לשפר את האלגוריתם, את התובנות ואת חוויית השימוש.</p>
<p>אחד העקרונות החשובים ביותר עבורנו הוא לא להתפשר על התאמות בינוניות. אנחנו מעדיפים שתחכו עוד קצת, מאשר לשלוח התאמה שאנחנו לא באמת מאמינים שיש לה פוטנציאל.</p>
<p>החדשות הטובות הן שככל שהמאגר גדל, כך גם זמן ההמתנה צפוי להתקצר. בנוסף, המערכת עצמה משתפרת כל הזמן – כך שהמערכת שמחפשת עבורך התאמה היום כבר טובה ומדויקת יותר מזו שהייתה לפני כמה שבועות.</p>
<p>אם יצא לך לשוחח עם הצ׳אט שלנו, ייתכן שנתקלת מדי פעם בתשובה לא מדויקת. גם הוא חלק מגרסת הבטא ואנחנו משפרים אותו כל הזמן. אם נתקלת בתקלה, קיבלת תשובה שלא נראתה לך הגיונית או שיש לך כל שאלה או רעיון – נשמח מאוד לשמוע ממך. ניתן לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a>. המשוב שלכם הוא חלק משמעותי מהדרך שלנו להשתפר.</p>
<p>אנחנו יודעים שלהמתין זה לא תמיד פשוט, אבל אנחנו באמת מאמינים שכדאי לחכות להתאמה הנכונה.</p>
<p>תודה שאתם חלק מהמסע הזה. ❤️</p>
<p>צוות One</p>
<div dir="rtl" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center;line-height:1.8">
<p style="margin:0">לא ניתן להשיב למייל זה.</p>
<p style="margin:4px 0 0">מוזמנים לפנות אלינו ב<a href="https://wa.me/972549037400" style="color:#25D366">וואטסאפ</a> או ב<a href="mailto:one-support@googlegroups.com" style="color:#7b5fa3">מייל התמיכה</a></p>
</div>
</div>`;
}

async function main() {
  const { rows } = await pool.query(`
    SELECT id, first_name, email, gender
    FROM users
    WHERE in_matching_pool = TRUE
      AND user_status = 'waiting_match'
      AND waiting_since IS NOT NULL
      AND EXTRACT(DAY FROM NOW() - waiting_since) >= 12
      AND (test_user_type IS NULL OR test_user_type NOT IN ('Couple Tester'))
      AND email IS NOT NULL
      AND email_updates != FALSE
      AND id NOT IN (16, 23)
    ORDER BY waiting_since ASC
  `);

  console.log(`Sending to ${rows.length} users...`);
  let sent = 0, failed = 0;

  for (const u of rows) {
    const html = buildHtml(u.first_name || '');
    try {
      const { error } = await resend.emails.send({
        from: 'One <noreply@joinone.io>',
        to: u.email,
        subject: 'עדכון קטן מ-One 💙',
        html,
      });
      if (error) {
        console.log(`FAIL #${u.id} ${u.first_name} (${u.email}): ${error.message}`);
        failed++;
      } else {
        console.log(`OK #${u.id} ${u.first_name} (${u.email})`);
        await pool.query('INSERT INTO email_log (user_id, subject) VALUES ($1, $2)', [u.id, 'עדכון קטן מ-One 💙']);
        sent++;
      }
    } catch (err) {
      console.log(`ERROR #${u.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
  await pool.end();
}

main().catch(console.error);
