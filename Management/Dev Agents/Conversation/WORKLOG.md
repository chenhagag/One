# Conversation Dev Agent — Work Log

## Latest: 2026-10-18 — באגים מסריקת שיחות (Chat Review 15/10)

### 🔴 בעיה 1: סגירת שיחה שבורה — דילוג על closing stages
**חומרה: מערכתית — 4 מתוך 4 שיחות שהגיעו לסגירה**
משתמשות: מיכל (337), לורן (338), ענבר (339), אודיה (343).
כולן דילגו על שלבי closing (Prompt E Insight + Prompt E Final) וקפצו ישר מ"דייקתי?" ל"אנחנו מתחילים לנתח את הפרופיל שלך".
**צריך לבדוק**: האם closing_stage מתעדכן ב-DB? האם המעבר ל-Prompt E מופעל? ייתכן רגרסיה ב-chatManager או ב-promptTemplates.

### 🔴 בעיה 2: פרופילים מומצאים במבחן טעם
**חומרה: מערכתית — 2 מתוך 4 שיחות taste**
- אודיה (343) — הצ'אט המציא פרופילים (יעל כמורה, דנה, מיכל) במקום בנק הפרופילים
- מיכל (337) — פרופיל ראשון מומצא, אח"כ עבר לבנק האמיתי
**צריך לבדוק**: האם קובץ הפרופילים (taste-profiles-female-ff.txt) מוזרק כראוי? ייתכן בעיית אורך prompt או שהפרופילים נחתכים.

דו"ח מלא: `reports/chat-review-2026-10.md`

---

## 2026-10-03 — Agent Created
- Conversation agent created, split from Backend + Frontend agents
- Covers: chatManager, microTopics, promptTemplates, summarizer, autoAnalysis, prompt files, agent context, RAG injection, NewChat.tsx, chat channels, recommendations, closing flow
- All conversation-specific documentation consolidated here

---

## History

### 2026-09-30 — Onboarding Redesign (Frontend side)
- ProfileSetup, ConsentScreen, CoupleWelcome — unified frosted glass design
- Push notifications note in Settings
- DB defaults: marital_status/has_children/smoker start as NULL
- Duplicate insight card fix for non-pool users

### 2026-09-25 — WW-Only Pivot (Chat adaptations)
- isWW flag affects chat text, recommendations, channel descriptions
- wwRel() helper for masculine → feminine Hebrew conversion
- ProfileSetup WW: no gender/status/height fields

### 2026-09-22 — RAG Insights Hybrid (Staging)
- Direct insights injection for personal QA channels (qa_about_me, qa_search, etc.)
- RAG-only for technical channels (qa_system, qa_general)
- Auto-upsert insight chunks on write
- Daily reconciliation + startup backfill
- Scaling issue: no LIMIT on reconciliation — needs fix before launch

### 2026-09-22 — Couple Tester Flow
- COUPLE_TESTER_INSTRUCTION injected in chat when test_user_type === "Couple Tester"
- Adapts questions for people in relationships

### 2026-08-31 — RAG System Integration
- Chat now receives RAG context (system + user chunks + live state)
- Threshold 0.30 for Hebrew embeddings
- Agent context system: per-user + 4 system config keys

### 2026-08 — Match Card + DM in Chat UI
- CoupleInsights sub-screen in NewChat sidebar
- Celebration banner on match card sent

### 2026-06 — NewChat as Primary Screen
- Replaced old chat with NewChat.tsx (sidebar + chat + sub-screens)
- Expert recommendations on home screen
- Drip-feed insight cards
- Post-close bubbles for incomplete channels
- Fine-tuning questions (partial — single static question)

### Prompt Safety Incidents (Historical)
- User was referred to Tinder/Bumble by AI → SYSTEM_IDENTITY constant added to all templates
- AI called taste test profiles "not real people" → wording rules established
- Fire-and-forget saveConversationState → lost closing stages → fixed to await
- Prompt fix broke message counting → established "staging first" rule
