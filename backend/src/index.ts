import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import multer from "multer";
import db from "./db";
import {
  initDb as initPgDb,
  syncConfigFromSqlite,
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
  withTransaction,
} from "./db.pg";
import { analyzeAnswer } from "./openai";
import { runStage1 } from "./matchStage1";
import { runStage2, runMatchmaking } from "./matchStage2";
import { runAnalysisAgent, buildAnalysisInput, saveAnalysisToDb, saveAnalysisRun, getLatestAnalysisRun } from "./agents/analysis";
import { generateOpeningMessage, processUserMessage, computeCoverage, buildAnalysisTranscript, type ConversationState } from "./agents/conversation";
import { generatePsychologistOpening, processPsychologistMessage, type PsychologistState } from "./agents/conversation";

dotenv.config();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ── /api prefix rewrite ─────────────────────────────────────────
// In dev, Vite's proxy strips "/api" before forwarding to the backend.
// In production (single server, no proxy), the frontend still calls
// "/api/register", "/api/users/:id", etc. This middleware strips the
// prefix so the existing routes (registered as "/register", "/users/:id")
// continue to match.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/")) {
    req.url = req.url.replace(/^\/api/, "");
  }
  next();
});

// ── Serve frontend static build ──────────────────────────────────
const frontendDist = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

// ════════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════════

// POST /login — Simple email-based login (no password)
app.post("/login", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  try {
    const user = await pgQueryOne<any>(
      "SELECT * FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    if (!user) return res.status(404).json({ error: "Email not found" });
    return res.json(user);
  } catch (err: any) {
    console.error("[login]", err.message);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ════════════════════════════════════════════════════════════════
// REGISTRATION
// ════════════════════════════════════════════════════════════════

// POST /register — Full registration (replaces old POST /users)
app.post("/register", async (req, res) => {
  const {
    first_name, email, age, gender, looking_for_gender,
    city, height, self_style,
    desired_age_min, desired_age_max, age_flexibility,
    desired_height_min, desired_height_max, height_flexibility,
    desired_location_range, test_user_type,
  } = req.body;

  if (!first_name || !email) {
    return res.status(400).json({ error: "first_name and email are required" });
  }

  try {
    // Pg-only INSERT — pg is now sole source of truth for users.
    const user = await pgQueryOne<any>(
      `INSERT INTO users (
         first_name, email, age, gender, looking_for_gender,
         city, height, self_style,
         desired_age_min, desired_age_max, age_flexibility,
         desired_height_min, desired_height_max, height_flexibility,
         desired_location_range, test_user_type
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        first_name.trim(),
        email.trim().toLowerCase(),
        age || null,
        gender || null,
        looking_for_gender || null,
        city || null,
        height || null,
        self_style ? JSON.stringify(self_style) : null,
        desired_age_min || null,
        desired_age_max || null,
        age_flexibility || "slightly_flexible",
        desired_height_min || null,
        desired_height_max || null,
        height_flexibility || "slightly_flexible",
        desired_location_range || "my_area",
        test_user_type || null,
      ]
    );

    return res.status(201).json(user);
  } catch (err: any) {
    if (err.message?.includes("duplicate key") || err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to register user" });
  }
});

// PATCH /users/:id/guide — Save selected conversation guide
app.patch("/users/:id/guide", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { selected_guide } = req.body;
  const valid = ["psychologist", "coach", "spiritual_mentor"];
  if (!valid.includes(selected_guide)) {
    return res.status(400).json({ error: `selected_guide must be one of: ${valid.join(", ")}` });
  }
  await pgQueryAll(
    "UPDATE users SET selected_guide = $1, updated_at = NOW() WHERE id = $2",
    [selected_guide, userId]
  );
  return res.json({ ok: true, selected_guide });
});

// GET /users/:id — Get user profile (reads from pg)
app.get("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });
  // pg returns JSONB already-parsed, so no JSON.parse needed on self_style.
  return res.json(user);
});

// PATCH /users/:id — Update user profile fields
app.patch("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const {
    first_name, age, gender, looking_for_gender, city, height, self_style,
    desired_age_min, desired_age_max, age_flexibility,
    desired_height_min, desired_height_max, height_flexibility,
    desired_location_range,
  } = req.body;
  // Build pg UPDATE with dynamic $N placeholders
  const assignments: string[] = [];
  const values: any[] = [];
  let p = 1;
  const push = (col: string, val: any) => {
    assignments.push(`${col} = $${p++}`);
    values.push(val);
  };

  if (first_name !== undefined)             push("first_name", first_name);
  if (age !== undefined)                    push("age", age);
  if (gender !== undefined)                 push("gender", gender);
  if (looking_for_gender !== undefined)     push("looking_for_gender", looking_for_gender);
  if (city !== undefined)                   push("city", city);
  if (height !== undefined)                 push("height", height);
  if (self_style !== undefined) {
    // JSONB column — pass as JSON string with ::jsonb cast
    assignments.push(`self_style = $${p++}::jsonb`);
    values.push(self_style ? JSON.stringify(self_style) : null);
  }
  if (desired_age_min !== undefined)        push("desired_age_min", desired_age_min);
  if (desired_age_max !== undefined)        push("desired_age_max", desired_age_max);
  if (age_flexibility !== undefined)        push("age_flexibility", age_flexibility);
  if (desired_height_min !== undefined)     push("desired_height_min", desired_height_min);
  if (desired_height_max !== undefined)     push("desired_height_max", desired_height_max);
  if (height_flexibility !== undefined)     push("height_flexibility", height_flexibility);
  if (desired_location_range !== undefined) push("desired_location_range", desired_location_range);

  if (assignments.length === 0) return res.status(400).json({ error: "No fields to update" });

  assignments.push("updated_at = NOW()");
  values.push(userId);

  const updated = await pgQueryOne<any>(
    `UPDATE users SET ${assignments.join(", ")} WHERE id = $${p} RETURNING *`,
    values
  );
  return res.json(updated);
});

// Keep old POST /users for backward compatibility
app.post("/users", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }
  try {
    const user = await pgQueryOne<any>(
      "INSERT INTO users (first_name, email) VALUES ($1, $2) RETURNING *",
      [name.trim(), email.trim().toLowerCase()]
    );
    return res.status(201).json(user);
  } catch (err: any) {
    if (err.code === "23505" || err.message?.includes("duplicate key")) {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to create user" });
  }
});

// ════════════════════════════════════════════════════════════════
// LEGACY AI CHAT — kept for backward compatibility only.
// The frontend now uses POST /analyze-profile instead.
// This endpoint uses the old 4-field analysis (openai.ts analyzeAnswer).
// It does NOT update user_traits or user_look_traits.
// ════════════════════════════════════════════════════════════════

app.post("/analyze", async (req, res) => {
  const { user_id, answer } = req.body;

  if (!user_id || !answer) {
    return res.status(400).json({ error: "user_id and answer are required" });
  }

  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [user_id]);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  try {
    const analysis = await analyzeAnswer(answer);
    const profile = await pgQueryOne<any>(
      `INSERT INTO profiles (user_id, raw_answer, analysis_json)
       VALUES ($1, $2, $3::jsonb) RETURNING *`,
      [user_id, answer, JSON.stringify(analysis)]
    );
    return res.status(201).json({ profile, analysis });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PHOTO UPLOAD
// ════════════════════════════════════════════════════════════════

const uploadsDir = path.join(__dirname, "../../uploads");
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${unique}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

// Serve uploaded files statically
app.use("/uploads", express.static(uploadsDir));

// POST /users/:id/photos — Upload a photo
app.post("/users/:id/photos", upload.single("photo"), async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const user = await pgQueryOne<any>("SELECT id FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  await pgQueryAll(
    "INSERT INTO user_photos (user_id, filename, original_name, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5)",
    [userId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]
  );

  const countRow = await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM user_photos WHERE user_id = $1", [userId]
  );

  return res.json({
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    photo_count: Number(countRow?.c ?? 0),
  });
});

// GET /users/:id/photos — List user's photos
app.get("/users/:id/photos", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const photos = await pgQueryAll<any>(
    "SELECT id, filename, original_name, created_at FROM user_photos WHERE user_id = $1 ORDER BY created_at ASC",
    [userId]
  );

  return res.json({
    photos: photos.map(p => ({
      id: p.id,
      filename: p.filename,
      url: `/uploads/${p.filename}`,
      original_name: p.original_name,
      created_at: p.created_at,
    })),
    count: photos.length,
  });
});

// DELETE /users/:id/photos/:photoId — Delete a specific photo
app.delete("/users/:id/photos/:photoId", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const photoId = parseInt(req.params.photoId, 10);

  const photo = await pgQueryOne<any>(
    "SELECT id, filename FROM user_photos WHERE id = $1 AND user_id = $2",
    [photoId, userId]
  );
  if (!photo) return res.status(404).json({ error: "Photo not found" });

  await pgQueryAll("DELETE FROM user_photos WHERE id = $1", [photoId]);

  // Try to delete file from disk (non-critical if it fails)
  try { require("fs").unlinkSync(path.join(uploadsDir, photo.filename)); } catch {}

  const countRow = await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM user_photos WHERE user_id = $1", [userId]
  );
  return res.json({ deleted: true, photo_count: Number(countRow?.c ?? 0) });
});

// ════════════════════════════════════════════════════════════════
// MULTI-TURN CONVERSATION — Orchestrated chat flow
// ════════════════════════════════════════════════════════════════

// In-memory conversation state (per user).
const conversationStates = new Map<number, ConversationState>();

function parseUserId(raw: any): number | null {
  const id = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// POST /conversation/start — Begin or resume a conversation
app.post("/conversation/start", async (req, res) => {
  const userId = parseUserId(req.body.user_id);
  if (!userId) return res.status(400).json({ error: "Valid user_id required" });

  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { message, state, isReturning } = await generateOpeningMessage(db, userId);
  conversationStates.set(userId, state);
  const cov = isReturning ? await computeCoverage(db, userId) : { coverage_pct: 0 } as any;
  console.log(`[conversation] ${isReturning ? "Returning" : "Started"} for user ${userId}, turns=${state.turn_count}`);
  return res.json({
    assistant_message: message,
    phase: "chatting",
    coverage_pct: isReturning ? cov.coverage_pct : 0,
    turn_count: state.turn_count,
    resumed: isReturning,
    turns: state.turns,
  });
});

// POST /conversation/message — Send a user message and get assistant response
app.post("/conversation/message", async (req, res) => {
  const userId = parseUserId(req.body.user_id);
  const message = req.body.message;
  if (!userId || !message) return res.status(400).json({ error: "user_id and message required" });

  let state = conversationStates.get(userId);

  // If no state exists (server restart) or state was paused,
  // rebuild it from DB — sending a message implicitly resumes the conversation.
  if (!state || state.phase === "paused") {
    const { state: freshState } = await generateOpeningMessage(db, userId);
    state = freshState;
    conversationStates.set(userId, state);
  }

  if (state.phase === "confirmed") {
    return res.status(400).json({ error: "Conversation already confirmed. Navigate to results." });
  }

  try {
    const { result, state: newState } = await processUserMessage(db, state, message);
    conversationStates.set(userId, newState);
    console.log(`[conversation] User ${userId} turn ${result.turn_count}: phase=${result.phase}, coverage=${result.coverage_pct}%`);
    return res.json(result);
  } catch (err: any) {
    console.error(`[conversation] Message error for user ${userId}:`, err);
    return res.status(500).json({ error: "Conversation failed: " + err.message });
  }
});

// POST /conversation/pause — Save state and pause the conversation
// Also triggers analysis so trait scores are saved
app.post("/conversation/pause", async (req, res) => {
  const userId = parseUserId(req.body.user_id);
  if (!userId) return res.status(400).json({ error: "Valid user_id required" });

  // Update in-memory state if it exists (may not exist after server restart)
  const state = conversationStates.get(userId);
  if (state && state.phase !== "confirmed") {
    (state as any)._phase_before_pause = state.phase;
    state.phase = "paused";
    conversationStates.set(userId, state);
  }

  // Count user messages directly from pg
  const userMsgCount = Number((await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM conversation_messages WHERE user_id = $1 AND role = 'user'",
    [userId]
  ))?.c ?? 0);

  console.log(`[conversation] Paused for user ${userId} (${userMsgCount} user messages in DB)`);

  // Fire analysis in background — do NOT block the pause response
  if (userMsgCount >= 3) {
    console.log(`[conversation] Triggering background analysis for user ${userId} on pause...`);
    const transcript = await buildAnalysisTranscript(db, userId);
    (async () => {
      try {
        const input = await buildAnalysisInput(db, transcript);
        const output = await runAnalysisAgent(input, userId, "analysis_pause");
        const runData = (output as any)._run_data;
        if (runData) {
          await saveAnalysisRun(db, userId, runData.generated_prompt, runData.stage_a_output, JSON.stringify(runData.stage_b_output), "analysis_pause");
        }
        delete (output as any)._run_data;
        const saved = await saveAnalysisToDb(db, userId, output);
        console.log(`[conversation] Pause analysis DONE for user ${userId}: ${saved.internal_saved} internal, ${saved.external_saved} external`);

        // Recompute readiness NOW that traits are saved — this sets is_matchable
        const covAfter = await computeCoverage(db, userId);
        await pgQueryAll(
          "UPDATE users SET readiness_score = $1, is_matchable = $2, updated_at = NOW() WHERE id = $3",
          [covAfter.readiness_score, covAfter.ready_for_matching, userId]
        );
        console.log(`[conversation] Readiness updated for user ${userId}: score=${covAfter.readiness_score}, matchable=${covAfter.ready_for_matching}`);
      } catch (err: any) {
        console.error(`[conversation] Pause analysis FAILED for user ${userId}:`, err.message);
      }
    })();
  }

  const cov = await computeCoverage(db, userId);
  return res.json({
    phase: "paused",
    analysis_ran: false, // analysis runs in background
    turn_count: userMsgCount,
    coverage_pct: cov.coverage_pct,
  });
});

// POST /conversation/analyze — Explicitly trigger analysis for a user
app.post("/conversation/analyze", async (req, res) => {
  const userId = parseUserId(req.body.user_id);
  if (!userId) return res.status(400).json({ error: "Valid user_id required" });

  const userMsgCount = Number((await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM conversation_messages WHERE user_id = $1 AND role = 'user'",
    [userId]
  ))?.c ?? 0);

  if (userMsgCount < 3) {
    return res.json({ analysis_ran: false, reason: "not_enough_messages", user_messages: userMsgCount });
  }

  try {
    console.log(`[analyze] Explicit analysis for user ${userId} (${userMsgCount} messages)...`);
    const transcript = await buildAnalysisTranscript(db, userId);
    const input = await buildAnalysisInput(db, transcript);
    const output = await runAnalysisAgent(input, userId, "analysis_explicit");
    const runData = (output as any)._run_data;
    if (runData) {
      await saveAnalysisRun(db, userId, runData.generated_prompt, runData.stage_a_output, JSON.stringify(runData.stage_b_output), "analysis_explicit");
    }
    delete (output as any)._run_data;
    const saved = await saveAnalysisToDb(db, userId, output);

    // Recompute readiness now that traits are saved — sets is_matchable
    const cov = await computeCoverage(db, userId);
    await pgQueryAll(
      "UPDATE users SET readiness_score = $1, is_matchable = $2, updated_at = NOW() WHERE id = $3",
      [cov.readiness_score, cov.ready_for_matching, userId]
    );

    console.log(`[analyze] DONE for user ${userId}: ${saved.internal_saved} internal, ${saved.external_saved} external, matchable=${cov.ready_for_matching}`);
    return res.json({ analysis_ran: true, saved, traits_count: output.internal_traits?.length });
  } catch (err: any) {
    console.error(`[analyze] FAILED for user ${userId}:`, err.message);
    return res.status(500).json({ analysis_ran: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// PSYCHOLOGIST CHAT — managed by psychologist-orchestrator
// ════════════════════════════════════════════════════════════════

const psychologistStates = new Map<number, PsychologistState>();

// POST /psychologist/start — Start or resume the psychologist chat
app.post("/psychologist/start", async (req, res) => {
  const userId = parseUserId(req.body.user_id);
  if (!userId) return res.status(400).json({ error: "Valid user_id required" });

  const { message, state, isReturning } = await generatePsychologistOpening(db, userId);
  psychologistStates.set(userId, state);

  console.log(`[psychologist] ${isReturning ? "Resuming" : "Starting"} for user ${userId}, turns=${state.turn_count}`);

  return res.json({
    messages: state.turns.map(t => ({ role: t.role, content: t.content })),
    is_returning: isReturning,
  });
});

// POST /psychologist/message — Send a message in the psychologist chat
app.post("/psychologist/message", async (req, res) => {
  const userId = parseUserId(req.body.user_id);
  const message = req.body.message;
  if (!userId || !message) return res.status(400).json({ error: "user_id and message required" });

  let state = psychologistStates.get(userId);
  if (!state) {
    // Reconstruct state if missing (server restart)
    const { state: newState } = await generatePsychologistOpening(db, userId);
    state = newState;
    psychologistStates.set(userId, state);
  }

  try {
    const { result, state: newState } = await processPsychologistMessage(db, state, message);
    psychologistStates.set(userId, newState);
    return res.json(result);
  } catch (err: any) {
    console.error(`[psychologist] Error for user ${userId}:`, err.message);
    return res.status(500).json({ error: "Psychologist chat failed: " + err.message });
  }
});

// GET /conversation/state/:id — Current conversation state
app.get("/conversation/state/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const state = conversationStates.get(userId);
  if (!state) return res.status(404).json({ error: "No active conversation" });

  const cov = await computeCoverage(db, userId);
  return res.json({
    user_id: state.user_id,
    turn_count: state.turn_count,
    phase: state.phase,
    last_analysis_at_turn: state.last_analysis_at_turn,
    coverage_pct: cov.coverage_pct,
    turns: state.turns,
  });
});

// GET /admin/users/:id/full-transcript — Full conversation history (both roles)
app.get("/admin/users/:id/full-transcript", async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  // Primary: read from conversation_messages (persisted, both roles) — include guide field
  const dbMessages = await pgQueryAll<{ role: string; content: string; created_at: string; guide: string | null }>(
    "SELECT role, content, created_at, guide FROM conversation_messages WHERE user_id = $1 ORDER BY created_at ASC, id ASC",
    [userId]
  );

  if (dbMessages.length > 0) {
    return res.json({
      source: "db",
      turn_count: dbMessages.filter(m => m.role === "user").length,
      messages: dbMessages.map((m, i) => ({
        index: i,
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
        chat_type: m.guide === "psychologist" ? "psychologist" : "interviewer",
      })),
    });
  }

  // Fallback: in-memory state (for conversations started before this change)
  const state = conversationStates.get(userId);
  if (state && state.turns.length > 0) {
    return res.json({
      source: "memory",
      turn_count: state.turn_count,
      messages: state.turns.map((t, i) => ({
        index: i,
        role: t.role,
        content: t.content,
      })),
    });
  }

  // Last fallback: profiles table (user messages only)
  const profiles = await pgQueryAll<{ raw_answer: string; created_at: string }>(
    "SELECT raw_answer, created_at FROM profiles WHERE user_id = $1 ORDER BY created_at ASC",
    [userId]
  );

  if (profiles.length === 0) {
    return res.json({ source: "none", turn_count: 0, messages: [] });
  }

  const messages = profiles.map((p, i) => ({
    index: i,
    role: "user" as const,
    content: p.raw_answer,
    timestamp: p.created_at,
  }));

  return res.json({
    source: "db",
    turn_count: profiles.length,
    note: "Only user messages available (assistant messages are not persisted to DB).",
    messages,
  });
});

// ════════════════════════════════════════════════════════════════
// PROFILE ANALYSIS — Trait extraction from conversation
// ════════════════════════════════════════════════════════════════

// POST /analyze-profile — Submit a conversation answer and run trait analysis
// Stores the answer, builds cumulative transcript, runs analysis agent, saves traits.
// Incremental: each call adds to the user's profile, null values don't overwrite existing data.
app.post("/analyze-profile", async (req, res) => {
  const { user_id: rawUserId, answer } = req.body;

  if (!rawUserId || !answer) {
    return res.status(400).json({ error: "user_id and answer are required" });
  }

  // Ensure user_id is always an integer — req.body may pass string or number
  const user_id = typeof rawUserId === "string" ? parseInt(rawUserId, 10) : Number(rawUserId);
  if (!Number.isFinite(user_id) || user_id <= 0) {
    return res.status(400).json({ error: `Invalid user_id: ${rawUserId} (type: ${typeof rawUserId})` });
  }

  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [user_id]);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  console.log(`[analyze-profile] Start: user_id=${user_id} (original: ${typeof rawUserId} ${rawUserId})`);

  try {
    // 1. Store the raw answer (pg)
    await pgQueryAll(
      "INSERT INTO profiles (user_id, raw_answer, analysis_json) VALUES ($1, $2, '{}'::jsonb)",
      [user_id, answer]
    );

    // 2. Build cumulative transcript from all answers
    const allAnswers = await pgQueryAll<{ raw_answer: string; created_at: string }>(
      "SELECT raw_answer, created_at FROM profiles WHERE user_id = $1 ORDER BY created_at ASC",
      [user_id]
    );

    const transcript = allAnswers
      .map((a, i) => `[Round ${i + 1}]\nUser: ${a.raw_answer}`)
      .join("\n\n");

    // 3. Run analysis agent
    const input = await buildAnalysisInput(db, transcript);
    console.log(`[analyze-profile] User ${user_id}: ${allAnswers.length} answers, ${input.internal_trait_definitions.length} internal + ${input.external_trait_definitions.length} external trait defs`);

    const output = await runAnalysisAgent(input, user_id, "analysis");
    delete (output as any)._run_data; // strip before serialization

    console.log(`[analyze-profile] Agent returned ${output.internal_traits.length} internal, ${output.external_traits.length} external traits for user ${user_id}`);

    // 4. Save traits to DB (COALESCE preserves existing non-null values)
    const saved = await saveAnalysisToDb(db, user_id, output);

    // Recompute readiness — sets is_matchable
    const cov = await computeCoverage(db, user_id);
    await pgQueryAll(
      "UPDATE users SET readiness_score = $1, is_matchable = $2, updated_at = NOW() WHERE id = $3",
      [cov.readiness_score, cov.ready_for_matching, user_id]
    );

    console.log(`[analyze-profile] User ${user_id}: saved ${saved.internal_saved} internal, ${saved.external_saved} external traits, matchable=${cov.ready_for_matching}`);

    // 5. Update the latest profile record with analysis JSON (pg)
    const latest = await pgQueryOne<{ id: number }>(
      "SELECT MAX(id) as id FROM profiles WHERE user_id = $1",
      [user_id]
    );
    if (latest?.id) {
      await pgQueryAll(
        "UPDATE profiles SET analysis_json = $1::jsonb WHERE id = $2",
        [JSON.stringify(output), latest.id]
      );
    }

    return res.status(200).json({
      saved,
      analysis: output,
    });
  } catch (err: any) {
    console.error(`[analyze-profile] Error for user ${user_id}:`, err);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
});

// GET /users/:id/dashboard-progress — All progress data for the dashboard
app.get("/users/:id/dashboard-progress", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Identity: count filled profile fields
  const profileFields = ["first_name", "email", "age", "gender", "looking_for_gender", "city", "height",
    "desired_age_min", "desired_age_max", "desired_height_min", "desired_height_max"];
  const filled = profileFields.filter(f => user[f] != null && user[f] !== "").length;
  const identity_pct = Math.round((filled / profileFields.length) * 100);

  // Lab: progress = user turns out of 12 (max questions) — from pg
  const labTurns = Number((await pgQueryOne<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM conversation_messages
     WHERE user_id = $1 AND role = 'user' AND (guide IS NULL OR guide != 'psychologist')`,
    [userId]
  ))?.c ?? 0);
  const lab_pct = Math.min(100, Math.round((labTurns / 12) * 100));

  const depthTurns = Number((await pgQueryOne<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM conversation_messages
     WHERE user_id = $1 AND role = 'user' AND guide = 'psychologist'`,
    [userId]
  ))?.c ?? 0);

  // Trait coverage (in pg)
  const assessed = Number(
    (await pgQueryOne<{ c: string }>(
      "SELECT COUNT(*)::int AS c FROM user_traits WHERE user_id = $1 AND score IS NOT NULL",
      [userId]
    ))?.c ?? 0
  );
  const total = Number(
    (await pgQueryOne<{ c: string }>(
      "SELECT COUNT(*)::int AS c FROM trait_definitions WHERE is_active = TRUE"
    ))?.c ?? 0
  );
  const coverage_pct = total > 0 ? Math.round((assessed / total) * 100) : 0;

  // Deep chat progress: turns / 20 (needs 20 user messages to complete)
  const depth_pct = Math.min(100, Math.round((depthTurns / 20) * 100));

  return res.json({
    identity_pct,
    lab_pct,
    depth_pct,
    coverage_pct,
  });
});

// GET /users/:id/profile-status — Get current trait coverage and readiness (from pg)
app.get("/users/:id/profile-status", async (req, res) => {
  const userId = parseInt(req.params.id);

  const internalCount = Number((await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM user_traits WHERE user_id = $1 AND score IS NOT NULL",
    [userId]
  ))?.c ?? 0);

  const internalTotal = Number((await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM trait_definitions WHERE is_active = TRUE"
  ))?.c ?? 0);

  const externalCount = Number((await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM user_look_traits WHERE user_id = $1 AND personal_value IS NOT NULL",
    [userId]
  ))?.c ?? 0);

  const externalTotal = Number((await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM look_trait_definitions WHERE is_active = TRUE"
  ))?.c ?? 0);

  const total = internalTotal + externalTotal;
  const assessed = internalCount + externalCount;
  const coverage_pct = total > 0 ? Math.round((assessed / total) * 100) : 0;

  const answerCount = Number((await pgQueryOne<{ c: string }>(
    "SELECT COUNT(*)::int AS c FROM profiles WHERE user_id = $1",
    [userId]
  ))?.c ?? 0);

  return res.json({
    internal_assessed: internalCount,
    internal_total: internalTotal,
    external_assessed: externalCount,
    external_total: externalTotal,
    coverage_pct,
    ready_for_matching: coverage_pct >= 60,
    total_answers: answerCount,
  });
});

// ════════════════════════════════════════════════════════════════
// ADMIN — Data exploration endpoints
// ════════════════════════════════════════════════════════════════

// POST /admin/users/:id/freeze — Freeze/suspend a user
app.post("/admin/users/:id/freeze", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await pgQueryOne<any>("SELECT id, user_status FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.user_status === "frozen") {
    return res.status(400).json({ error: "User is already frozen" });
  }

  await pgQueryAll(
    "UPDATE users SET user_status = 'frozen', updated_at = NOW() WHERE id = $1",
    [userId]
  );
  console.log(`[admin] Froze user ${userId}`);
  return res.json({ frozen: true, user_id: userId });
});

// POST /admin/users/:id/unfreeze — Unfreeze a user
app.post("/admin/users/:id/unfreeze", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await pgQueryOne<any>("SELECT id, user_status FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.user_status !== "frozen") {
    return res.status(400).json({ error: "User is not frozen" });
  }

  await pgQueryAll(
    "UPDATE users SET user_status = 'waiting_match', updated_at = NOW() WHERE id = $1",
    [userId]
  );
  console.log(`[admin] Unfroze user ${userId}`);
  return res.json({ unfrozen: true, user_id: userId });
});

// DELETE /admin/users/:id — Permanently delete a user and all related data
app.delete("/admin/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user_id" });
  }

  const user = await pgQueryOne<any>("SELECT id, first_name, email FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Delete from pg (order matters due to FKs)
  const result = {
    profiles: 0, messages: 0, traits: 0, lookTraits: 0, analysisRuns: 0,
    matchScores: 0, matches: 0, candidates: 0,
  };
  result.profiles     = (await pgQueryAll("DELETE FROM profiles WHERE user_id = $1", [userId])).length;
  result.messages     = (await pgQueryAll("DELETE FROM conversation_messages WHERE user_id = $1", [userId])).length;
  result.traits       = (await pgQueryAll("DELETE FROM user_traits WHERE user_id = $1", [userId])).length;
  result.lookTraits   = (await pgQueryAll("DELETE FROM user_look_traits WHERE user_id = $1", [userId])).length;
  result.analysisRuns = (await pgQueryAll("DELETE FROM analysis_runs WHERE user_id = $1", [userId])).length;
  result.matchScores  = (await pgQueryAll(
    `DELETE FROM match_scores WHERE match_id IN
     (SELECT id FROM matches WHERE user1_id = $1 OR user2_id = $1)`,
    [userId]
  )).length;
  result.matches      = (await pgQueryAll(
    "DELETE FROM matches WHERE user1_id = $1 OR user2_id = $1", [userId]
  )).length;
  result.candidates   = (await pgQueryAll(
    "DELETE FROM candidate_matches WHERE user_id = $1 OR candidate_user_id = $1", [userId]
  )).length;
  await pgQueryAll("DELETE FROM users WHERE id = $1", [userId]);

  // user_photos is now in pg too (FK cascades via users delete above would also work,
  // but we do it explicitly to match other deletes and collect count).
  await pgQueryAll("DELETE FROM user_photos WHERE user_id = $1", [userId]);

  // Clear in-memory conversation state
  conversationStates.delete(userId);

  console.log(`[admin] Deleted user ${userId} (${user.first_name} <${user.email}>):`, result);
  return res.json({ deleted: true, user_id: userId, ...result });
});

// GET /admin/users — All users with registration data
app.get("/admin/users", async (_req, res) => {
  // Latest profile per user via DISTINCT ON (pg idiom)
  const users = await pgQueryAll<any>(`
    SELECT u.*,
      lp.raw_answer,
      lp.analysis_json,
      lp.created_at as profile_created_at,
      COALESCE(tu.total_tokens, 0) as total_tokens,
      COALESCE(tu.total_cost_usd, 0) as total_cost_usd
    FROM users u
    LEFT JOIN LATERAL (
      SELECT raw_answer, analysis_json, created_at
      FROM profiles p2
      WHERE p2.user_id = u.id
      ORDER BY p2.id DESC
      LIMIT 1
    ) lp ON TRUE
    LEFT JOIN (
      SELECT user_id, SUM(total_tokens) as total_tokens, SUM(estimated_cost_usd) as total_cost_usd
      FROM token_usage GROUP BY user_id
    ) tu ON tu.user_id = u.id
    ORDER BY u.created_at DESC
  `);

  // Load moderation trait data for all users in one query
  const moderationTraits = await pgQueryAll<{ user_id: number; internal_name: string; score: number; confidence: number }>(`
    SELECT ut.user_id, td.internal_name, ut.score, ut.confidence
    FROM user_traits ut
    JOIN trait_definitions td ON td.id = ut.trait_definition_id
    WHERE td.internal_name IN ('toxicity_score', 'trollness', 'sexual_identity')
  `);

  const flagMap = new Map<number, { flag_toxic: boolean; flag_troll: boolean; flag_identity: boolean }>();
  for (const t of moderationTraits) {
    if (!flagMap.has(t.user_id)) flagMap.set(t.user_id, { flag_toxic: false, flag_troll: false, flag_identity: false });
    const flags = flagMap.get(t.user_id)!;
    if (t.internal_name === "toxicity_score" && t.score >= 70 && t.confidence >= 0.6) flags.flag_toxic = true;
    if (t.internal_name === "trollness" && t.score >= 70 && t.confidence >= 0.6) flags.flag_troll = true;
    if (t.internal_name === "sexual_identity" && t.score >= 80 && t.confidence >= 0.7) flags.flag_identity = true;
  }

  const now = Date.now();
  const result = users.map((u) => {
    let waiting_days = 0;
    if (u.waiting_since) {
      // pg returns Date objects for TIMESTAMPTZ columns
      const ms = now - new Date(u.waiting_since).getTime();
      waiting_days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    }
    const flags = flagMap.get(u.id) || { flag_toxic: false, flag_troll: false, flag_identity: false };
    return {
      ...u,
      // JSONB columns come back already parsed
      waiting_days,
      ...flags,
    };
  });

  return res.json(result);
});

// GET /admin/users/:id/full — Complete user profile (user + traits + look traits + profile)
app.get("/admin/users/:id/full", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  // pg returns JSONB parsed; no JSON.parse needed on self_style.

  // Compute waiting_days
  if (user.waiting_since) {
    const ms = Date.now() - new Date(user.waiting_since).getTime();
    user.waiting_days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  } else {
    user.waiting_days = 0;
  }

  const profile = await pgQueryOne<any>(
    `SELECT raw_answer, analysis_json, created_at FROM profiles
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  // LEFT JOIN: show ALL trait definitions, with user data overlaid where available
  const traits = await pgQueryAll(
    `SELECT td.internal_name, td.display_name_he, td.display_name_en, td.weight as default_weight,
            td.sensitivity, td.calc_type, td.trait_group, td.required_confidence,
            ut.score, ut.confidence, ut.weight_for_match, ut.weight_confidence, ut.source
     FROM trait_definitions td
     LEFT JOIN user_traits ut ON ut.trait_definition_id = td.id AND ut.user_id = $1
     WHERE td.is_active = TRUE
     ORDER BY td.sort_order`,
    [userId]
  );

  const lookTraits = await pgQueryAll(
    `SELECT ltd.internal_name, ltd.display_name_he, ltd.display_name_en,
            ltd.weight as default_weight, ltd.possible_values,
            ult.personal_value, ult.personal_value_confidence,
            ult.desired_value, ult.desired_value_confidence,
            ult.weight_for_match, ult.weight_confidence, ult.source
     FROM look_trait_definitions ltd
     LEFT JOIN user_look_traits ult ON ult.look_trait_definition_id = ltd.id AND ult.user_id = $1
     WHERE ltd.is_active = TRUE
     ORDER BY ltd.sort_order`,
    [userId]
  );

  // Compute effective_weight for personality traits:
  // effective_weight = system_weight * user_weight * weight_confidence
  const traitsWithEW = (traits as any[]).map((t) => ({
    ...t,
    effective_weight: round2(
      (t.default_weight ?? 0) * (t.weight_for_match ?? 0) * (t.weight_confidence ?? 1),
    ),
  }));

  // Compute effective_weight for look traits:
  // effective_weight = weight * weight_confidence * value_confidence
  const lookTraitsWithEW = (lookTraits as any[]).map((lt) => ({
    ...lt,
    effective_weight: round2(
      (lt.weight_for_match ?? 0) * (lt.weight_confidence ?? 1) * (lt.desired_value_confidence ?? 1),
    ),
  }));

  // Server-side coverage (based on per-trait required_confidence thresholds)
  const serverCoverage = await computeCoverage(db, userId);

  return res.json({
    user,
    profile: profile ? { raw_answer: profile.raw_answer, analysis: profile.analysis_json, created_at: profile.created_at } : null,
    traits: traitsWithEW,
    lookTraits: lookTraitsWithEW,
    coverage: serverCoverage,
  });
});

// GET /admin/users/:id/traits — All traits for a specific user
app.get("/admin/users/:id/traits", async (req, res) => {
  const traits = await pgQueryAll(`
    SELECT ut.*, td.internal_name, td.display_name_he, td.display_name_en
    FROM user_traits ut
    JOIN trait_definitions td ON td.id = ut.trait_definition_id
    WHERE ut.user_id = $1
    ORDER BY td.sort_order
  `, [parseInt(req.params.id, 10)]);
  return res.json(traits);
});

// GET /admin/users/:id/look-traits — Look traits for a specific user
app.get("/admin/users/:id/look-traits", async (req, res) => {
  const traits = await pgQueryAll(`
    SELECT ult.*, ltd.internal_name, ltd.display_name_he, ltd.display_name_en
    FROM user_look_traits ult
    JOIN look_trait_definitions ltd ON ltd.id = ult.look_trait_definition_id
    WHERE ult.user_id = $1
    ORDER BY ltd.sort_order
  `, [parseInt(req.params.id, 10)]);
  return res.json(traits);
});

// GET /admin/trait-definitions — All trait definitions
app.get("/admin/trait-definitions", async (_req, res) => {
  const traits = await pgQueryAll("SELECT * FROM trait_definitions ORDER BY sort_order");
  return res.json(traits);
});

// GET /admin/look-trait-definitions — All look trait definitions
app.get("/admin/look-trait-definitions", async (_req, res) => {
  const traits = await pgQueryAll("SELECT * FROM look_trait_definitions ORDER BY sort_order");
  return res.json(traits);
});

// PUT /admin/trait-definitions/:id — Update editable fields
app.put("/admin/trait-definitions/:id", async (req, res) => {
  const { weight, is_filter, filter_type, min_value, max_value } = req.body;
  const result = await pgQueryAll(
    `UPDATE trait_definitions
     SET weight = $1, is_filter = $2, filter_type = $3, min_value = $4, max_value = $5
     WHERE id = $6 RETURNING id`,
    [weight, is_filter, filter_type ?? null, min_value ?? null, max_value ?? null, parseInt(req.params.id, 10)]
  );
  if (result.length === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ success: true });
});

// PUT /admin/look-trait-definitions/:id — Update editable fields
app.put("/admin/look-trait-definitions/:id", async (req, res) => {
  const { weight, is_filter, filter_type, min_value, max_value } = req.body;
  const result = await pgQueryAll(
    `UPDATE look_trait_definitions
     SET weight = $1, is_filter = $2, filter_type = $3, min_value = $4, max_value = $5
     WHERE id = $6 RETURNING id`,
    [weight, is_filter, filter_type ?? null, min_value ?? null, max_value ?? null, parseInt(req.params.id, 10)]
  );
  if (result.length === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ success: true });
});

// GET /admin/enum-options — All enums, optionally filtered by category
app.get("/admin/enum-options", async (req, res) => {
  const category = req.query.category as string | undefined;
  const options = category
    ? await pgQueryAll("SELECT * FROM enum_options WHERE category = $1 ORDER BY sort_order", [category])
    : await pgQueryAll("SELECT * FROM enum_options ORDER BY category, sort_order");
  return res.json(options);
});

// GET /admin/config — All config values, optionally filtered by category
app.get("/admin/config", async (req, res) => {
  const category = req.query.category as string | undefined;
  const configs = category
    ? await pgQueryAll("SELECT * FROM config WHERE category = $1 ORDER BY key", [category])
    : await pgQueryAll("SELECT * FROM config ORDER BY category, key");
  return res.json(configs);
});

// PUT /admin/config/:key — Update a config value
app.put("/admin/config/:key", async (req, res) => {
  const { value } = req.body;
  if (value === undefined) {
    return res.status(400).json({ error: "value is required" });
  }
  // pg config.value is JSONB; accept a stringified value or JSON-compatible object.
  const result = await pgQueryAll(
    "UPDATE config SET value = $1::jsonb, updated_at = NOW() WHERE key = $2 RETURNING key",
    [JSON.stringify(value), req.params.key]
  );
  if (result.length === 0) {
    return res.status(404).json({ error: "Config key not found" });
  }
  return res.json({ success: true });
});

// GET /admin/matches — All matches
app.get("/admin/matches", async (_req, res) => {
  const matches = await pgQueryAll(`
    SELECT m.*,
      u1.first_name as user1_name,
      u2.first_name as user2_name
    FROM matches m
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    ORDER BY m.created_at DESC
  `);
  return res.json(matches);
});

// GET /admin/stats — Quick overview stats
app.get("/admin/stats", async (_req, res) => {
  const tokenStats = await pgQueryOne<any>(`
    SELECT COUNT(*)::int as total_calls,
           COALESCE(SUM(total_tokens), 0)::bigint as total_tokens,
           COALESCE(SUM(estimated_cost_usd), 0)::float as total_cost_usd
    FROM token_usage
  `);

  const cnt = async (sql: string): Promise<number> => {
    const row = await pgQueryOne<{ c: string }>(sql);
    return Number(row?.c ?? 0);
  };

  const userCount = await cnt("SELECT COUNT(*)::int AS c FROM users");

  const stats = {
    total_users: userCount,
    users_with_profiles: await cnt("SELECT COUNT(DISTINCT user_id)::int AS c FROM profiles"),
    users_with_traits: await cnt("SELECT COUNT(DISTINCT user_id)::int AS c FROM user_traits"),
    total_trait_definitions: await cnt("SELECT COUNT(*)::int AS c FROM trait_definitions"),
    total_look_trait_definitions: await cnt("SELECT COUNT(*)::int AS c FROM look_trait_definitions"),
    total_matches: await cnt("SELECT COUNT(*)::int AS c FROM matches"),
    total_config_keys: await cnt("SELECT COUNT(*)::int AS c FROM config"),
    total_ai_calls: Number(tokenStats?.total_calls ?? 0),
    total_tokens: Number(tokenStats?.total_tokens ?? 0),
    total_cost_usd: Math.round(Number(tokenStats?.total_cost_usd ?? 0) * 1000000) / 1000000,
    avg_tokens_per_user: userCount > 0 ? Math.round(Number(tokenStats?.total_tokens ?? 0) / userCount) : 0,
    avg_cost_per_user: userCount > 0 ? Math.round((Number(tokenStats?.total_cost_usd ?? 0) / userCount) * 1000000) / 1000000 : 0,
  };
  return res.json(stats);
});

// GET /admin/users/:id/analysis-run — Latest analysis run debug data
app.get("/admin/users/:id/analysis-run", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const run = await getLatestAnalysisRun(db, userId);
  if (!run) return res.json({ exists: false });
  return res.json({ exists: true, ...run });
});

// GET /admin/users/:id/token-usage — Per-user token usage breakdown
app.get("/admin/users/:id/token-usage", async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  const byAction = await pgQueryAll<any>(`
    SELECT action_type,
           COUNT(*)::int as calls,
           COALESCE(SUM(input_tokens), 0)::int as input_tokens,
           COALESCE(SUM(output_tokens), 0)::int as output_tokens,
           COALESCE(SUM(total_tokens), 0)::int as total_tokens,
           COALESCE(SUM(estimated_cost_usd), 0)::float as cost_usd
    FROM token_usage
    WHERE user_id = $1
    GROUP BY action_type
    ORDER BY total_tokens DESC
  `, [userId]);

  const totals = await pgQueryOne<any>(`
    SELECT COALESCE(SUM(total_tokens), 0)::int as total_tokens,
           COALESCE(SUM(estimated_cost_usd), 0)::float as total_cost_usd,
           COUNT(*)::int as total_calls
    FROM token_usage
    WHERE user_id = $1
  `, [userId]);

  return res.json({
    user_id: userId,
    total_tokens: totals?.total_tokens || 0,
    total_cost_usd: Math.round((totals?.total_cost_usd || 0) * 1000000) / 1000000,
    total_calls: totals?.total_calls || 0,
    by_action: byAction.map((r: any) => ({
      action_type: r.action_type,
      calls: r.calls,
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      total_tokens: r.total_tokens,
      cost_usd: Math.round((r.cost_usd || 0) * 1000000) / 1000000,
    })),
  });
});

// POST /admin/run-matching — Matching algorithm: filter + score + promote to rating flow
// Does NOT select pre_match or freeze matches.
app.post("/admin/run-matching", async (_req, res) => {
  try {
    const stage1 = await runStage1(db);
    const stage2 = await runStage2(db);
    return res.json({ stage1, stage2 });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/run-matchmaking — Matchmaking selection: prioritize + select + freeze
// Works on existing approved_by_both matches only. Does NOT regenerate candidates.
app.post("/admin/run-matchmaking", async (_req, res) => {
  try {
    const result = await runMatchmaking(db);
    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/approve-all-ratings — Testing shortcut: bulk-approve all pending ratings
app.post("/admin/approve-all-ratings", async (_req, res) => {
  try {
    const result = await pgQueryAll(`
      UPDATE matches SET status = 'approved_by_both', updated_at = NOW()
      WHERE status IN ('waiting_first_rating', 'waiting_second_rating')
      RETURNING id
    `);
    return res.json({ approved: result.length });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/reset-matches — Full reset of all matching data
app.post("/admin/reset-matches", async (_req, res) => {
  try {
    const deletedCandidates = (await pgQueryAll("DELETE FROM candidate_matches RETURNING id")).length;
    const deletedMatches = (await pgQueryAll("DELETE FROM matches RETURNING id")).length;
    await pgQueryAll(`
      UPDATE users SET
        user_status = 'waiting_match',
        waiting_since = COALESCE(waiting_since, created_at),
        total_matches = 0,
        good_matches = 0,
        system_match_priority = 0
    `);
    return res.json({ deleted_candidates: deletedCandidates, deleted_matches: deletedMatches });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/users/:id/reanalyze — Re-run the analysis agent for a user
// Rebuilds the cumulative transcript from ALL saved answers (profiles.raw_answer),
// runs the CURRENT analysis agent (latest prompts, reloaded each call),
// and saves/overwrites results in user_traits + user_look_traits.
//
// Differs from normal /analyze-profile:
//   - Does NOT add a new profile row (no new answer)
//   - Uses ALL existing answers to build transcript
//   - Designed for testing prompt/logic improvements on existing data
app.post("/admin/users/:id/reanalyze", async (req, res) => {
  const user_id = parseInt(req.params.id, 10);
  if (!Number.isFinite(user_id) || user_id <= 0) {
    return res.status(400).json({ error: `Invalid user_id: ${req.params.id}` });
  }

  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [user_id]);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Use the same transcript builder as the normal analysis flow —
  // properly separates interviewer (Personality Lab) and psychologist (Depth Chat)
  const transcript = await buildAnalysisTranscript(db, user_id);

  if (!transcript || transcript.trim().length === 0) {
    return res.status(400).json({ error: "No conversation data found for this user" });
  }

  try {
    // Clear existing traits for a truly fresh analysis (pg — these tables live there now)
    await pgQueryAll("DELETE FROM user_traits WHERE user_id = $1", [user_id]);
    await pgQueryAll("DELETE FROM user_look_traits WHERE user_id = $1", [user_id]);

    const input = await buildAnalysisInput(db, transcript);
    console.log(`[reanalyze] User ${user_id}: transcript=${transcript.length} chars, running FRESH analysis...`);
    console.log(`[reanalyze] Transcript preview: ${transcript.slice(0, 300)}...`);

    const output = await runAnalysisAgent(input, user_id, "reanalyze");

    // Extract and save run data before stripping it
    const runData = (output as any)._run_data;
    delete (output as any)._run_data;

    const saved = await saveAnalysisToDb(db, user_id, output);

    // Update latest profile with new analysis JSON (pg)
    const latest = await pgQueryOne<{ id: number }>(
      "SELECT MAX(id) as id FROM profiles WHERE user_id = $1",
      [user_id]
    );
    if (latest?.id) {
      await pgQueryAll(
        "UPDATE profiles SET analysis_json = $1::jsonb WHERE id = $2",
        [JSON.stringify(output), latest.id]
      );
    }

    // Save analysis run data for debugging
    if (runData) {
      await saveAnalysisRun(db, user_id, runData.generated_prompt, runData.stage_a_output, JSON.stringify(runData.stage_b_output), "reanalyze");
    }

    // Recompute readiness after fresh analysis
    const cov = await computeCoverage(db, user_id);
    await pgQueryAll(
      "UPDATE users SET readiness_score = $1, is_matchable = $2, updated_at = NOW() WHERE id = $3",
      [cov.readiness_score, cov.ready_for_matching, user_id]
    );

    console.log(`[reanalyze] User ${user_id}: saved ${saved.internal_saved} internal, ${saved.external_saved} external traits, matchable=${cov.ready_for_matching}`);
    return res.json({ saved, analysis: output });
  } catch (err: any) {
    console.error(`[reanalyze] Error for user ${user_id}:`, err);
    return res.status(500).json({ error: "Re-analysis failed: " + err.message });
  }
});

// POST /admin/users/:id/toggle-matchable — Force-toggle is_matchable for testing
//
// If currently FALSE → force to TRUE (manual override).
// If currently TRUE  → recalculate from actual readiness score (natural state).
app.post("/admin/users/:id/toggle-matchable", async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await pgQueryOne<any>("SELECT id, is_matchable FROM users WHERE id = $1", [userId]);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.is_matchable) {
      // Force to TRUE — manual override
      await pgQueryAll(
        "UPDATE users SET is_matchable = TRUE, updated_at = NOW() WHERE id = $1",
        [userId]
      );
      console.log(`[admin] Force-enabled matchable for user ${userId}`);
      return res.json({ user_id: userId, is_matchable: true, forced: true });
    } else {
      // Recalculate from actual readiness — return to natural state
      const cov = await computeCoverage(db, userId);
      await pgQueryAll(
        "UPDATE users SET readiness_score = $1, is_matchable = $2, updated_at = NOW() WHERE id = $3",
        [cov.readiness_score, cov.ready_for_matching, userId]
      );
      console.log(`[admin] Recalculated matchable for user ${userId}: score=${cov.readiness_score}, matchable=${cov.ready_for_matching}`);
      return res.json({
        user_id: userId,
        is_matchable: cov.ready_for_matching,
        forced: false,
        readiness_score: cov.readiness_score,
      });
    }
  } catch (err: any) {
    console.error(`[admin] toggle-matchable failed:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/users/:id/reset-analysis — Delete all derived analysis data for a user
//
// Deletes:
//   - All rows from user_traits for this user
//   - All rows from user_look_traits for this user
//   - Sets profiles.analysis_json to '{}' for all profile rows (clears cached analysis)
//
// Does NOT delete:
//   - The user record itself
//   - Profile rows (profiles.raw_answer is preserved — conversation history stays)
//   - Any match data
//
// This gives a clean slate for re-analysis testing.
app.post("/admin/users/:id/reset-analysis", async (req, res) => {
  const user_id = parseInt(req.params.id, 10);
  if (!Number.isFinite(user_id) || user_id <= 0) {
    return res.status(400).json({ error: `Invalid user_id: ${req.params.id}` });
  }

  const user = await pgQueryOne<any>("SELECT * FROM users WHERE id = $1", [user_id]);
  if (!user) return res.status(404).json({ error: "User not found" });

  // user_traits + user_look_traits are in pg (Phase 2). Profiles are dual-written.
  const deletedTraits = (await pgQueryAll(
    "DELETE FROM user_traits WHERE user_id = $1", [user_id]
  )) as any[];
  const deletedLookTraits = (await pgQueryAll(
    "DELETE FROM user_look_traits WHERE user_id = $1", [user_id]
  )) as any[];

  // Clear profiles.analysis_json in pg
  const cleared = await pgQueryAll(
    "UPDATE profiles SET analysis_json = '{}'::jsonb WHERE user_id = $1 RETURNING id",
    [user_id]
  );

  console.log(`[reset-analysis] User ${user_id}: cleared traits, ${cleared.length} profiles reset`);
  return res.json({
    cleared_profiles: cleared.length,
    deleted_traits: deletedTraits.length,
    deleted_look_traits: deletedLookTraits.length,
  });
});

// GET /admin/users/:id/matches — Actual matches for a specific user (from matches table)
app.get("/admin/users/:id/matches", async (req, res) => {
  const uid = parseInt(req.params.id, 10);
  const rows = await pgQueryAll(`
    SELECT m.id, m.match_score, m.status, m.user1_id, m.user2_id,
      m.user1_rating, m.user2_rating,
      u.id as other_id, u.first_name as other_name,
      u1.pickiness_score as user1_pickiness,
      u2.pickiness_score as user2_pickiness
    FROM matches m
    JOIN users u ON u.id = CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    WHERE m.user1_id = $1 OR m.user2_id = $1
    ORDER BY m.final_match_priority DESC NULLS LAST
  `, [uid]);
  return res.json(rows);
});

// GET /admin/users/:id/candidate-matches — Matches for a specific user
app.get("/admin/users/:id/candidate-matches", async (req, res) => {
  const uid = parseInt(req.params.id, 10);
  const rows = await pgQueryAll(`
    SELECT cm.*, u.id as other_id, u.first_name as other_name, u.age as other_age, u.city as other_city,
      m.status as match_status, m.pair_priority, m.final_match_priority
    FROM candidate_matches cm
    JOIN users u ON u.id = CASE WHEN cm.user_id = $1 THEN cm.candidate_user_id ELSE cm.user_id END
    LEFT JOIN matches m ON (m.user1_id = cm.user_id AND m.user2_id = cm.candidate_user_id)
                        OR (m.user1_id = cm.candidate_user_id AND m.user2_id = cm.user_id)
    WHERE cm.user_id = $1 OR cm.candidate_user_id = $1
    ORDER BY cm.final_score DESC NULLS LAST
  `, [uid]);
  return res.json(rows);
});

// ════════════════════════════════════════════════════════════════
// MATCH RATING — User rates a match
// ════════════════════════════════════════════════════════════════

// POST /matches/:id/rate — Submit a rating for one side of a match
// Body: { user_id, rating: "miss" | "possible" | "bullseye" }
//
// First rater = the user with the HIGHER pickiness_score.
// If equal or both null, user1 goes first.
//
// Transition rules:
//   waiting_first_rating  + miss                → rejected_by_users
//   waiting_first_rating  + possible/bullseye   → waiting_second_rating
//   waiting_second_rating + miss                → rejected_by_users
//   waiting_second_rating + possible/bullseye   → approved_by_both

const VALID_RATINGS = new Set(["miss", "possible", "bullseye"]);

app.post("/matches/:id/rate", async (req, res) => {
  const { user_id, rating } = req.body;

  if (!user_id || !rating) {
    return res.status(400).json({ error: "user_id and rating are required" });
  }
  if (!VALID_RATINGS.has(rating)) {
    return res.status(400).json({ error: "rating must be miss, possible, or bullseye" });
  }

  const match = await pgQueryOne<any>("SELECT * FROM matches WHERE id = $1", [parseInt(req.params.id, 10)]);
  if (!match) return res.status(404).json({ error: "Match not found" });

  if (match.user1_id !== user_id && match.user2_id !== user_id) {
    return res.status(403).json({ error: "User is not part of this match" });
  }

  if (match.status !== "waiting_first_rating" && match.status !== "waiting_second_rating") {
    return res.status(400).json({ error: `Cannot rate a match in status '${match.status}'` });
  }

  // Determine first and second rater based on pickiness_score.
  const u1 = await pgQueryOne<any>("SELECT id, pickiness_score FROM users WHERE id = $1", [match.user1_id]);
  const u2 = await pgQueryOne<any>("SELECT id, pickiness_score FROM users WHERE id = $1", [match.user2_id]);
  const p1 = u1?.pickiness_score ?? 0;
  const p2 = u2?.pickiness_score ?? 0;
  const firstRaterId = p2 > p1 ? match.user2_id : match.user1_id;
  const secondRaterId = firstRaterId === match.user1_id ? match.user2_id : match.user1_id;

  const ratingCol = user_id === match.user1_id ? "user1_rating" : "user2_rating";

  if (match.status === "waiting_first_rating") {
    if (user_id !== firstRaterId) {
      return res.status(400).json({ error: "Waiting for the other user to rate first (higher pickiness)" });
    }

    const newStatus = rating === "miss" ? "rejected_by_users" : "waiting_second_rating";
    await pgQueryAll(
      `UPDATE matches SET status = $1, ${ratingCol} = $2, updated_at = NOW() WHERE id = $3`,
      [newStatus, rating, match.id]
    );

    return res.json({ match_id: match.id, new_status: newStatus, rated_by: user_id });
  }

  // waiting_second_rating
  if (user_id !== secondRaterId) {
    return res.status(400).json({ error: "Waiting for the other user to rate" });
  }

  const newStatus = rating === "miss" ? "rejected_by_users" : "approved_by_both";
  await pgQueryAll(
    `UPDATE matches SET status = $1, ${ratingCol} = $2, updated_at = NOW() WHERE id = $3`,
    [newStatus, rating, match.id]
  );

  return res.json({ match_id: match.id, new_status: newStatus, rated_by: user_id });
});

// GET /admin/candidate-matches — View candidate match array with priority data
app.get("/admin/candidate-matches", async (_req, res) => {
  const rows = await pgQueryAll(`
    SELECT cm.*,
      u1.first_name as user1_name, u1.age as user1_age, u1.city as user1_city,
      u1.system_match_priority as user1_priority,
      u2.first_name as user2_name, u2.age as user2_age, u2.city as user2_city,
      u2.system_match_priority as user2_priority,
      m.status as match_status,
      m.pair_priority,
      m.final_match_priority
    FROM candidate_matches cm
    JOIN users u1 ON u1.id = cm.user_id
    JOIN users u2 ON u2.id = cm.candidate_user_id
    LEFT JOIN matches m ON (m.user1_id = cm.user_id AND m.user2_id = cm.candidate_user_id)
                        OR (m.user1_id = cm.candidate_user_id AND m.user2_id = cm.user_id)
    ORDER BY cm.final_score DESC NULLS LAST
  `);
  return res.json(rows);
});

// ════════════════════════════════════════════════════════════════
// MATCH LIFECYCLE — Send / Cancel final matches
// ════════════════════════════════════════════════════════════════

// POST /admin/matches/:id/send — Mark a match as sent/revealed to both users
// This is the ONLY action that stops the waiting counter.
app.post("/admin/matches/:id/send", async (req, res) => {
  const matchId = parseInt(req.params.id, 10);
  const match = await pgQueryOne<any>("SELECT * FROM matches WHERE id = $1", [matchId]);
  if (!match) return res.status(404).json({ error: "Match not found" });

  if (match.status === "in_match") {
    return res.status(400).json({ error: "Match is already active" });
  }

  await withTransaction(async (client) => {
    await client.query(
      "UPDATE matches SET status = 'in_match', updated_at = NOW() WHERE id = $1",
      [match.id]
    );
    await client.query(
      `UPDATE users SET waiting_since = NULL, user_status = 'in_match', updated_at = NOW()
       WHERE id IN ($1, $2)`,
      [match.user1_id, match.user2_id]
    );
  });

  return res.json({ success: true, match_id: match.id, status: "in_match" });
});

// POST /admin/matches/:id/cancel — Cancel a match in pre_match or in_match
//
// On cancellation:
//   1. Match status → cancelled
//   2. Both users → waiting_match, waiting_since = now
//   3. Frozen matches involving either user are restored to their previous_status
//      (the status they had before being frozen by this match's selection run)

app.post("/admin/matches/:id/cancel", async (req, res) => {
  const matchId = parseInt(req.params.id, 10);
  const match = await pgQueryOne<any>("SELECT * FROM matches WHERE id = $1", [matchId]);
  if (!match) return res.status(404).json({ error: "Match not found" });

  if (match.status !== "pre_match" && match.status !== "in_match") {
    return res.status(400).json({ error: `Can only cancel matches in pre_match or in_match, current status is '${match.status}'` });
  }

  let unfrozen = 0;

  await withTransaction(async (client) => {
    await client.query(
      "UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [match.id]
    );
    await client.query(
      `UPDATE users SET user_status = 'waiting_match', waiting_since = NOW(), updated_at = NOW()
       WHERE id IN ($1, $2)`,
      [match.user1_id, match.user2_id]
    );

    const frozenMatches = await client.query<{ id: number; previous_status: string }>(
      `SELECT id, previous_status FROM matches
       WHERE status = 'frozen'
         AND previous_status IS NOT NULL
         AND (user1_id = ANY($1::int[]) OR user2_id = ANY($1::int[]))`,
      [[match.user1_id, match.user2_id]]
    );

    for (const fm of frozenMatches.rows) {
      await client.query(
        "UPDATE matches SET status = $1, previous_status = NULL, updated_at = NOW() WHERE id = $2",
        [fm.previous_status, fm.id]
      );
      unfrozen++;
    }
  });

  return res.json({ success: true, match_id: match.id, status: "cancelled", unfrozen });
});

// GET /admin/users/:id/waiting — Get waiting days for a specific user
app.get("/admin/users/:id/waiting", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await pgQueryOne<any>("SELECT waiting_since, user_status FROM users WHERE id = $1", [userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  let waiting_days = 0;
  if (user.waiting_since) {
    const ms = Date.now() - new Date(user.waiting_since).getTime();
    waiting_days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  return res.json({
    waiting_since: user.waiting_since,
    waiting_days,
    is_waiting: user.waiting_since !== null,
    user_status: user.user_status,
  });
});

// Keep old GET /users for backward compatibility
app.get("/users", async (_req, res) => {
  const users = await pgQueryAll<any>(`
    SELECT u.id, u.first_name as name, u.email, u.created_at,
      p.raw_answer, p.analysis_json, p.created_at as profile_created_at
    FROM users u
    LEFT JOIN LATERAL (
      SELECT raw_answer, analysis_json, created_at
      FROM profiles p2 WHERE p2.user_id = u.id ORDER BY p2.id DESC LIMIT 1
    ) p ON TRUE
    ORDER BY u.created_at DESC
  `);
  // analysis_json is JSONB — already parsed by pg
  return res.json(users.map(u => ({ ...u, analysis: u.analysis_json })));
});

// ════════════════════════════════════════════════════════════════
// BUG REPORTS
// ════════════════════════════════════════════════════════════════

app.post("/report-bug", async (req, res) => {
  const { user_id, report_text } = req.body;
  if (!report_text?.trim()) {
    return res.status(400).json({ error: "report_text is required" });
  }
  try {
    const report = await pgQueryOne<any>(
      `INSERT INTO bug_reports (user_id, report_text) VALUES ($1, $2) RETURNING *`,
      [user_id || null, report_text.trim()]
    );
    console.log(`[bug] Report #${report.id} from user ${user_id || "anon"}: ${report_text.slice(0, 80)}`);
    return res.json({ success: true, report_id: report.id });
  } catch (err: any) {
    console.error("[bug] Failed to save report:", err.message);
    return res.status(500).json({ error: "Failed to save report" });
  }
});

// GET /admin/bug-reports — All bug reports (admin only)
app.get("/admin/bug-reports", async (_req, res) => {
  const reports = await pgQueryAll<any>(`
    SELECT br.*, u.first_name, u.email
    FROM bug_reports br
    LEFT JOIN users u ON u.id = br.user_id
    ORDER BY br.created_at DESC
  `);
  return res.json(reports);
});

// PATCH /admin/bug-reports/:id — Edit a bug report
app.patch("/admin/bug-reports/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { report_text } = req.body;
  if (!report_text?.trim()) return res.status(400).json({ error: "report_text is required" });
  const updated = await pgQueryOne<any>(
    "UPDATE bug_reports SET report_text = $1 WHERE id = $2 RETURNING *",
    [report_text.trim(), id]
  );
  if (!updated) return res.status(404).json({ error: "Report not found" });
  return res.json(updated);
});

// DELETE /admin/bug-reports/:id — Delete a bug report
app.delete("/admin/bug-reports/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = await pgQueryAll("DELETE FROM bug_reports WHERE id = $1 RETURNING id", [id]);
  if (result.length === 0) return res.status(404).json({ error: "Report not found" });
  return res.json({ deleted: true });
});

// ── SPA catch-all ────────────────────────────────────────────────
// Any GET request that didn't match an API route or static file gets
// the frontend's index.html — lets React Router handle client-side routing.
app.get("*", (_req, res) => {
  const indexPath = path.join(frontendDist, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send("Frontend not built. Run: cd frontend && npm run build");
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);

  // Warm up pg: create schema, seed trait definitions if empty.
  // Users/profiles/conversation_messages live in pg only (Phase 4b complete).
  (async () => {
    try {
      await initPgDb();
      await syncConfigFromSqlite(db); // idempotent: seeds trait defs if pg is empty, else no-op
      console.log("[pg] ready");
    } catch (err: any) {
      console.error("[pg] init failed:", err.message);
    }
  })();
});
