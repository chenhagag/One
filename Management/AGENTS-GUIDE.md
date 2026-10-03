# Agent System Guide — One Project

## מבנה כללי

הפרויקט מחולק לסוכנים ייעודיים, כל אחד עם תיקייה משלו תחת Management/:

```
Management/
├── Dev Agents/          ← סוכני פיתוח
│   ├── Android/         ← בניית AAB, Capacitor, Google Play
│   ├── Analysis/        ← מערכת הניתוח: 8 prompt groups, traits, cognitiveScore, safeOutputLayer
│   ├── Backend/         ← Express, API, DB, RAG infra
│   ├── Conversation/    ← מערכת השיחה: chatManager, prompts, NewChat.tsx, ערוצים
│   ├── Frontend/        ← React, UI/UX, PWA, auth, admin, landing pages
│   ├── Automation/      ← Pipelines, cron, nudges, matching, reanalysis
│   ├── Design/          ← שפה עיצובית, brand, UX patterns
│   ├── Matching/        ← אלגוריתם התאמות, ציונים, ניתוח
│   └── Security/        ← אבטחה, הרשאות, validation
├── User Management Agents/ ← סוכני ניהול משתמשים
│   ├── User Management/ ← ניהול מחזור חיים, סריקות, כרטיסים
│   └── Insights Writer/ ← כתיבת תובנות אישיות
├── Marketing/           ← דפי נחיתה, פוסטים, דשבורד סאשה
```

---

## מבנה תיקיית סוכן

כל סוכן מכיל לפחות שני קבצים:

### CONTEXT.md (חובה)
הקובץ הראשי — כל מה שהסוכן צריך לדעת כדי לעבוד.

מבנה מומלץ:
```markdown
# [Agent Name] — Context

## Role
תיאור קצר של תפקיד ואחריות

## Current State
מצב נוכחי, מה עובד, מה שבור

## Key Files
טבלת קבצים רלוונטיים עם מיקום ותפקיד

## Architecture / How It Works
הסבר טכני של המערכת

## Known Issues
בעיות ידועות ופתוחות

## What to Read
רשימת קבצים שהסוכן צריך לקרוא כשמופעל:
1. CONTEXT.md שלו (ראשי)
2. WORKLOG.md שלו
3. CLAUDE.md (כללי — לדלג על חלקים לא רלוונטיים)
4. WORK_LOG.md (כללי — סשן אחרון)
5. Management/claude-working-guidelines.md
6. קבצים ספציפיים לסוכן

## Rules
כללים ספציפיים לסוכן (למשל "לעולם לא לשחזר keystore")
```

### WORKLOG.md (חובה)
יומן עבודה ייעודי לסוכן. מתעדכן בסוף כל סשן.

מבנה:
```markdown
# [Agent Name] — Work Log

## Latest: YYYY-MM-DD — [תיאור קצר]
- מה נעשה
- מה השתנה
- TODO לסשן הבא

---

## Previous: YYYY-MM-DD — [תיאור]
...
```

---

## כללי יצירת סוכן חדש

### מתי ליצור
- כשיש תחום עבודה מוגדר שחוזר על עצמו
- כשיש מספיק מידע ספציפי שמצדיק הפרדה
- לא ליצור סוכן "ריק" — רק כשיש תוכן אמיתי

### תהליך
1. **ליצור תיקייה** תחת Dev Agents/, User Management Agents/, או Marketing/
2. **לכתוב CONTEXT.md** עם כל המידע הרלוונטי — מקורות:
   - זיכרון מקומי (.claude/memory/) — להעביר תוכן רלוונטי
   - WORK_LOG.md — לחלץ היסטוריה רלוונטית
   - CLAUDE.md — לא להעתיק, רק להפנות לסעיפים ספציפיים
   - Management/project-status.md — לחלץ חלקים רלוונטיים
3. **לכתוב WORKLOG.md** עם היסטוריה רלוונטית
4. **לנקות** — להסיר מהזיכרון הראשי מה שהועבר לסוכן
5. **לעדכן WORK_LOG.md** הראשי — שורה כללית שמפנה לסוכן

### מה נשאר בראשי
- CLAUDE.md — ארכיטקטורה ו-API (לא זזים)
- WORK_LOG.md — סיכום כללי של כל סשן (כולל שורה על עבודת סוכנים)
- Management/claude-working-guidelines.md — הנחיות עבודה (רלוונטי לכולם)
- Management/project-status.md — סטטוס כללי, בעיות ידועות, מערכות

### מה עובר לסוכן
- פרטים טכניים ספציפיים (build commands, signing keys, API details)
- היסטוריית עבודה ייעודית
- בעיות ידועות בתחום שלו
- רשימת בודקים / אנשי קשר ספציפיים

---

## איך מפעילים סוכן

כש-Chen אומרת משהו כמו "בוא נבנה AAB" או "צריך לתקן באג בפרונט":

1. **לזהות** איזה סוכן רלוונטי
2. **לקרוא** את CONTEXT.md + WORKLOG.md של הסוכן
3. **לקרוא** את CLAUDE.md + WORK_LOG.md (סשן אחרון) + claude-working-guidelines.md
4. **לעבוד** על המשימה
5. **לעדכן** את WORKLOG.md של הסוכן
6. **לעדכן** את WORK_LOG.md הראשי (שורה כללית)

---

## זיכרונות שממתינים להעברה לסוכנים עתידיים

### Conversation Agent
- project_chat_history_menu.md — GPT-style chat list
- project_chat_quality_rag.md — insights RAG injection into chat
- project_agent_context.md — per-user AI context

### Frontend Agent
- project_forwomen_landing.md — /forwomen landing + isWW flag
- project_ux_overhaul_todos.md — fine-tuning questions + future insight types
- project_pool_count_display.md — hide pool count until 100+
- project_account_deletion_overhaul.md — deletion UX redesign

### Backend/Automation Agent
- project_nudge_system.md — welcome/not-started/incomplete nudges
- project_message_nudges.md — unanswered message reminders
- project_rating_nudges.md — rating auto-send + reminders
- project_photo_nudges.md — photo requests + blind match
- project_nudge_next_steps.md — detailed nudge plans
- project_daily_matching.md — 4AM matching cron
- project_admin_pipeline.md — completion + photo analysis pipelines
- project_reanalysis_design.md — qa channel reanalysis
- project_email_system.md — Resend integration
- project_rag_system.md — pgvector knowledge base
- project_photo_match_flow.md — waiting_for_photo flow
- project_pool_gating.md — 6 prerequisites for pool entry

### Matching Algorithm Agent
- project_score_gap.md — category vs trait score gap
- project_style_prompt_work.md — 17 traits pending
- project_expanded_matches.md — expanded_potential_match status
- project_trans_filter_issue.md — filter blocks trans users
- project_freeze_replacement.md — rating lock system
- project_special_attention.md — sensitive user detection

### Security Agent
- project_security_hardening.md — full audit status
- project_dm_fixes.md — auth + error monitoring
- project_staging_log_errors.md — non-critical errors

### User Management Agent
- project_insights_agent_workflow.md — autonomous insights workflow
- project_insights_chat_quality.md — qa_about_me improvement
- project_insights_claude_agent.md — Claude writes insights, not GPT
- project_admin_agents.md — three repeatable admin tasks

### Marketing Agent
- project_instagram_posts.md — HTML carousel builder
- project_marketer_dashboard.md — Sasha's dashboard
- project_lgbtq_launch.md — lesbian community launch
- project_forwomen_landing.md — also relevant here
- project_women_only_pivot.md — WW-only adaptations
