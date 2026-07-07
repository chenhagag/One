# One — AI-Powered Matchmaking

One is a matchmaking platform that uses AI conversations to build deep personality profiles, then matches users based on multi-dimensional compatibility scoring. Users chat naturally in Hebrew, the system analyzes 60+ personality traits, and runs a matching algorithm to find compatible partners.

**Live**: [joinone.io](https://joinone.io)

---

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React 18 + Vite
- **Database**: PostgreSQL (Railway)
- **Auth**: Supabase (Google OAuth + OTP)
- **AI**: OpenAI GPT-4o (conversation + analysis), GPT-4o-mini (summarization)
- **Mobile**: PWA + Capacitor (Android native)
- **Deployment**: Railway (auto-deploy from GitHub)
- **Email**: Resend (OTP, admin notifications)

---

## How It Works

1. User signs up and chats with AI across three channels:
   - **General conversation** — 14 micro-topics covering career, relationships, values, personality
   - **Cognitive simulation** — thinking style assessment via scenario questions
   - **Taste test** — reactions to curated profiles to understand attraction patterns

2. After conversation, the system:
   - Summarizes structured data from chat (every 8 messages)
   - Runs personality analysis extracting 60+ traits
   - Computes cognitive profile scores

3. Admin reviews users, scores visual traits from photos, and enters users into matching pool

4. Matching algorithm runs two stages:
   - **Stage 1**: Filter by age, gender, location, cognitive compatibility
   - **Stage 2**: Score using Gaussian similarity across all traits (70% internal + 30% external)

---

## Setup

### Prerequisites
- Node.js 22+
- PostgreSQL database
- OpenAI API key
- Supabase project (for auth)

### Backend
```bash
cd backend
cp .env.example .env   # Add OPENAI_API_KEY, DATABASE_URL, Supabase keys
npm install
npm run dev            # Runs on :3001 (or PORT env)
```

### Frontend
```bash
cd frontend
npm install
npm run dev            # Runs on :3000, proxies /api → :3001
```

### Production Build
```bash
cd frontend && npm run build   # Output in dist/, served by backend
```

---

## Environments

| Environment | Branch | Domain |
|-------------|--------|--------|
| Production | `main` | joinone.io |
| Staging | `staging` | Railway auto-generated |
| Local dev | — | localhost:3000 / :3001 |

---

## Key Directories

```
backend/src/
  index.ts                          — Express server + all API routes
  matchStage1.ts / matchStage2.ts   — Matching algorithm
  agents/conversation/              — Chat system (chatManager, prompts, summarizer)
  agents/analysis/                  — Personality trait analysis
  schema.pg.ts                      — PostgreSQL schema + migrations

frontend/src/
  App.tsx                           — Main router + auth
  NewChat.tsx                       — Primary chat UI + sidebar + home screen
  AdminView.tsx                     — Admin panel
  AuthScreen.tsx                    — Login (Google OAuth + OTP)
  lib/platform.ts                   — Native app detection (Capacitor)
```
