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

## 2. Photo Reconciliation

**תזמון**: יומי (כל 24 שעות)
**מה עושה**: סורק משתמשים עם `photo_ai_consent = TRUE` + `analysis_run_count >= 2` + תמונות שלא נותחו → יוצר `photo_analysis` jobs

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

## מה לא כאן

הפעולות הבאות **לא** רצות אוטומטית — הן מתבצעות ע"י **סוכן ניהול המשתמשים** (Claude Agent) בהפעלה ידנית:
- כתיבת תובנות אישיות
- עדכון תובנות אחרי reanalysis
- כתיבת כרטיסי התאמה
- סריקת תקלות בשיחות
- דו"חות סטטוס
