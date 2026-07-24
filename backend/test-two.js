const http = require('http');
const u1 = parseInt(process.argv[2]);
const u2 = parseInt(process.argv[3]);

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({hostname:'127.0.0.1',port:3001,path:'/api/new-chat/message',method:'POST',
      headers:{'Content-Type':'application/json;charset=utf-8','Content-Length':Buffer.byteLength(data)}},
      res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve(JSON.parse(b))); });
    req.on('error',reject); req.write(data); req.end();
  });
}

async function runChat(uid, msgs, label) {
  console.log('\n' + '='.repeat(55));
  console.log('  ' + label);
  console.log('='.repeat(55) + '\n');
  const hist = [];
  for (let i = 0; i < msgs.length; i++) {
    hist.push({role:'user', content:msgs[i]});
    const r = await post({user_id:uid, message:msgs[i], channel:'new_chat', history:hist});
    const reply = r.reply || '';
    hist.push({role:'assistant', content:reply});
    const flags = [];
    if (/דייקתי|להוסיף או לתקן/.test(reply)) flags.push('INSIGHT');
    if (/תודה רבה על הפתיחות|מתחילים לנתח/.test(reply)) flags.push('CLOSE');
    if (/אם יש משהו נוסף|אני כאן בשבילך|אשמח לענות/.test(reply)) flags.push('!!EARLY-CLOSE!!');
    if (/אפשר להמשיך|נמשיך/.test(reply) && /שואל|שאלות|חופר/.test(msgs[i])) flags.push('ASKS-TO-CONTINUE');
    console.log('[' + (i+1) + '] User: ' + msgs[i]);
    console.log('    AI: ' + reply.substring(0, 150));
    if (flags.length) console.log('    [' + flags.join(', ') + ']');
    console.log('');
  }
  // State
  require('dotenv').config();
  const{Pool}=require('pg');
  const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  const r = await p.query('SELECT topic_injection_counts FROM user_chat_summaries WHERE user_id=' + uid);
  const state = r.rows[0]?.topic_injection_counts;
  const counts = state?.counts || {};
  const covered = Object.values(counts).filter(v => v >= 1).length;
  console.log('  Topics covered: ' + covered + '/14');
  console.log('  Counts: ' + JSON.stringify(counts));
  await p.end();
}

async function main() {
  // TEST 1: Normal user + "למה את שואל את כל זה?"
  await runChat(u1, [
    'היי',
    'אני מעצבת גרפית',
    'למדתי עיצוב בשנקר',
    'הגעתי לזה כי תמיד אהבתי לצייר',
    'לא, הייתי נשארת בעיצוב',
    'כן, אוהבת את זה',
    'הייתי בזוגיות של שנתיים, נפרדנו כי לא התאמנו',
    'הוא היה יותר מדי שקט, חסרה לי תקשורת',
    'למה את שואלת את כל זה בעצם?',    // *** INTERRUPTION ***
    'אוקיי הגיוני',
    'כשיש ריב אני צריכה לדבר על זה מיד',
    'כן, אני נוטה להתפרץ ואז מתחרטת',
    'חברים אומרים שאני מלאת אנרגיה אבל לפעמים דרמטית',
    'שאני רגשנית מדי',
    'בקונפליקט אני מתלהמת ואז מתנצלת',
    'נאמנות, תמיד',
    'משפחה קרובה, הורים ואח',
    'כן, דעת המשפחה מאוד חשובה לי',
    'ערב אידיאלי — מסעדה טובה עם חברות',
    'הרפתקאות! לא יכולה עם שגרה',
    'הומופוביה וגזענות זה קו אדום',
    'שוויון ופתיחות, חד משמעית',
    'כל אחד שיחיה איך שהוא רוצה',
    'מחוברת לחופש, לא לדת',
    'אמנות, יכולה לדבר על זה שעות',
    'כן, אני סקרנית מטבעי',
    'עיצוב ואמנות, שם אני שייכת',
    'תערוכה של יאיוי קוסמה ממש נשארה איתי',
    'מעט חברות קרובות מהלימודים',
    'כמה קרובות מאוד, לא הרבה מעגלים',
  ], 'TEST 1: Normal user + interruption');

  // TEST 2: Terse user + "אתה קצת חופר"
  await runChat(u2, [
    'היי',
    'חשמלאי',
    'לא למדתי',
    'כן',
    'לא',
    'הייתי עם מישהי, לא עבד',
    'סתם',
    'אתה קצת חופר לא?',               // *** COMPLAINT ***
    'כן תמשיך',
    'לא יודע, מדבר',
    'שקט',
    'שאני עצלן',
    'לא נכנס לריבים',
    'תומך',
    'משפחה קרובה',
    'לא משנה',
    'בית, טלוויזיה',
    'שגרה',
    'גזענות',
    'סובלנות',
    'לא אכפת',
    'חילוני',
    'כדורגל',
    'לא',
    'הייטק לא',
    'לא משהו מיוחד',
    'חבורה מהצבא',
    'מעט',
  ], 'TEST 2: Terse user + complaint');
}

main().catch(console.error);
