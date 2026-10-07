# Functional Specification Agent — Work Log

## Latest: 2026-10-07 — הקמת סוכן + אפיון מעמיק (v2.0)

### מה נעשה
- נוצר סוכן אפיון פונקציונלי חדש
- נכתב `functional-spec.md` — טיוטה ראשונית, 16 פרקים + 2 נספחים
- נוצר מנגנון `CHANGES-QUEUE.md` — סוכנים אחרים מדווחים שינויים
- עודכנו: CLAUDE.md, AGENTS-GUIDE.md, claude-working-guidelines.md

### מה כולל האפיון כרגע
1. סקירה כללית (tech stack, סביבות)
2. ארכיטקטורה (4 מערכות ליבה, data flow)
3. מערכת השיחה (8 ערוצים, micro-topics, prompts, RAG)
4. מערכת הניתוח (8 prompt groups, MBTI, Enneagram, cognitive)
5. מערכת ההתאמה (Stage 1+2, Gaussian scoring, profile scores)
6. ממשק משתמשת (NewChat, auth, profile, insights, settings)
7. Admin
8. אוטומציה (pipelines, 4 nudge systems)
9. כרטיסי התאמה
10. הודעות ישירות
11. אבטחה
12. Android
13. מסד נתונים (20+ טבלאות)
14. API Endpoints
15. Couple Tester
16. שיווק

### מסכי UI שתועדו (סעיף 6)
- Landing, PWA Install, AuthScreen (5 מצבים), AuthCallback (3 מצבים)
- ProfileSetup, CoupleWelcome, ConsentScreen
- NewChat: סיידבר (11 ערוצים + פריטים מותנים), Home screen (8+ כרטיסי תוכן)
- Chat, ProfileEdit (4 כרטיסי sections + מודאל תמונות)
- Insights (7 sub-views: main + 6 הרחבות)
- Feedback, Settings
- Match flow: potential_matches, match_hub, match_card, match_chat, cancel_match, past_matches
- Register (legacy)

### דיאגרמות שנוספו (נספח ג')
1. ג.1 — מסע משתמשת חדשה (User Journey flowchart)
2. ג.2 — מכונת מצבים: שיחה (Conversation State Machine)
3. ג.3 — ערוצי שיחה ומצביהם + triggers לניתוח
4. ג.4 — זרימת ניתוח (Analysis Pipeline — 8 prompt groups)
5. ג.5 — אלגוריתם התאמה (Stage 1 filtering → Stage 2 scoring)
6. ג.6 — זרימת סטטוס התאמה (Match Status Flow)
7. ג.7 — מערכת Nudges — תזמון ו-cooldown
8. ג.8 — Completion Pipeline (6 תנאי כניסה למאגר)
9. ג.9 — אימות ו-Middleware (Auth + Rate Limiting)
10. ג.10 — ERD — טבלאות מרכזיות
11. ג.11 — ארכיטקטורת מערכת כללית

### העמקת פרקים (v2.0)
- **פרק 7 (Admin)** — הורחב מ-15 ל-~100 שורות: כל 16 טאבים, UserDetail עם כל הפעולות, Candidate Matches עם toolbar + match detail modal, Card Preview
- **פרק 10 (Direct Messaging)** — נוספו כל 7 ה-API endpoints + הערת ביצועים
- **פרק 11 (אבטחה)** — עודכן: 42 user routes, 82 admin routes, 4 rate limiters, סדר middleware, אבטחת תמונות
- **פרק 13 (DB)** — הורחב מטבלה של 20 שורות ל-35 טבלאות מפורטות עם כל העמודות, FKs, indexes
- **פרק 14 (API)** — הורחב מ-10 routes ל-~152 routes מלאים: 14 public, 5 auth, 42 user, 8 requireAuth, 82 admin

### העמקת פרק 3 — מערכת שיחה (v2.1)
- **14 micro-topics** עם שאלות פתיחה בעברית + מספר follow-ups
- **Intent detection** — כל ה-regex patterns לזיהוי profile/system/general
- **ConversationState** — מבנה JSONB מלא
- **5 תבניות פרומפט** — SYSTEM_IDENTITY מלא, כללים per-template
- **מכונת סגירה** — 4 stages עם מעברים
- **ניתוב ערוצים** — new_chat, cognitive, taste, QA variants — כל אחד עם לוגיקה ייחודית
- **Taste test** — 4 בנקי פרופילים, סדר בחירה, זרימת שלבים, deal-breakers
- **QA calibration** — 3 שאלות כיול per-trait-group, בנקים לפי מגדר
- **Agent context** — תנאי הזרקה, 4 מקורות, כללי בטיחות
- **Summarizer** — סכמת 8 שדות, GPT-4o-mini, trigger כל 8 הודעות
- **Auto-analysis** — 2 הרצות, 7-step flow, completion pipeline trigger
- **Transcript building** — 3 parts, fallback logic
- **Coverage** — met/below/missing, readiness score, unmet_traits
- **Couple Tester + WW** — סיפים שונים, פרופילים שונים, הקשר ייעודי

### העמקת פרק 8 — אוטומציה (v2.2)
- **Job Runner** — startup sequence, תזמונים מתוזמנים, retry logic, reconciliation
- **Completion Pipeline** — 6 תנאים מדויקים עם SQL, pool entry אטומי
- **Photo Analysis** — 11 תכונות מפורטות עם טווחים, photo flags, belt+suspenders protection
- **Daily Matching** — 3-step sequence, logging
- **Photo Match Promotion** — trigger + condition
- **4 מערכות Nudge** — כל אחת עם תזמונים, הודעות, תנאים:
  - User: welcome +1h, not-started days 2/5/10/20, incomplete days 7/12/20/35
  - Photo: 4 שלבים + blind match consent + restart
  - Message: system_questions + admin_messages, +2/5/12 days
  - Rating: +2/5/12 days, auto-stop conditions
- **Android Tester** — 13 emails, כל 48h
- **Reanalysis Scan** — qa_about_me (5-7→mbti, 8+→full), qa_refine (3-7→general, 8+→full)
- **Insight Generation** — GPT-4o, summary_short + summary_full
- **cooldown + WW filter + notifyUser mechanism**

### העמקת פרק 4 — ניתוח (v2.3)
- **75 תכונות פנימיות** מפורטות לפי קבוצה (10 cognitive, 5 Big Five, 11 Schwartz, 9 emotional, 20 style, 6 attitudes, 6 MBTI, 9 Enneagram, 8 general)
- **8+1 prompt groups** עם שמות קבצים, מספר תכונות, עיקרי
- **Cognitive score** — נוסחה מלאה (10 תכונות + משקלות + normalization)
- **MBTI** — 4 צירים עם לוגיקה מדויקת (כולל Thinking +10, borderline 50-55)
- **Enneagram** — חישוב type+wing עם 9 תיאורים בעברית
- **Attachment** — dominant + compound labels עם תיאורי עברית
- **Safe Output Layer** — מה מוצג/מוסתר, 5 רמות, formatRichProfileForChat
- **Upsert logic** — COALESCE behavior (internal vs external), mirror detection, deal_breakers
- **Single group analysis** — 9 מפתחות זמינים
- **הנחיות פרומפט** — Israeli cultural context, geekiness cap, anti-flattery, attachment non-zero-sum

### העמקת פרק 5 — התאמה (v2.4)
- **Stage 1 (674 שורות)**: 16 סינונים בסדר מדויק, כל אחד עם תנאים + thresholds
- **Age**: 3 רמות גמישות + default ranges (same-sex vs hetero + decades-over-30)
- **Location**: 4 רמות + 9 אזורים + admin override + expanded bump
- **Height**: 3 רמות + default behavior per gender/orientation
- **Toxic/troll pre-filter**: threshold 70/0.6 + admin override
- **Trans filter**: score>50 + confidence≥0.6 logic
- **Personal filters**: effective_weight formula + 5 traits + body type + gender expression
- **Stage 2 (1161 שורות)**: Gaussian σ=12 formula, confidence blending (threshold 0.3)
- **External score**: Standard (8 traits × weights) vs WW (70% femininity weakest-link + 30% appeal)
- **13 categories**: full trait-to-category mapping tables
- **Gender adjustments**: emotionality +10 / emotional-social +4 (male-female only, 50/50 blend)
- **Profile score**: confidence-weighted category aggregation
- **Promotion**: dual threshold + expanded status logic
- **Priority system**: waiting days + match counts → selection + freeze

### פרקים נותרים + cross-check (v3.0)
- **פרק 9 (כרטיסי התאמה)** — הורחב: 2 רמות consent, Closed-World Rule + origin story, 2-step API flow, checklist 8 סעיפים
- **פרק 12 (מובייל)** — הורחב: live-reload model, signing rules, iOS roadmap, CORS, assetlinks, Google Play requirements
- **פרק 15 (Couple Tester)** — הורחב: CoupleWelcome screen, DB fields, couple insights flow, threshold differences
- **פרק 16 (שיווק)** — הורחב: payment model details, entry_point rule, anonymous tracking, Instagram slide anatomy, email template issues, LGBTQ+ blocker detail
- **פרק 16.7 (Design System)** — נוסף: full color palette, inline styles rule, UI principles, onboarding frosted glass, Admin vs User styling, wwRel()
- **פרק 11 (אבטחה)** — הורחב: pentest results, IDOR regression script, architectural rules, 6 open items
- **נספח ב' (אילוצים)** — הורחב מ-15 ל-28 כללים, מחולק ל-5 קטגוריות

### Cross-check findings resolved:
- Design: color palette + typography + inline styles rule + email template bug + onboarding redesign
- Security: pentest baseline + IDOR script + route order + staging guard + match_card_sent_at
- Android: live-reload + signing + iOS roadmap + CORS + Google Play requirements
- Backend: RAG scaling warning + seedKnowledge rule + HEIC limitation + trans filter known issue
- Frontend: logout routing + has_profile_details + MBTI feminine descriptions + pool count hidden
- Marketing: competitor deadline + payment model + anonymous tracking + LGBTQ+ content blocker
- Match Card Writer: trigger query + 2-tier consent + Closed-World origin + checklist
- Matching: expanded_potential_match rule + trollness filter + neuroticism half-weight

### TODO לסשנים הבאים
- [x] הצלבה מול קוד בפועל — 10/10 spot-checks passed
- [x] פרק Rating System (פרק 10 חדש) — 4 ערכי דירוג, זרימת סטטוסים, lock system, notifications
- [x] דיאגרמת Sequence: הודעת צ'אט (ג.12) — Frontend → Backend → chatManager → OpenAI → DB → Summarizer
- [x] דיאגרמת Sequence: העלאת תמונה (ג.13) — consent → upload → HEIC → save → photo_analysis job → GPT-4o Vision
- [x] דיאגרמת Sequence: דירוג (ג.14) — Admin → send-for-rating → U1 rates → lock check → U2 rates → approved

### TODO לסשנים הבאים
- [ ] הוספת פרק Chat Reviewer (סריקת שיחות — daily vs full scan, violation categories)
