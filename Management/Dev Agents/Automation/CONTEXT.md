# Automation Dev Agent — Context

## Role
אחראי על כל הלוגיקה האוטומטית שרצה ב-backend: pipelines, cron jobs, nudges, reanalysis, photo management, daily matching. כולל פיתוח, תחזוקה, ניטור ותיקון באגים.

**הבחנה מסוכן ניהול משתמשים**: סוכן זה מטפל בקוד ותשתית. סוכן ניהול המשתמשים מפעיל פעולות ידניות (כתיבת תובנות, סריקת שיחות) שלא ניתנות לאוטומציה.

---

## מערכות פעילות

### Job Runner (`pipeline/jobRunner.ts`)
- Polling כל 2 דקות
- מריץ: completion pipeline + photo analysis
- Retry ×3 עם backoff (5/10/15 דק')
- Jobs נשמרים ב-`pipeline_jobs` table, שורדים restart

### Completion Pipeline (`pipeline/completionPipeline.ts`)
- **Trigger**: auto-analysis run #2 (כל ערוצי השיחה הושלמו)
- **Steps**: ~~generate insights~~ (מדולג — Claude כותב) → analysis_completed=true → pool entry → welcome email
- **Pool gating** — 6 תנאים לפני כניסה למאגר:
  1. General chat closed (closing_stage >= 3)
  2. Cognitive done (closing >= 3 or 7+ messages)
  3. Taste done (closing >= 3 or 10+ messages)
  4. לפחות תמונה 1
  5. גיל מוגדר
  6. עיר מוגדרת
- אם חסר תנאי → logs + step `pool_blocked`

### Photo Analysis (`pipeline/photoAnalysis.ts`)
- **Trigger**: העלאת תמונה (עם consent + analysis_run_count ≥ 2) או reconciliation יומית
- GPT-4o Vision → 11 look traits → `user_look_traits`
- לא דורסת source=manual
- Reconciliation: startup + כל 24 שעות

### Daily Matching (`pipeline/dailyMatching.ts`)
- 4:00 AM Israel time via jobRunner
- Stage 1 (filtering) → Stage 2 (scoring) → reconcileMatchStatuses
- Logged to system_activity_log
- **פתוח**: per-user triggers לא נבנו (pool entry, reanalysis, photo upload)

### Photo Match Promotion (`pipeline/photoMatchPromotion.ts`)
- Match creation: אם חסרה תמונה → `waiting_for_photo` (לא `potential_match`)
- `reconcileMatchStatuses()`: demote existing potential_match אם חסרה תמונה
- `promoteAllWaitingMatches()`: promote כש-שתי התמונות קיימות
- 3 enforcement points: match creation, reconcile, photo upload

---

## מערכות Nudge (4)

### 1. User Nudges (`pipeline/userNudges.ts`)
- Welcome: שעה אחרי הרשמה (חד-פעמי)
- Not Started (0 הודעות): יום 2, 5, 10, 20 + כל 14 יום
- Incomplete (התחילה לא סיימה): יום 7, 12, 20, 35 + כל 14 יום
- מרווח מינימלי 3 ימים בין nudges

### 2. Photo Nudges (`pipeline/photoNudges.ts`)
- 4-step per-user flow למשתמשות בלי תמונה עם waiting_for_photo matches:
  - יום 0: admin_message + push/email
  - יום 2: reminder
  - יום 5 (שני צדדים בלי תמונה): system_question על התאמה עיוורת
  - יום 7 (צד אחד עם תמונה): reminder
  - יום 14: reminder אחרון
- blind_match: system_question עם context='blind_match'. תשובה חיובית → blind_match_consent=true
- **Edge case פתוח**: צד אחד ענה, השני לא — אין פתרון מעוצב

### 3. Message Nudges (`pipeline/messageNudges.ts`)
- תזכורות לשאלות סגורות (system_questions) ופתוחות (admin_messages type=conversation)
- לוח זמנים: +2 ימים, +5 ימים, +12 ימים
- שאלות מתוך match: `match_id` על system_questions, auto-set match status ל-waiting_for_response
- notification_log event types: `system_question_reminder_1..3`, `admin_question_reminder_1..3`

### 4. Rating Nudges (`pipeline/ratingNudges.ts`)
- **Auto-send לצד שני**: דירוג חיובי (possible/bullseye) → שליחה אוטומטית לצד השני
- תזכורות: +2, +5, +12 ימים מ-sent_for_rating_at
- עצירה אוטומטית: דירוג הוגש, self-freeze, match cancelled
- נוסח: "מצאנו לך התאמה פוטנציאלית" — לעולם לא "דירוג"/"הערכה"/"ציון"

### כללי Nudge משותפים
- **Cooldown גלובלי**: 20 שעות בין מערכות
- **userNudges**: מרווח נוסף 3 ימים
- **סינון**: WW only (gender != 'man' AND looking_for_gender != 'man')
- **אי-הכללה**: test_user_type, partner_name (couples), @test.com
- **Staging block**: בדיקת `STAGING_URL` env var (NODE_ENV לא מספיק)
- **Push עם email fallback** דרך `notifyUser()`

---

## Reanalysis System (`pipeline/reanalysisScan.ts`)
- Cron יומי ב-jobRunner
- **qa_about_me**: 5-8 user messages מאז last_analysis_at → reanalyze "mbti" בלבד. 8+ → full reanalysis
- **qa_refine**: 3-8 total messages (≥1 real user msg) → reanalyze "general" בלבד. 8+ → full reanalysis
- מעדכן `last_analysis_at` אחרי כל reanalysis
- **בעיה ידועה**: `last_analysis_at` גלובלי — partial reanalysis "מסתיר" הודעות מקבוצות אחרות. צריך per-group tracking

---

## RAG — חלק האוטומציה בלבד
התשתית המלאה של ה-RAG (rag.ts, seedKnowledge.ts, embedding, search) מתועדת ב-**סוכן Backend** (`Management/Dev Agents/Backend/CONTEXT.md`).

מה שרלוונטי לסוכן אוטומציה:
- **Auto-upsert insight chunks**: כשנכתבות תובנות → chunk נוצר/מתעדכן ב-knowledge_chunks (one per user, scope=user)
- **Daily reconciliation**: מתקן upsert failures תוך 24 שעות (cron ב-jobRunner)
- **Backfill**: 90 שניות אחרי startup — בדיקה שכל המשתמשות עם תובנות יש להם chunk
- **⚠️ Scaling**: reconcileInsightChunks בלי LIMIT — צריך batching לפני השקה (100+ users)
- **סינון כפילויות**: ערוצים עם הזרקה ישירה (qa_about_me וכו') מסננים insight chunks מ-RAG

---

## Rating Lock System (החליף freeze)
- Lock = derived מסטטוס התאמות (לא stored)
- Locked אם: active rater ב-waiting_first/second_rating או in_match
- `pending_second_rating`: סטטוס חדש, promote ידני via `send-second-rating` endpoint
- Auto-promote: דירוג חיובי → pending → אם הצד השני פנוי → waiting_second_rating

---

## Email System
- Resend API, domain joinone.io
- `RESEND_API_KEY` ב-Railway Variables (prod + staging)
- שימושים: admin emails, OTP login, nudge notifications
- From: `One <noreply@joinone.io>`

---

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/pipeline/jobRunner.ts` | Main job scheduler (2-min polling) |
| `backend/src/pipeline/completionPipeline.ts` | User completion → pool entry |
| `backend/src/pipeline/photoAnalysis.ts` | GPT-4o Vision → look traits |
| `backend/src/pipeline/dailyMatching.ts` | 4AM matching cron |
| `backend/src/pipeline/photoMatchPromotion.ts` | waiting_for_photo management |
| `backend/src/pipeline/userNudges.ts` | Welcome/not-started/incomplete nudges |
| `backend/src/pipeline/photoNudges.ts` | Photo request + blind match flow |
| `backend/src/pipeline/messageNudges.ts` | Unanswered question reminders |
| `backend/src/pipeline/ratingNudges.ts` | Rating reminders + auto-send |
| `backend/src/pipeline/reanalysisScan.ts` | QA channel reanalysis triggers |
| `backend/src/pipeline/generateInsights.ts` | GPT insights (exists but not auto-called) |
| `backend/src/pipeline/welcomeEmail.ts` | Pool entry welcome email |
| `backend/src/matchStage1.ts` | Candidate filtering (age, gender, location, cognitive) |
| `backend/src/matchStage2.ts` | Scoring: internal + external + per-category |
| `backend/src/cognitiveScore.ts` | Cognitive profile computation |
| `backend/src/notifications.ts` | notifyUser, sendPushOnly, STAGING_URL guard |
| `backend/src/pipeline/androidTesterNudges.ts` | Push reminders for 13 Android testers |
| `backend/src/activityLog.ts` | system_activity_log helper |

---

## Admin Endpoints
| Endpoint | Purpose |
|----------|---------|
| `POST /admin/users/:id/run-pipeline` | Trigger completion pipeline |
| `POST /admin/users/:id/run-photo-analysis` | Trigger photo analysis |
| `GET /admin/pipeline-jobs` | View job status |
| `POST /admin/run-user-nudges` | Manual nudge trigger |
| `POST /admin/run-photo-nudges` | Manual photo nudge trigger |
| `POST /admin/run-message-nudges` | Manual message nudge trigger |
| `POST /admin/run-rating-nudges` | Manual rating nudge trigger |
| `GET /admin/system-activity-log` | Unified activity log |

---

## בעיות ידועות
- **RAG scaling**: reconcileInsightChunks בלי LIMIT — צריך batching
- **Reanalysis per-group**: last_analysis_at גלובלי מסתיר הודעות מקבוצות שלא רצו
- **Blind match edge case**: צד אחד ענה, השני לא — אין פתרון
- **Per-user matching triggers**: לא נבנו — רק daily run ב-4AM
- **Account hard delete**: FK constraints חוסמים — workaround via bug report

## מה עוד לא אוטומטי (מנוהל ידנית ע"י סוכן ניהול)
- כתיבת תובנות (Claude, לא GPT)
- כתיבת כרטיסי התאמה
- ניתוח חיצוני (look traits) — ידני או photo analysis
- סריקת שיחות
- שליחת שאלות/הודעות למשתמשות
- עדכון agent_context per-user

---

## What to Read
1. קובץ זה (CONTEXT.md)
2. WORKLOG.md של סוכן זה
3. `CLAUDE.md` — ארכיטקטורה כללית (skip: conversation prompts, frontend routing)
4. `WORK_LOG.md` — סשן אחרון
5. `Management/claude-working-guidelines.md` — הנחיות כלליות (deploy, staging, prompts)
6. `Management/Docs/System Jobs.md` — תיעוד מלא של jobs

## Rules
- **Staging לפני production תמיד** — כל שינוי ב-pipeline
- **STAGING_URL check** בכל notification function חדשה
- **לא לדרוס source=manual** ב-look traits
- **seedKnowledge.ts** חייב להתעדכן עם שינויי פיצ'ר
- **Nudge copy** — קונקרטי, מסביר למה. בלי "חסרה לנו", "מחכים לך", "תזכורת אחרונה"
