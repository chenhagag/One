# System Jobs — לוגיקת מערכת קבועה

תיעוד של כל התהליכים האוטומטיים שרצים ב-backend בלי התערבות אנושית.

---

## 1. Job Runner (`pipeline/jobRunner.ts`)

**תזמון**: כל 2 דקות (polling)
**מה עושה**: שולף jobs מטבלת `pipeline_jobs` ומעבד אותם

### סוגי jobs:

| job_type | מה עושה | מתי נוצר |
|----------|---------|----------|
| `completion` | Completion pipeline — כניסה למאגר, coverage update | אוטומטי אחרי auto-analysis run #2 |
| `photo_analysis` | ניתוח תמונות AI (look traits) | reconciliation יומית / ידני מ-admin |

### Completion Pipeline (`pipeline/completionPipeline.ts`)
1. ~~תובנות~~ — מדולג (נכתב ע"י Claude Agent)
2. ~~analysis_completed~~ — מדולג (admin מאשר ידנית)
3. Coverage recompute
4. כניסה למאגר (`in_matching_pool = TRUE`)
5. מייל pool (אם נכנס בפועל)

### שמירות:
- retry עם exponential backoff (attempts × 5 דקות)
- מקסימום 3 ניסיונות
- לא מריץ שני jobs מאותו סוג לאותו משתמש במקביל

---

## 2. Photo Reconciliation + Match Promotion

**תזמון**: יומי (כל 24 שעות, 30 שניות אחרי boot)
**מה עושה**: שני תהליכים שרצים יחד:

### 2a. Photo Analysis Reconciliation
סורק משתמשים עם `photo_ai_consent = TRUE` + `analysis_run_count >= 2` + תמונות שלא נותחו → יוצר `photo_analysis` jobs

### 2b. Photo Match Promotion (`pipeline/photoMatchPromotion.ts`)
סורק matches בסטטוס `waiting_for_photo` — אם לשני הצדדים יש תמונות → מקדם ל-`potential_match`.
גם נקרא מ-photo upload endpoint (תגובה מיידית) וגם מ-`reconcileMatchStatuses()` (בעת requalify).

---

## 3. User Nudges (`pipeline/userNudges.ts`)

**תזמון**: יומי (כל 24 שעות)
**מה עושה**: שולח תזכורות אוטומטיות

### לוח זמנים:
| סוג | מתי | תנאי |
|-----|------|-------|
| Welcome | שעה אחרי הרשמה | חד-פעמי |
| Not Started | יום 2, 5, 10, 20 + כל 14 יום | 0 הודעות |
| Incomplete | יום 7, 12, 20, 35 + כל 14 יום | התחיל אבל לא סיים |

### סינונים:
- מינימום 3 ימים בין nudges
- לא שולח ל: test users, זוגות (partner_name), frozen, גברים / מחפשות גברים
- ערוץ: push (אם יש FCM token) → fallback למייל
- לוג: `notification_log` למניעת כפילויות

---

## 3b. Photo Nudges (`pipeline/photoNudges.ts`)

**תזמון**: יומי (כל 24 שעות, 120 שניות אחרי boot)
**מה עושה**: שולח תזכורות להעלאת תמונה למשתמשים עם matches ב-`waiting_for_photo`

### תנאי כניסה:
- match בסטטוס `waiting_for_photo`
- `internal_profile_score >= 72` ב-candidate_matches
- למשתמש אין תמונות
- לא test user, לא frozen, לא couple

### לוח זמנים (per-user, לא per-match):
| שלב | תזמון | פעולה | תנאי |
|------|--------|-------|-------|
| 1 | יום 0 | admin_message + push/email | כניסה ראשונה לזרימה |
| 2 | +2 ימים | push/email תזכורת | עדיין אין תמונה |
| 3a | +7 ימים | push/email תזכורת | צד אחד בלי תמונה |
| 3b | +5 ימים | system_question "התאמה עיוורת?" | **שתי הצדדים** בלי תמונה |
| 4 | +14 ימים | push/email תזכורת אחרונה | רק נתיב 3a |

### התאמה עיוורת:
- שאלת מערכת עם `context = 'blind_match'`
- תשובה "כן אין בעיה" או "אפשרי" → `blind_match_consent = TRUE` על המשתמש
- שני הצדדים אישרו → match עובר ל-`blind_match_candidate`
- badge סגול 👁️‍🗨️ בטאב Candidate Matches באדמין

### כללים:
- **Per-user**: משתמש מקבל flow אחד, לא הודעה נפרדת לכל match
- **עצירה**: רק כשמעלה תמונה
- **הפעלה מחדש**: 14 יום אחרי ה-nudge האחרון, אם עדיין אין תמונה ויש match מתאים
- **מעקב**: `notification_log` עם event_types: `photo_request_1..4`, `photo_blind_question`
- **לוג**: `system_activity_log` לכל שליחה + קידום לעיוורת

---

## 4. Auto-Analysis (`agents/conversation/autoAnalysis.ts`)

**תזמון**: event-triggered (לא cron)
**מה עושה**: מריץ ניתוח traits מלא על שיחות המשתמש

### שתי ריצות:
| ריצה | טריגר | תנאי |
|------|--------|-------|
| Run #1 | צ'אט כללי נסגר (closing_stage ≥ 3) | `analysis_run_count < 1` |
| Run #2 | כל הערוצים שלמים (cognitive + taste) | `analysis_run_count < 2` |

### תהליך:
1. בונה transcript מכל סוגי השיחות (new_chat%, psychologist, null)
2. מריץ 7 קבוצות ניתוח + external
3. שומר traits ב-DB
4. מעדכן cognitive score
5. אחרי Run #2: יוצר completion job

---

## 5. Summarizer (`agents/conversation/summarizer.ts`)

**תזמון**: event-triggered (כל 8 הודעות user)
**מה עושה**: שולף מידע מובנה מהשיחה ושומר ב-`user_chat_summaries`
- Summary JSON: שם, גיל, עיר, העדפות, ערכים, וכו'
- Topic injection counts: מעקב אחרי micro-topics

---

## 6. Reanalysis Scan (`pipeline/reanalysisScan.ts`)

**תזמון**: יומי (כל 24 שעות, 90 שניות אחרי boot)
**מה עושה**: סורק הודעות חדשות בערוצי QA ומריץ ניתוח מחדש
**רץ בכל סביבה**: staging + production (לא שולח הודעות למשתמשים, רק מעדכן traits)

### DB — עמודות חדשות ב-users:
- `last_analysis_at TIMESTAMPTZ` — מתי רץ ניתוח אחרון (auto-analysis / reanalysis / admin reanalyze)
- `insights_updated_at TIMESTAMPTZ` — מתי עודכנו תובנות (generateInsights / admin PATCH)

### לוגיקה:

#### ערוץ `qa_about_me` (תובנות / מה למדת עליי):
- ספירת הודעות **user** מאז `last_analysis_at`
- 5-7 הודעות → `runSingleGroupAnalysis("mbti")` — MBTI + אניאגרם בלבד
- 8+ הודעות → `runAnalysisAgent()` — ניתוח מלא

#### ערוץ `qa_refine` (הוספה וחידוד):
- ספירת **כל** ההודעות (user + assistant) מאז `last_analysis_at`
- 3-7 הודעות (=לפחות 1 הודעת user אמיתית מעבר לטריגר+תשובה) → `runSingleGroupAnalysis("general")`
- 8+ הודעות → ניתוח מלא

#### לאחר כל reanalysis:
- מעדכן `last_analysis_at = NOW()`
- סוכן ניהול המשתמשים (Claude) בודק בריצה יומית: `last_analysis_at > insights_updated_at` → צריך עדכון תובנות

### שמירות:
- **Backfill**: משתמשים שנותחו לפני הפיצ'ר מקבלים `last_analysis_at = updated_at` ב-migration
- **Concurrency**: `scanRunning` flag מונע ריצה כפולה
- **`last_analysis_at` מתעדכן גם**: ב-auto-analysis, admin `/reanalyze`, admin `/reanalyze-group`
- **Reset analysis** מאפס: `last_analysis_at = NULL, insights_updated_at = NULL`
- **סינון**: `analysis_run_count >= 1`, `last_analysis_at IS NOT NULL`, לא test/frozen

### TODO עתידי:
- כשייבנה פרומפט "מידע והעדפות כלליות" → יחליף את קבוצת `"general"` ב-qa_refine
- AI intent detection — סיווג חכם של כל הודעה (איזו קבוצת traits מושפעת, ~$0.001/הודעה)

---

## 7. Daily Matching (`pipeline/dailyMatching.ts`)

**תזמון**: יומי בשעה 4:00 לפנות בוקר (שעון ישראל)
**מה עושה**: ריצה מלאה של אלגוריתם ההתאמות

### תהליך:
1. `runStage1()` — בניית candidate pairs (סינון לפי גיל/מגדר/מיקום)
2. `runStage2()` — חישוב ציונים לכל pair
3. `reconcileMatchStatuses()` — freeze/unfreeze + photo status

### תזמון:
- `setTimeout` מחושב לשעה 4:00 Israel time (`Asia/Jerusalem`)
- אחרי ריצה ראשונה → חוזר כל 24 שעות

### לוג:
`system_activity_log` עם job_type `"matching"` — מספר pairs, scored, frozen, unfrozen

### TODO עתידי:
- per-user trigger על: כניסה למאגר, reanalysis, שינוי פרטים, העלאת תמונה
- גישה: requalify+reconcile בלבד (לא Stage 1+2 מלא שהוא כבד)

---

## 8. Match Photo Status (`reconcileMatchStatuses` + photo upload)

**תזמון**: event-triggered (בכל requalify / reconcile + photo upload)
**מה עושה**: שני כיוונים:

### הורדה: potential_match → waiting_for_photo
- `reconcileMatchStatuses()` בודק matches קיימים בסטטוס `potential_match` / `expanded_potential_match`
- אם לאחד הצדדים אין תמונות → מוריד ל-`waiting_for_photo`
- גם ביצירת match חדש (batch + individual promote) — בודק תמונות לפני INSERT

### קידום: waiting_for_photo → potential_match
- Photo upload endpoint קורא ל-`promoteUserWaitingMatches(userId)` מיד אחרי העלאה
- Daily reconciliation job רץ `promoteAllWaitingMatches()` כ-safety net
- כל קידום מתועד ב-`system_activity_log`

---

## 8. System Activity Log (`pipeline/activityLog.ts`)

**תזמון**: passive (נכתב ע"י שאר ה-jobs)
**מה עושה**: לוג מאוחד לכל הפעולות האוטומטיות

### טבלה: `system_activity_log`
`id, job_type, user_id, user_name, action, details, created_at`

### מי כותב:
| job_type | מתי |
|----------|------|
| `reanalysis` | כל ניתוח מחדש (חלקי או מלא) |
| `nudge` | כל nudge שנשלח בהצלחה (welcome / not_started / incomplete / photo_request / photo_blind_question + ערוץ) |
| `photo_promotion` | כל match שעבר מ-waiting_for_photo ל-potential_match, או ל-blind_match_candidate |

### צפייה:
- Endpoint: `GET /admin/system-activity-log?limit=200&job_type=nudge`
- טאב "לוג מערכת" באדמין — מקובץ לפי תאריך, סינון לפי סוג

---

## מה לא כאן

הפעולות הבאות **לא** רצות אוטומטית — הן מתבצעות ע"י **סוכן ניהול המשתמשים** (Claude Agent) בהפעלה ידנית:
- כתיבת תובנות אישיות
- עדכון תובנות אחרי reanalysis
- כתיבת כרטיסי התאמה
- סריקת תקלות בשיחות
- דו"חות סטטוס
