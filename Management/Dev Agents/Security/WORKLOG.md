# Security Agent — Work Log

## Latest: 2026-10-22/23 — Railway Security Incident — Credential Rotation

### אירוע
Railway הודיעו (22/10) על גישה לא מורשית למשתני סביבה מוצפנים. מייל ממוקד (23/10) אישר שה-workspace שלנו ברשימת המטרות של התוקף (חיפוש AI/cloud API keys). לא אושרה חשיפה בפועל.

### פעולות שבוצעו
- **בדיקת לוגים**: OpenAI, Resend, Supabase Auth — הכל נקי, אין פעילות חשודה
- **גיבוי DB** דרך Railway Dashboard לפני שינויים
- **הוחלפו 4 מתוך 6 סודות**:
  - ✅ OPENAI_API_KEY — הוחלף + ישן revoked (22/10)
  - ✅ RESEND_API_KEY — הוחלף + ישן מחוק. נמצא מפתח ישן לא מוכר (dev?) — גם מחוק (23/10)
  - ✅ FIREBASE_SERVICE_ACCOUNT — הוחלף + ישן מחוק (23/10)
  - ✅ DATABASE_URL — סיסמה שונתה בשני DB (staging zephyr + production nozomi) (23/10)
- **נדחו 2 סודות — הערכת סיכון**:
  - ⏸️ SUPABASE_SERVICE_ROLE_KEY — סיכון: ניהול חשבונות Auth בלבד (הdata ב-Railway DB שכבר הוחלף). אין השפעה על משתמשות בהחלפה. נדחה כי צריך בדיקה אם הקוד תומך בפורמט sb_secret_ החדש. **פעולה בסשן הבא.**
  - ⏸️ SUPABASE_JWT_SECRET — סיכון נמוך מאוד (צריך uid ספציפי + מוטיבציה). מנתק כל המשתמשות. **לא מתוכנן כרגע** אלא אם מתגלית פעילות חשודה.

### בעיות שנתקלנו בהן
- Railway image push נכשל 5 פעמים ברציפות ב-production → המערכת הייתה למטה ~1.5 שעות
- **פתרון**: שינוי DATABASE_URL מ-reference לערך ידני triggers restart ללא build חדש
- DATABASE_URL reference לא triggers redeploy אוטומטי כשסיסמת Postgres משתנה

### שינויי קוד (לא אבטחה)
- ניסוח rating notifications רוכך ("כיוון ראשוני" במקום "מצאנו התאמה")
- Endpoint `/new-chat/save-message` — הודעות admin conversation נשמרות בהיסטוריית צ'אט
- באנרים למשתמשות (maintenance) — הופעלו והוסרו

### קבצים שנוצרו
- `credential-rotation-plan-22-10.md` — תכנית פעולה מפורטת
- `incident-response-playbook.md` — מדריך לאירועים עתידיים + לקחים

---

## 2026-10-03 — Agent Created
- Full security context from audit docs + memory
- IDOR test script already in place
- 6 open items documented (signed URLs is the main gap)

---

## History

### 2026-09-23/24 — Full Security Audit + Deploy
- External pentest: 0 exploits (1,483+ requests, 2 accounts)
- 7 fixes deployed to production:
  - set-primary: unprotected admin endpoint → requireAdmin
  - pending-rating IDOR: user_id override → admin check
  - profile_complete: user-editable → server auto-compute
  - Input validation: name, age, height, gender, phone, message length
  - Rate limiting: /register + /auth/exchange-code
  - ADMIN_EMAILS centralized (2 hardcoded locations)
  - Dead x-admin-key removed from frontend

### 2026-09-23 — IDOR Test Script Created
- test-idor.ts: 25 tests covering all /users/:id endpoints
- Verified: all return 403 for cross-user access

### 2026-07-19 — Auth Enforcement + Error Monitoring
- All 22 /users/:id routes → requireUserAuth
- All 65 /admin/* routes → requireAdmin
- error_logs table + frontend auto-reporting
- Admin "שגיאות" tab
