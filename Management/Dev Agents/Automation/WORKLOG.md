# Automation Dev Agent — Work Log

## Latest: 2026-10-03 — Agent Created
- Consolidated all automation knowledge from memory + WORK_LOG into agent context
- Systems documented: jobRunner, completion pipeline, photo analysis, daily matching, 4 nudge systems, reanalysis, RAG, rating lock, email

---

## History

### 2026-09-20 — Message Nudges + Rating Nudges Deployed
- messageNudges.ts: reminders for unanswered system_questions and admin_messages
- ratingNudges.ts: auto-send to second side + reminders
- Match-linked questions: match_id on system_questions, auto waiting_for_response
- Custom options on system_questions (JSONB column)
- Deployed to production

### 2026-09-19 — Photo Nudges + Photo Match Promotion Deployed
- photoNudges.ts: 4-step per-user flow + blind match question
- photoMatchPromotion.ts: auto waiting_for_photo + promotion
- Default photo AI consent on first upload
- Deployed to production

### 2026-09-18–19 — Reanalysis System
- reanalysisScan.ts: qa_about_me (5-8 msgs → MBTI, 8+ → full) + qa_refine (3-8 → general, 8+ → full)
- last_analysis_at column + backfill migration
- Known issue: global timestamp hides unprocessed messages from other groups

### 2026-09-17 — User Nudges Deployed
- userNudges.ts: welcome/not-started/incomplete nudges
- 3-day minimum gap, 20h global cooldown
- WW-only filtering, couple/test exclusions
- Copy approved by Chen — no "חסרה לנו" language
- Deployed to production

### 2026-09-22 — RAG Insights (Staging)
- Hybrid insights injection: direct for personal channels, RAG for technical
- Auto-upsert insight chunks when insights written
- Reconciliation daily + backfill on deploy
- ⚠️ Scaling issue: no LIMIT on reconciliation — needs fix before launch

### 2026-08-31 — RAG System Deployed
- pgvector knowledge base, 53 system chunks
- Live state via getAgentSafeLiveState()
- Threshold 0.30 for Hebrew embeddings
- Deployed to production

### 2026-09-27 — Rating Lock (Replaced Freeze)
- Freeze system fully removed
- Lock derived from match statuses
- pending_second_rating new status
- Auto-promote on positive rating
- 82 matches released staging, 85 production

### 2026-07-21 — Completion Pipeline + Photo Analysis
- jobRunner (2-min polling) + completionPipeline (insights → pool → welcome email)
- photoAnalysis (GPT-4o Vision → 11 traits)
- Pipeline jobs table with retry + backoff
- Deployed to staging, then production
