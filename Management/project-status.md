# Project Status — One (updated 2026-10-03)

מסמך מצב פרויקט שמרכז מידע שלא נמצא ב-WORK_LOG.md או CLAUDE.md.

---

## סביבות

| סביבה | Branch | DB | Domain |
|--------|--------|-----|--------|
| Production | main | nozomi.proxy.rlwy.net:32470 | joinone.io |
| Staging | staging | zephyr.proxy.rlwy.net:19134 | *.up.railway.app |
| Local dev | - | staging DB (zephyr) | localhost:3000/3001 |

- Supabase משותף לכל הסביבות
- Railway staging רץ עם NODE_ENV=production — חסימת notifications דרך STAGING_URL

---

## WW-Only Pivot (מאז 2026-09-25)
האפליקציה פועלת כ-WW בלבד (נשים מחפשות נשים).
- `isWW = gender === "woman" && looking_for_gender !== "man"`
- כל 4 מערכות nudge מסוננות ל-WW
- פרומפטים, UI, סקר — הכל מותאם
- מסמך הרחבה לקהלים נוספים: `Management/Docs/expansion-to-other-audiences.md`

---

## מערכות אוטומטיות פעילות

### Pipeline (completion)
- Trigger: auto-analysis run #2 → generate insights → pool entry → welcome email
- Job runner polls כל 2 דקות, retry ×3 עם backoff
- Pool gating: 6 תנאים (general closed, cognitive, taste, photo, age, city)
- **תובנות נכתבות ע"י Claude** — completionPipeline מדלג על GPT insights

### Photo Analysis
- Trigger: העלאת תמונה (עם consent) או reconciliation יומית
- GPT-4o Vision → 11 look traits → user_look_traits
- לא דורסת source=manual

### Daily Matching (4AM Israel)
- Stage 1 (filtering) → Stage 2 (scoring) → reconcile
- ריצה אחת ביום, per-user triggers תוכננו אבל לא נבנו

### Nudges (4 מערכות)
| מערכת | קובץ | לוח זמנים |
|--------|-------|------------|
| Welcome/Not-started/Incomplete | userNudges.ts | יום 2,5,10,20 + כל 14 יום |
| Photo requests + blind match | photoNudges.ts | יום 0,2,5,7,14 |
| Message/question reminders | messageNudges.ts | +2,+5,+12 ימים |
| Rating reminders | ratingNudges.ts | +2,+5,+12 ימים |

- cooldown גלובלי 20 שעות בין מערכות
- מסננים: WW, לא couples, לא @test.com

### Reanalysis
- qa_about_me: 5-8 הודעות → reanalyze MBTI, 8+ → full
- qa_refine: 3-8 הודעות → reanalyze general, 8+ → full
- בעיה ידועה: last_analysis_at גלובלי, צריך per-group tracking

---

## מערכת RAG
- pgvector, 53 chunks מערכת (scope=system)
- User memory chunks — תשתית מוכנה, לא מאוכלס
- Live state: getAgentSafeLiveState() מ-DB
- Threshold: 0.30 (Hebrew embedding scores נמוכים)
- **כלל תחזוקה**: שינוי בפיצ'ר → עדכון chunks ב-seedKnowledge.ts → seed staging + prod

### RAG Insights (staging בלבד, מאז 2026-09-22)
- הזרקה ישירה לערוצים אישיים (qa_about_me, qa_search וכו')
- RAG בלבד לערוצים טכניים (qa_system, qa_general)
- **scaling issue**: reconcileInsightChunks בלי limit — צריך batching לפני השקה

---

## Agent Context System
- `agent_context` TEXT per-user — מוזרק לפרומפט
- 4 config keys למידע מערכתי (general, male, female, female_ff)
- הזרקה: QA channels תמיד, general/cognitive/taste רק אם in_matching_pool
- Closed-world: AI לא ממציא פרטים על מועמדים

---

## Rating Lock System (החליף freeze, מאז 2026-09-27)
- Freeze הוסר לחלוטין
- Lock = derived מסטטוס התאמות: active rater ב-waiting_first/second_rating או in_match
- `pending_second_rating`: סטטוס חדש, promote ידני
- Auto-promote: דירוג חיובי → pending → אם הצד השני פנוי → waiting_second_rating

---

## Special Attention System
- `special_attention` column: NULL=אוטו, TRUE=ידני, FALSE=override
- זיהוי אוטומטי: trans≥50, trollness≥50, photo flags, deal_breakers keywords
- `identity_override`, `toxicity_override` — overrides ידניים
- "התאמות על הפרק" tab: רק actionable matches

---

## בעיות ידועות / פתוחות

### קריטי לפני השקה
- **Hard delete חשבון** — FK constraints חוסמים. workaround: bug report + מחיקה ידנית
- **RAG scaling** — reconcileInsightChunks בלי limit
- **Pool count display** — מוסתר עד 100+ per gender

### ידוע, לא דחוף
- **Trans filter** — passesSexualIdentityFilter חוסם trans users לחלוטין (0 התאמות)
- **Score gap** — פער בין ציוני קטגוריה לציוני traits בודדים
- **Style prompt** — 17 תכונות סגנון ממתינות (geekiness + mainstreamness הושלמו)
- **Signed URLs for /uploads** — תמונות נגישות בלי auth אם יודעים URL (filenames לא ניתנים לניחוש)
- **Chat history menu** — צריך להחליף "חזרה לשיחה" ברשימת שיחות GPT-style
- **LGBTQ+ profiles** — taste-profiles-female-ff.txt צריך שכתוב אותנטי

### Staging errors (non-critical)
- Cities ON CONFLICT — חסר UNIQUE constraint על city_name
- express-rate-limit IPv6 — תוקן ב-30.09

---

## Email System
- Resend API, domain joinone.io מאומת
- שימושים: admin emails, OTP login, nudge notifications
- RESEND_API_KEY ב-Railway Variables (prod + staging)

---

## Security
- Audit מלא 23-24.09.2026, deployed to prod
- 0 exploits ב-pentest חיצוני (1,483+ requests)
- פתוח: signed URLs for uploads (priority), NaN param validation, per-user rate limit

---

## אנשים

### Chen (מייסדת)
- מנהלת product, dev, users, marketing לבד
- עברית = שפת תוכן ראשית
- email: chen.hagag@gmail.com

### Ron (אח)
- עשוי לעבוד על שיפור הצ'אט
- גישה ל-staging בלבד, אין גישה ל-prod
- .env מינימלי: OPENAI_API_KEY, staging DB, SUPABASE_JWT_SECRET

### Sasha (משווקת)
- s.jo.design@gmail.com
- דשבורד שיווק: /meme-dash-7x9k
- entry_point='meme' למשתמשות שהגיעו דרכה

---

## DM System
- 15 תיקוני יציבות הושלמו (07/2026)
- Auth verification ב-22 endpoints
- Error logging system פעיל
- Scaling concerns מתועדים (WebSocket needed at 500+ concurrent)

---

## Expanded Matches
- `expanded_potential_match` — התאמות שחורגות מהעדפות גיל/מיקום
- Admin: תגיות כחולות + כפתור "מחק מורחבות"
- location_expanded bug תוקן

---

## Photo Match Flow
- העלאת תמונה → promotion מ-waiting_for_photo
- 3 enforcement points: match creation, reconcile, photo upload
- Default photo AI consent = checked

---

## Matching Algorithm — Reference
- Trait similarity: Gaussian σ=12
- WW External: 70% femininity match + 30% appeal (מינימום שני כיוונים)
- Non-WW: 70% internal + 30% external
- Categories weighted: Cognitive×3, External×3, Communication×2 וכו'
- MBTI Thinking +10 (תיקון bias שיחתי)
- Emotionality: male +10, Emotional-Social: male +4
