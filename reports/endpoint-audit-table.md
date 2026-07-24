# API Endpoint Audit Table — One Platform
**Date:** 2026-07-20 (post security hardening)

---

## Public Routes (No Auth)

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| GET | /cities | none | no | generalLimiter | city_name, region |
| GET | /enum-options | none | no | generalLimiter | all enum options (category filtered) |
| GET | /privacy | none | no | generalLimiter | static HTML |
| GET | /terms | none | no | generalLimiter | static HTML |
| GET | /health | none | no | generalLimiter | {ok: true} |

## Auth Routes

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| POST | /login | none | no | authLimiter | id, email, first_name, gender |
| POST | /auth/magic-link | none | no | authLimiter | {success: true} |
| POST | /auth/exchange-code | none | no | generalLimiter | access_token, refresh_token |
| POST | /auth/sync | requireAuth | no | generalLimiter | safe fields (id, email, first_name, age, gender, city, profile_complete, consent_accepted, etc.) |
| POST | /auth/send-otp | none | no | authLimiter + otpSendLimiter | {success: true} |
| POST | /auth/verify-otp | none | no | authLimiter | safe fields + access_token. Lockout after 5 failed attempts per email |
| POST | /register | none | no | generalLimiter | full user object |
| POST | /users | none | no | generalLimiter | full user object |

## User Routes

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| GET | /users/:id | requireUserAuth | yes | generalLimiter | 28 explicit safe fields (no admin_notes, devices_seen, etc.) |
| PATCH | /users/:id | requireUserAuth | yes | generalLimiter | updated user object |
| PATCH | /users/:id/guide | requireUserAuth | yes | generalLimiter | {ok: true, selected_guide} |
| POST | /users/:id/photos | requireUserAuth | yes | generalLimiter | filename, url, photo_count |
| GET | /users/:id/photos | requireUserAuth | yes | generalLimiter | photo array (id, filename, url, original_name, created_at) |
| DELETE | /users/:id/photos/:photoId | requireUserAuth | yes | generalLimiter | {deleted: true, photo_count} |
| POST | /users/:id/match-card-consent | requireUserAuth | yes | generalLimiter | {success: true, user} |
| GET | /users/:id/active-match-card | requireUserAuth | yes | exempt | match_card object with partner details |
| GET | /users/:id/direct-messages | requireUserAuth | yes | exempt | messages array, partner_typing, match_id |
| POST | /users/:id/direct-messages | requireUserAuth | yes | exempt | message object |
| POST | /users/:id/typing-status | requireUserAuth | yes | exempt | {ok: true} |
| POST | /users/:id/mark-messages-read | requireUserAuth | yes | exempt | {ok: true} |
| GET | /users/:id/unread-count | requireUserAuth | yes | exempt | unread_count, chat_started |
| POST | /users/:id/unblock-match | requireUserAuth | yes | generalLimiter | {ok: true} |
| POST | /users/:id/report-match | requireUserAuth | yes | generalLimiter | {ok: true, blocked} |
| GET | /users/:id/conversation-history | requireUserAuth | yes | generalLimiter | source, turn_count, messages array |
| DELETE | /users/:id/account | requireUserAuth | yes | generalLimiter | {ok: true}. Deletes photo files from disk |
| GET | /users/:id/dashboard-progress | requireUserAuth | yes | generalLimiter | identity_pct, lab_pct, depth_pct, coverage_pct |
| GET | /users/:id/profile-status | requireUserAuth | yes | generalLimiter | internal/external assessed counts, coverage_pct |
| GET | /users/:id/personal-insights | requireUserAuth | yes | generalLimiter | short, full, analysis_completed |
| GET | /users/:id/couple-insights | requireUserAuth | yes | generalLimiter | couple_insights text |
| GET | /users/:id/matching-progress | requireUserAuth | yes | generalLimiter | total_pool, scanned, status_text |
| GET | /users/:id/detailed-traits | requireUserAuth | yes | generalLimiter | detailed profile via safeOutputLayer |
| POST | /users/:id/fine-tune-answer | requireUserAuth | yes | generalLimiter | {ok: true} |

## Analysis Routes

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| POST | /analyze | requireAuth | yes (JWT→user_id) | aiLimiter | profile, analysis objects |
| POST | /analyze-profile | requireAuth | yes (JWT→user_id) | aiLimiter | saved, analysis output |

## Matching Routes

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| POST | /matches/:id/rate | requireAuth | yes (verifies user in match) | generalLimiter | match_id, new_status, rated_by |
| GET | /matches/pending-rating | requireAuth | yes (resolves from JWT) | generalLimiter | pending, match_id, partner (name/age/city/gender), photos |

## Chat Routes

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| GET | /new-chat/status/:user_id | requireUserAuth | yes | generalLimiter | recommendations, closed channels, photo count |
| POST | /new-chat/message | requireAuth | yes (admin exception) | aiLimiter | reply, closing_stage |

## System Question Routes

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| POST | /system-question/answer | requireAuth | yes (verifies question belongs to user) | generalLimiter | {ok: true} |

## Tracking / Reports

| Method | Path | Auth | Owner Check | Rate Limit | Fields Returned |
|--------|------|------|-------------|------------|-----------------|
| POST | /track-page | optionalAuth | no | generalLimiter | {ok: true} |
| POST | /report-bug | optionalAuth | no | generalLimiter | {success: true, report_id} |
| POST | /log-error | optionalAuth | no | generalLimiter | {ok: true} |

## Admin Routes (all protected by `requireAdmin` middleware)

| Method | Path | Rate Limit | Fields Returned |
|--------|------|------------|-----------------|
| GET | /admin/users | exempt | users array with token costs |
| GET | /admin/users/:id/full | exempt | user + profile + traits + lookTraits + coverage |
| GET | /admin/users/:id/traits | exempt | user_traits with definitions |
| GET | /admin/users/:id/look-traits | exempt | user_look_traits with definitions |
| GET | /admin/users/:id/direct-messages | exempt | messages with sender/partner names |
| GET | /admin/users/:id/full-transcript | exempt | full conversation history |
| GET | /admin/users/:id/analysis-run | exempt | analysis run data |
| GET | /admin/users/:id/analysis-status | exempt | run count, runs, messages since |
| GET | /admin/users/:id/token-usage | exempt | total tokens, cost, by-action breakdown |
| GET | /admin/users/:id/matches | exempt | matches with partner name |
| GET | /admin/users/:id/candidate-matches | exempt | candidates with partner info |
| GET | /admin/users/:id/page-views | exempt | views array, summary |
| GET | /admin/users/:id/system-questions | exempt | system_questions array |
| GET | /admin/users/:id/waiting | exempt | waiting_since, waiting_days |
| GET | /admin/user-profiles | exempt | users with computed profile scores |
| GET | /admin/user-management | exempt | comprehensive user management data |
| GET | /admin/deleted-users | exempt | deleted_users archive |
| GET | /admin/matches | exempt | matches with user names |
| GET | /admin/candidate-matches | exempt | all candidate matches |
| GET | /admin/stats | exempt | system stats (counts, tokens, costs) |
| GET | /admin/trait-definitions | exempt | all trait definitions |
| GET | /admin/look-trait-definitions | exempt | all look trait definitions |
| GET | /admin/enum-options | exempt | enum options |
| GET | /admin/config | exempt | system config |
| GET | /admin/match-ratings/pending | exempt | pending ratings with user names |
| GET | /admin/system-questions/pending | exempt | pending questions with user names |
| GET | /admin/error-logs | exempt | error logs (filtered/limited) |
| GET | /admin/card-requests | exempt | users with match card consent |
| GET | /admin/bug-reports | exempt | bug reports with user info |
| PATCH | /admin/users/:id | exempt | updated user object |
| PATCH | /admin/bug-reports/:id | exempt | updated bug report |
| PUT | /admin/trait-definitions/:id | exempt | {success: true} |
| PUT | /admin/look-trait-definitions/:id | exempt | {success: true} |
| PUT | /admin/users/:id/look-traits | exempt | {saved: count} |
| PUT | /admin/config/:key | exempt | {success: true} |
| POST | /admin/users/:id/inject-conversation | exempt | {inserted: count, channel} |
| POST | /admin/users/:id/freeze | exempt | {frozen: true} |
| POST | /admin/users/:id/unfreeze | exempt | {unfrozen: true} |
| POST | /admin/users/:id/reanalyze | aiLimiter | analysis output |
| POST | /admin/users/:id/cognitive-test | aiLimiter | {output: string} |
| POST | /admin/users/:id/reanalyze-group | aiLimiter | analysis output |
| POST | /admin/users/:id/toggle-matchable | exempt | user_id, is_matchable |
| POST | /admin/users/:id/reset-analysis | exempt | cleared counts |
| POST | /admin/users/:id/system-question | exempt | question row |
| POST | /admin/users/:id/pipeline-action | exempt | {ok: true, updated flags} |
| POST | /admin/users/:id/update-checklist | exempt | {ok: true, admin_checklist} |
| POST | /admin/users/:id/generate-insights | aiLimiter | {ok: true, summaries} |
| POST | /admin/users/:id/send-email | exempt | {success: true, resend_id} |
| POST | /admin/matches/:id/prepare | exempt | {success: true, status: pre_match} |
| POST | /admin/matches/:id/send | exempt | {success: true, status: in_match} |
| POST | /admin/matches/:id/cancel | exempt | {success: true, status: cancelled} |
| POST | /admin/matches/:id/send-for-rating | exempt | {success: true, sent_to} |
| POST | /admin/matches/:id/save-card | exempt | {success: true} |
| POST | /admin/matches/:id/approve-card | exempt | {success: true} |
| POST | /admin/send-pool-emails | exempt | {success: true, sent count} |
| POST | /admin/send-email | exempt | {success: true, resend_id} |
| POST | /admin/run-matching | exempt | stage1, stage2 results |
| POST | /admin/run-matching-expanded | exempt | stage1, stage2 + expanded note |
| POST | /admin/run-matching-force | exempt | stage1, stage2 + force note |
| POST | /admin/run-matchmaking | exempt | matchmaking result |
| POST | /admin/approve-all-ratings | exempt | {approved: count} |
| POST | /admin/reset-matches | exempt | {deleted counts} |
| POST | /admin/system-questions/:id/mark-seen | exempt | {ok: true} |
| POST | /api/users/:id/reset-data | exempt | {reset: true} |
| DELETE | /admin/users/:id | exempt | {deleted: true, counts}. Deletes photo files from disk |
| DELETE | /admin/error-logs | exempt | {ok: true} |
| DELETE | /admin/bug-reports/:id | exempt | {deleted: true} |

---

## Summary

| Category | Total | Auth Required | Owner Check | Rate Limited |
|----------|-------|---------------|-------------|--------------|
| Public | 5 | 0/5 | 0/5 | 5/5 (general) |
| Auth | 8 | 1/8 (sync) | 0/8 | 6/8 (auth+otp limiters) |
| User | 25 | 25/25 | 25/25 | 25/25 |
| Analysis | 2 | 2/2 | 2/2 (IDOR fixed) | 2/2 (ai) |
| Matching | 2 | 2/2 | 2/2 | 2/2 |
| Chat | 2 | 2/2 | 2/2 | 2/2 |
| System Q | 1 | 1/1 | 1/1 (ownership fixed) | 1/1 |
| Tracking | 3 | 0/3 (optional) | 0/3 | 3/3 |
| Admin | 65+ | 65+/65+ (requireAdmin) | N/A (admin) | AI routes only |

### Known Remaining Items
- `POST /register` and `POST /users` return full user object (legacy, low risk — only returns the newly created user's own data)
- `PATCH /users/:id` returns full updated object (could filter to safe fields)
- Admin routes exempt from rate limiting (by design — admin is authenticated)
- `/uploads` static files protected by origin/referer check (not per-user auth)
