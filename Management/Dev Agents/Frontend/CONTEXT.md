# Frontend Dev Agent — Context

## Role
אחראי על כל צד הלקוח: React components, state management, routing, API calls, PWA, ו-UX flows. עבודה לפי הנחיות סוכן Design (שפה עיצובית, צבעים, patterns).

---

## Architecture

### Tech Stack
- **React 18 + Vite** — port 3000 dev, served statically by backend in prod
- **Inline styles only** — no CSS files, no Tailwind, no styled-components
- **No React Router** — state-based view switching in App.tsx
- **RTL** — all Hebrew, direction: rtl
- **Vite proxy** — `/api/*` → localhost:3001 (dev), `/uploads` → localhost:3001 (dev)

### View System
`View` type in App.tsx:
```
"landing" | "register" | "welcome" | "pwa_install" | "new_chat" | "admin" | "auth" |
"auth_callback" | "profile_setup" | "consent" | ...
```

### Admin Access
- URL hash `#admin-secure-access-2026-chen` + logged in as `chen.hagag@gmail.com`
- Production/staging only — localhost unrestricted

---

## Key Components

| File | Lines | Purpose |
|------|-------|---------|
| `App.tsx` | ~1500 | Main router, auth, view state, PWA detection |
| `NewChat.tsx` | ~3000 | Primary user screen: sidebar + chat + sub-screens + recommendations |
| `AdminView.tsx` | ~3000 | Admin panel with all management tabs |
| `AdminPipeline.tsx` | ~800 | Pipeline dashboard, email templates, nudge controls |
| `Insights.tsx` | ~600 | User-facing personality insights with expandable sections |
| `ProfileEdit.tsx` | ~800 | Personal details + photos + preferences |
| `AuthScreen.tsx` | ~300 | Google + Apple OAuth + Magic Link + OTP login |
| `AuthCallback.tsx` | ~200 | OAuth/Magic Link redirect handler |
| `ProfileSetup.tsx` | ~400 | Post-OAuth "נתוני פתיחה" — name, age, city, gender, status |
| `ConsentScreen.tsx` | ~300 | Terms/privacy/AI consent |
| `PWAInstallFlow.tsx` | ~200 | PWA install flow (Android native / iOS Safari guide) |
| `SurveyPage2.tsx` | ~700 | WW user survey |
| `MemeDashboard.tsx` | ~300 | Marketer stats dashboard |
| `lib/supabase.ts` | ~30 | Supabase client init |
| `lib/api.ts` | ~50 | Fetch wrapper with JWT auth |

---

## NewChat (Primary User Interface)

### Structure
- Sidebar (always visible, toggle on mobile) with navigation items
- Main area: chat OR sub-screen (ProfileEdit, Insights, Feedback, Settings, CoupleInsights)
- Mobile header with user avatar for logout
- Home screen with expert recommendations

### Sub-Screens (inside NewChat)
| Screen | Trigger |
|--------|---------|
| ProfileEdit | Sidebar "פרופיל" |
| Insights | Sidebar "תובנות על עצמי" (always resets to main view) |
| Feedback | Sidebar "עזרו לנו להשתפר" — category chips + textarea |
| Settings | Sidebar "הגדרות" — photo consent, email, WhatsApp, delete account |
| CoupleInsights | Sidebar "כרטיס התאמה" (when couple_insights exists) |

### Chat Channels
Each channel has **separate message history** — `Record<string, Message[]>` keyed by channel name.

| Channel | Display Name | Guide Value |
|---------|-------------|-------------|
| היכרות | General | `new_chat` |
| סגנון חשיבה | Cognitive | `new_chat_cognitive` |
| טעם אישי | Taste Test | `new_chat_taste` |
| מה הסטטוס שלי | Status | `qa_status` |
| מה את מחפשת לי | Search | `qa_search` |
| איך המערכת עובדת | System | `qa_system` |
| שאלה על התהליך | General QA | `qa_general` |
| מה למדת עליי | About Me | `qa_about_me` |

### Expert Recommendations (Home Screen)
- **Reloads on every home screen visit** (useEffect on `screen === "home"`)
- Priority: (1) "בוא נמשיך" if chat incomplete, (2) cognitive, (3) taste, (4) all-done message
- Respects `closedChannels` — loaded from API on mount
- All-done: thank message + conditional photo/profile prompt
- Post-close bubbles for incomplete channels

---

## isWW Flag

**Definition**: `gender === "woman" && looking_for_gender !== "man"`

Used in: NewChat, ProfileEdit, Insights, ConsentScreen, MatchCardConsentScreen, MatchCard

**NOT tied to entry point** — applies to ALL WW users regardless of how they signed up.

Effects:
- Feminine text throughout
- Hide gender/height fields in ProfileSetup
- WW demo match card on /forwomen
- `wwRel()` helper (Insights.tsx) converts masculine → feminine Hebrew via regex

### Open items:
- Facebook in-app browser: entry point detection may need testing
- Non-binary gender options for WW
- Insights MBTI descriptions from backend still masculine (overridden in frontend with MBTI_DESCRIPTIONS_F)

---

## Landing Pages

| URL | Entry Point | Description |
|-----|-------------|-------------|
| `/` | forwomen | Default — WW landing, auto woman/woman |
| `/forwomen` | forwomen | Backwards compat |
| `/main` | main | General audience (all fields) |
| `/meme` | meme | Sasha's marketing link |
| `/couples` | couples | Couple testers |

- Logout: WW → forwomen, non-WW → main (via localStorage)
- ProfileSetup WW: no gender/status/height, WhatsApp default on

---

## PWA Support
- `manifest.json` + minimal `sw.js` for installability
- `PWAInstallFlow`: Android native prompt / iOS Safari guide / Desktop welcome
- Standalone mode: auto-skip to main app
- Mobile login also shows PWA install screen

---

## API Integration
- All API calls via `apiFetch()` from `lib/api.ts` — auto-attaches JWT
- **MUST use `/api/` prefix** — Vite proxy routes to backend; without it, requests go to Vite and return HTML
- Key endpoints used by frontend:
  - `POST /api/new-chat/message` — send message, get reply + closingStage
  - `GET /api/new-chat/status/:user_id` — recommendations, closed states, photo count
  - `PATCH /api/users/:id` — update profile fields
  - `GET /api/users/:id/photos` — list photos
  - `POST /api/users/:id/photos` — upload photo

---

## Planned Features

### Chat History Menu (Priority)
Replace "חזרה לשיחה" with GPT/Gemini-style conversation list:
- Show all channels sorted by last update
- Channel name + preview of last message
- `channelMessages` state already has per-channel history
- Need `last_updated` tracking per channel
- Must work in PWA + native Android (Capacitor with server.url)
- Mobile: drawer/panel that slides in, not permanent sidebar

### Pool Count Display
Backend returns `pool_profile_count`, but hidden from UI until critical mass:
- WW: show when 100+ women-seeking-women in pool
- General: show when 100+ per gender
- Filter by `looking_for_gender`, not total count
- AI liveState has total count (fine for AI context)

### Account Deletion UX Overhaul
Current: simple confirm → hard delete. Needed:
- Proper modal/screen (not browser confirm)
- Reason input
- 4 alternatives: freeze account, delete chats only, delete with data retention, permanent delete
- Only permanent gets "are you sure?"
- **Bugs**: display bug (`deleted_by` check), no match deletion logging, unreliable snapshot

### Future Insight Types
- Enneagram + Attachment Style sections in Insights.tsx
- New cards in drip-feed rotation
- Waiting for analysis agent to produce these trait groups

### Fine-Tuning Questions
- Currently: single static question about pets
- Design gap: static bank vs. dynamic (based on low-confidence traits)
- Affects question selection logic + answer storage

---

## Key Patterns

### `has_profile_details`
Requires: age + city + at least 1 photo. WW users don't need height.

### ProfileSetup: Don't Pre-Fill Name
Never pre-fill name from OAuth/email — user must enter their own name.

### Feedback Screen Categories
`🐛 bug | 💡 idea | 💬 general | ⚙️ request` — stored as `[bug]`/`[idea]`/`[general]`/`[request]` prefix in `report_text`

### Consent System
- **General consent** (ConsentScreen): shown after registration, blocks access until accepted
- **Photo upload consent** (modal in ProfileView): on first upload, checkbox for AI analysis
- Gender-adapted Hebrew (תשתפי/תשתף, מאשרת/מאשר)

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `Management/Dev Agents/Design/CONTEXT.md` — brand identity, colors, patterns
4. `CLAUDE.md` — general architecture
5. `Management/claude-working-guidelines.md` — deploy/staging rules
6. `frontend/src/App.tsx` — main router
7. `frontend/src/NewChat.tsx` — primary user interface

## Rules
- **Inline styles only** — no CSS files
- **`/api/` prefix on all fetch calls** — or Vite returns HTML
- **Don't pre-fill name** in ProfileSetup from OAuth
- **isWW drives UI** — check it for all gender-dependent display
- **Sidebar insights click** must always reset to main insights view
- **Refer to Design agent** for colors, fonts, UX patterns
