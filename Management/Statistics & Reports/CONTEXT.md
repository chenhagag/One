# Statistics & Reports Agent — Context

## Role
סוכן מומחה לסטטיסטיקות, אנליטיקות ודו"חות עבור One. אחראי על חילוץ נתונים מה-DB, ניתוח מגמות, בניית שאילתות, הפקת דו"חות, ותמיכה בקבלת החלטות מבוססות נתונים.

**תחומי אחריות**:
- חילוץ נתונים ושאילתות SQL מול ה-DB
- ניתוח מגמות (שימור, המרה, engagement, funnel)
- דו"חות אד-הוק (כמה משתמשות, באיזה שלב, מי הגיע לאן)
- מעקב אחר KPIs ומדדי הצלחה
- ניתוח עלויות (tokens, AI calls)
- דו"חות התאמות ומאצ'ינג
- תמיכה בהחלטות מוצריות עם נתונים

**לא כולל**: בניית UI של דשבורדים (סוכן Frontend), כתיבת API routes (סוכן Backend), pipeline automation (סוכן Automation).

---

## Data Sources

### Production Database
- PostgreSQL on Railway (nozomi.proxy.rlwy.net)
- Connection: via `pg` package from `backend/` directory
- **Always use read-only queries** — SELECT only, never UPDATE/DELETE
- SSL required: `ssl: { rejectUnauthorized: false }`

### Key Tables for Analytics

| Table | What It Contains | Key Fields |
|-------|-----------------|------------|
| `users` | All users | id, age, gender, looking_for_gender, my_city, created_at, is_matchable, in_matching_pool, auto_analyzed, analysis_run_count, consent_accepted, profile_complete, entry_point, test_user_type, self_frozen, deleted_at |
| `conversation_messages` | All chat messages | user_id, guide (channel type), role (user/assistant), created_at |
| `user_chat_summaries` | Structured chat summaries | user_id, summary_json, topic_injection_counts |
| `user_traits` | Personality scores | user_id, trait_definition_id, score, confidence, source |
| `user_look_traits` | Appearance traits | user_id, look_trait_definition_id, personal_value, desired_value, source |
| `candidate_matches` | All match candidates | user1_id, user2_id, internal_score, external_score, final_score, status |
| `matches` | Final matches | user1_id, user2_id, status, match_card_sent_at, match_card_data |
| `token_usage` | AI API costs | user_id, action_type, model, total_tokens, estimated_cost_usd, created_at |
| `page_views` | User page visits | user_id, page, viewed_at |
| `notification_log` | All notifications sent | user_id, notification_type, channel, sent_at, whatsapp_handled |
| `system_activity_log` | System events | event_type, event_data, user_id, created_at |
| `analysis_runs` | Analysis debug data | user_id, action_type, created_at |
| `pipeline_jobs` | Pipeline execution log | job_type, status, user_id, created_at, completed_at |
| `bug_reports` | User feedback | user_id, report_text, created_at |
| `user_photos` | Uploaded photos | user_id, filename, is_primary, created_at |
| `direct_messages` | Match DMs | match_id, sender_id, message, created_at, read_at |
| `otp_codes` | Login attempts | email, created_at |

### Guide Values (Chat Channel Types)
| guide | Chat Type |
|-------|-----------|
| `new_chat` | General conversation |
| `new_chat_cognitive` | Cognitive simulation |
| `new_chat_taste` | Taste test |
| `qa_status` | Status questions |
| `qa_search` | Search preferences |
| `qa_system` | System questions |
| `qa_general` | General QA |
| `qa_about_me` | About me / refine |

### User Lifecycle Stages
```
Registration → Profile Setup → Consent → Chat (general) → Chat (cognitive/taste)
  → Auto-analysis → Pool Entry → Matching → Match Card → DM Communication
```

### Match Status Flow
```
candidate_matches: pending_score → scored → potential_match / expanded_potential_match
matches: pre_match → waiting_for_photo → waiting_first_rating → pending_second_rating
  → waiting_second_rating → in_match → cancelled
```

---

## Existing Analytics Infrastructure

### Admin Stats Endpoint (`GET /admin/stats`)
Returns: total_users, users_with_profiles, users_with_traits, total_matches, total_ai_calls, total_tokens, total_cost_usd, avg_tokens_per_user, avg_cost_per_user

### Age Distribution (`GET /admin/age-distribution`)
WW users grouped by age: count, in_pool, matched

### Page Views Analytics (`GET /admin/page-views/stats`)
Global page view stats + per-page detail view

### Sasha Marketing Dashboard (`GET /api/meme-dashboard`)
Users from entry_point='meme': total_registered, started_chat, in_pool, daily signups (30 days)

### Admin Dashboard Structure (Frontend — `AdminView.tsx`)

**Main Tabs** (14 tabs):
overview, users, traits, look_traits, candidates, matches, bugs, card_requests, errors, analytics, email, user_mgmt, outreach, deleted_users, system_log

**Analytics Tab — Sub-Tabs** (5 sub-tabs):
| Sub-Tab | Label | Content |
|---------|-------|---------|
| `page_views` | נתוני כניסה | Page view stats + per-page drill-down |
| `age_dist` | גילאים | WW age distribution chart + table |
| `meme_dash` | דשבורד סאשה | Marketing funnel for entry_point='meme' |
| `survey` | סקר | Beta survey results (9 questions, stats/users/responses views) |
| `survey2` | סקר WW | WW-specific survey (13 questions, same 3 views) |

**Cost Tracking Columns on Users** (visible in admin user details):
- `total_cost_usd` — Total AI cost per user
- `conversation_cost_usd` — Chat-only AI cost
- `analysis_cost_usd` — Analysis-only AI cost

### Additional Admin Endpoints
- `GET /admin/users/:id/token-usage` — Per-user token usage breakdown
- `GET /admin/survey/stats` — Survey aggregate stats (total_eligible, emails_sent, completed, partial, dismissed)
- `GET /admin/survey/responses` — Individual survey responses
- `GET /admin/survey2/stats` — WW survey stats
- `GET /admin/survey2/responses` — WW survey individual responses

### Token Tracking (`tokenTracker.ts`)
Per-user, per-action tracking: model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd

---

## WW-Only Context
Current focus is WW (women seeking women):
- Filter: `gender = 'woman' AND looking_for_gender IS NOT NULL AND looking_for_gender != 'man'`
- `isWW = gender === "woman" && looking_for_gender !== "man"`
- Exclude test users: `email NOT LIKE '%@test.com%'`
- Exclude couples: `test_user_type IS NULL OR test_user_type != 'Couple Tester'`

---

## Common Query Patterns

### User Funnel
```sql
-- Total registered
SELECT COUNT(*) FROM users WHERE gender = 'woman' AND looking_for_gender != 'man';

-- Completed profile
SELECT COUNT(*) FROM users WHERE gender = 'woman' AND looking_for_gender != 'man' AND profile_complete = TRUE;

-- Started chat
SELECT COUNT(DISTINCT user_id) FROM conversation_messages cm
  JOIN users u ON u.id = cm.user_id
  WHERE u.gender = 'woman' AND u.looking_for_gender != 'man' AND cm.guide = 'new_chat';

-- In matching pool
SELECT COUNT(*) FROM users WHERE gender = 'woman' AND looking_for_gender != 'man' AND in_matching_pool = TRUE;

-- Got matched
SELECT COUNT(DISTINCT u.id) FROM users u
  JOIN matches m ON (m.user1_id = u.id OR m.user2_id = u.id)
  WHERE u.gender = 'woman' AND u.looking_for_gender != 'man' AND m.match_card_sent_at IS NOT NULL;
```

### Engagement
```sql
-- Messages per user (average)
SELECT AVG(msg_count) FROM (
  SELECT user_id, COUNT(*) as msg_count FROM conversation_messages
  WHERE role = 'user' GROUP BY user_id
) sub;

-- Channel completion rates
SELECT guide, COUNT(DISTINCT user_id) FROM conversation_messages
  WHERE guide IN ('new_chat', 'new_chat_cognitive', 'new_chat_taste')
  GROUP BY guide;
```

### AI Costs
```sql
-- Total cost
SELECT SUM(estimated_cost_usd) FROM token_usage;

-- Cost per action type
SELECT action_type, COUNT(*) as calls, SUM(estimated_cost_usd) as cost
  FROM token_usage GROUP BY action_type ORDER BY cost DESC;

-- Cost per user (top consumers)
SELECT user_id, SUM(estimated_cost_usd) as cost, COUNT(*) as calls
  FROM token_usage GROUP BY user_id ORDER BY cost DESC LIMIT 20;
```

### Retention
```sql
-- Users who returned after first day
SELECT COUNT(DISTINCT cm1.user_id) FROM conversation_messages cm1
  WHERE EXISTS (
    SELECT 1 FROM conversation_messages cm2
    WHERE cm2.user_id = cm1.user_id
    AND cm2.created_at::date > cm1.created_at::date
  );
```

---

## Running Queries

### From backend directory (local)
```bash
cd backend
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query('SELECT COUNT(*) FROM users').then(r => console.log(r.rows)).finally(() => pool.end());
"
```

### Production DB direct access
Connection string in memory file `reference_prod_db.md` — use for read-only queries only.

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `Management/project-status.md` — current system state, known issues
4. `CLAUDE.md` — DB tables overview, match status flow
5. `backend/src/schema.pg.ts` — authoritative DB schema
6. `backend/src/tokenTracker.ts` — token cost tracking

## Rules
- **SELECT only** — never run UPDATE, DELETE, INSERT on production
- **Exclude test users** — `email NOT LIKE '%@test.com%'` in user queries
- **WW filter** — default to WW users unless asked otherwise
- **Cost awareness** — note estimated_cost_usd when reporting AI usage
- **Privacy** — don't expose individual user data without admin context. Aggregate reports are fine.
- **Verify before reporting** — double-check query results, especially counts that seem off
