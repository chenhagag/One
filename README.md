# Matchmaker MVP

A minimal full-stack app: user registers, answers one question, OpenAI generates a personality profile, results saved to SQLite.

---

## Project structure

```
matchmaker/
├── backend/
│   ├── src/
│   │   ├── index.ts      ← Express server + all routes
│   │   ├── db.ts         ← SQLite setup + table creation
│   │   └── openai.ts     ← OpenAI call + types
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx        ← routing between views
    │   ├── Register.tsx   ← step 1: name + email
    │   ├── Chat.tsx       ← step 2: one question
    │   ├── Result.tsx     ← show profile analysis
    │   └── AdminView.tsx  ← list all users + profiles
    ├── index.html
    ├── vite.config.ts
    └── package.json
```

---

## Setup (5 minutes)

### Prerequisites
- Node.js 18+
- An OpenAI API key (https://platform.openai.com/api-keys)

---

### 1. Backend

```bash
cd backend

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run the server (auto-creates matchmaker.db on first run)
npx ts-node src/index.ts
```

Server starts at **http://localhost:3001**

The SQLite database file (`matchmaker.db`) is created automatically in the `backend/` folder on first run. No manual DB setup needed.

---

### 2. Frontend

In a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

App opens at **http://localhost:3000**

The Vite dev server proxies `/api/*` to the backend, so no CORS issues.

---

## How it works

### Flow
1. User fills in name + email → `POST /api/users`
2. User answers one question → `POST /api/analyze` → calls OpenAI → saves to DB
3. Result shown on screen
4. Admin view (`/admin` link in header) → `GET /api/users` → lists all users + profiles

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /users | Create user (name, email) |
| POST | /analyze | Analyze answer (user_id, answer) |
| GET | /users | List all users with profiles |

### Database schema (SQLite)

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE profiles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  raw_answer    TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### OpenAI call

`gpt-4o-mini` is used (fast + cheap). The prompt asks for strict JSON output:

```
{
  "intelligence_score": 7,
  "emotional_depth_score": 8,
  "social_style": "balanced",
  "relationship_goal": "serious"
}
```

---

## Switching to PostgreSQL (optional)

If you want Postgres instead of SQLite:

1. `npm install pg @types/pg` and remove `better-sqlite3`
2. Replace `db.ts` with a `pg.Pool` connection
3. Change `RETURNING *` syntax (already compatible) and `datetime('now')` → `NOW()`
4. Set `DATABASE_URL` in `.env`

For MVP purposes SQLite is simpler and has zero infrastructure requirements.

---

## Troubleshooting

- **"Could not reach the server"** — make sure the backend is running on port 3001
- **"Email already registered"** — use a different email or delete `matchmaker.db` to reset
- **OpenAI errors** — check your API key in `.env` and that you have credits
