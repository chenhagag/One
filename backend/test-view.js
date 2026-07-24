const http = require('http');
const uid = parseInt(process.argv[2]);
function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({hostname:'127.0.0.1',port:3001,path:'/api/new-chat/message',method:'POST',
      headers:{'Content-Type':'application/json;charset=utf-8','Content-Length':Buffer.byteLength(data)}},
      res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve(JSON.parse(b))); });
    req.on('error',reject); req.write(data); req.end();
  });
}
async function run() {
  const hist = [];
  const msgs = [
    'היי',
    'עובד בהייטק, מפתח',
    'למדתי מדעי המחשב בטכניון',
    'הגעתי לזה כי אהבתי לפתור בעיות',
    'כן, חושב שהייתי נשאר בזה גם בלי כסף',
    'אוהב את האתגר, פחות את הישיבות',
    'רגע, למה אתה שואל על העבודה? מה זה קשור לשידוך?',
    'הייתי בזוגיות של שנתיים, נפרדנו',
    'היא רצתה להתחתן ואני לא הייתי מוכן',
    'כשיש ריב אני צריך יום להירגע',
    'למה אתה שואל אותי על ריבים? זה באמת יעזור למצוא לי התאמה?',
    'אוקיי, הגיוני',
    'כן, אני קצת נוטה להתרחק',
    'חברים אומרים שאני שקט אבל עמוק',
    'שאני יותר מדי ביקורתי',
    'בקונפליקט אני מנסה להבין את הצד השני',
    'אומר את האמת, גם אם זה לא נעים',
    'משפחה מאוד קרובה, אח ואחות',
    'כן, דעת המשפחה חשובה אבל לא מכרעת',
    'ערב אידיאלי — טיול שטח ומדורה',
    'הרפתקאות, בטח, לא שגרה',
    'אגב, זה באמת יעזור לי למצוא מישהי? איך זה עובד?',
    'גזענות והומופוביה זה קו אדום',
    'חשוב לי שותפות ערכית בנושאים הגדולים',
    'כל אחד חי איך שהוא רוצה, לא שופט',
    'מחובר לחופש, לא למסורת',
    'אסטרונומיה, יכול לדבר על זה שעות',
    'כן, אני תמיד סקרן ללמוד דברים חדשים',
    'מדע ופילוסופיה, שם אני שייך',
    'פודקאסט על פיזיקה קוואנטית ממש נשאר איתי',
    'מגוונים מאוד, כל אחד עולם אחר',
    'מעט קרובים, לא צריך הרבה',
    'כן, מדויק, אולי רק הייתי מוסיף שחשוב לי גם הומור',
    'תודה!',
  ];

  // Show FULL text of last 8 messages
  const startFrom = msgs.length - 8;
  for (let i = 0; i < msgs.length; i++) {
    hist.push({role:'user', content:msgs[i]});
    const r = await post({user_id:uid, message:msgs[i], channel:'new_chat', history:hist});
    const reply = r.reply || '';
    hist.push({role:'assistant', content:reply});
    if (i >= startFrom) {
      console.log('---');
      console.log('User [' + (i+1) + ']: ' + msgs[i]);
      console.log('AI: ' + reply);
      console.log('');
    }
  }
}
run().catch(console.error);
