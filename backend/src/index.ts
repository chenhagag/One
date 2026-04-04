import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import db from "./db";
import { analyzeAnswer } from "./openai";
import { runStage1 } from "./matchStage1";
import { runStage2, runMatchmaking } from "./matchStage2";
import { runAnalysisAgent, buildAnalysisInput, saveAnalysisToDb } from "./agents/analysis";
import { generateOpeningMessage, processUserMessage, computeCoverage, type ConversationState } from "./agents/conversation";

dotenv.config();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ════════════════════════════════════════════════════════════════
// REGISTRATION
// ════════════════════════════════════════════════════════════════

// POST /register — Full registration (replaces old POST /users)
app.post("/register", (req, res) => {
  const {
    first_name, email, age, gender, looking_for_gender,
    city, height, self_style,
    desired_age_min, desired_age_max, age_flexibility,
    desired_height_min, desired_height_max, height_flexibility,
    desired_location_range,
  } = req.body;

  if (!first_name || !email) {
    return res.status(400).json({ error: "first_name and email are required" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO users (
        first_name, email, age, gender, looking_for_gender,
        city, height, self_style,
        desired_age_min, desired_age_max, age_flexibility,
        desired_height_min, desired_height_max, height_flexibility,
        desired_location_range
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);
    const user = stmt.get(
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
    );
    return res.status(201).json(user);
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to register user" });
  }
});

// Keep old POST /users for backward compatibility
app.post("/users", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }
  try {
    const stmt = db.prepare(
      "INSERT INTO users (first_name, email) VALUES (?, ?) RETURNING *"
    );
    const user = stmt.get(name.trim(), email.trim().toLowerCase());
    return res.status(201).json(user);
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
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

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  try {
    const analysis = await analyzeAnswer(answer);
    const stmt = db.prepare(
      "INSERT INTO profiles (user_id, raw_answer, analysis_json) VALUES (?, ?, ?) RETURNING *"
    );
    const profile = stmt.get(user_id, answer, JSON.stringify(analysis));
    return res.status(201).json({ profile, analysis });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
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

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  // Check for existing paused conversation
  const existing = conversationStates.get(userId);
  if (existing && existing.phase === "paused") {
    // Resume — restore the phase that was active before pausing
    existing.phase = (existing as any)._phase_before_pause || "chatting";
    delete (existing as any)._phase_before_pause;
    conversationStates.set(userId, existing);
    const cov = computeCoverage(db, userId);
    console.log(`[conversation] Resumed for user ${userId} at turn ${existing.turn_count}, phase=${existing.phase}`);
    return res.json({
      assistant_message: existing.turns[existing.turns.length - 1]?.content || "Welcome back! Where were we?",
      phase: existing.phase,
      coverage_pct: cov.coverage_pct,
      turn_count: existing.turn_count,
      resumed: true,
      turns: existing.turns,
    });
  }

  const { message, state } = generateOpeningMessage(db, userId);
  conversationStates.set(userId, state);
  console.log(`[conversation] Started for user ${userId}`);
  return res.json({
    assistant_message: message,
    phase: "chatting",
    coverage_pct: 0,
    turn_count: 0,
    resumed: false,
    turns: state.turns,
  });
});

// POST /conversation/message — Send a user message and get assistant response
app.post("/conversation/message", async (req, res) => {
  const userId = parseUserId(req.body.user_id);
  const message = req.body.message;
  if (!userId || !message) return res.status(400).json({ error: "user_id and message required" });

  let state = conversationStates.get(userId);
  if (!state) {
    state = {
      user_id: userId, turns: [], turn_count: 0,
      last_analysis: null, last_analysis_at_turn: 0, phase: "chatting",
      analysis_in_flight: false, analysis_scheduled_at: 0,
    };
  }

  if (state.phase === "confirmed") {
    return res.status(400).json({ error: "Conversation already confirmed. Navigate to results." });
  }
  if (state.phase === "paused") {
    return res.status(400).json({ error: "Conversation is paused. Call /conversation/start to resume." });
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
app.post("/conversation/pause", (req, res) => {
  const userId = parseUserId(req.body.user_id);
  if (!userId) return res.status(400).json({ error: "Valid user_id required" });

  const state = conversationStates.get(userId);
  if (!state) return res.status(404).json({ error: "No active conversation" });

  if (state.phase === "confirmed") {
    return res.status(400).json({ error: "Conversation already confirmed" });
  }

  // Remember what phase we were in so resume can restore it
  (state as any)._phase_before_pause = state.phase;
  state.phase = "paused";
  conversationStates.set(userId, state);

  const cov = computeCoverage(db, userId);
  console.log(`[conversation] Paused for user ${userId} at turn ${state.turn_count}`);
  return res.json({
    phase: "paused",
    turn_count: state.turn_count,
    coverage_pct: cov.coverage_pct,
  });
});

// GET /conversation/state/:id — Current conversation state
app.get("/conversation/state/:id", (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const state = conversationStates.get(userId);
  if (!state) return res.status(404).json({ error: "No active conversation" });

  const cov = computeCoverage(db, userId);
  return res.json({
    user_id: state.user_id,
    turn_count: state.turn_count,
    phase: state.phase,
    last_analysis_at_turn: state.last_analysis_at_turn,
    coverage_pct: cov.coverage_pct,
    turns: state.turns,
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

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id) as any;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  console.log(`[analyze-profile] Start: user_id=${user_id} (original: ${typeof rawUserId} ${rawUserId})`);

  try {
    // 1. Store the raw answer
    db.prepare(
      "INSERT INTO profiles (user_id, raw_answer, analysis_json) VALUES (?, ?, '{}')"
    ).run(user_id, answer);

    // 2. Build cumulative transcript from all answers
    const allAnswers = db.prepare(
      "SELECT raw_answer, created_at FROM profiles WHERE user_id = ? ORDER BY created_at ASC"
    ).all(user_id) as { raw_answer: string; created_at: string }[];

    const transcript = allAnswers
      .map((a, i) => `[Round ${i + 1}]\nUser: ${a.raw_answer}`)
      .join("\n\n");

    // 3. Run analysis agent
    const input = buildAnalysisInput(db, transcript);
    console.log(`[analyze-profile] User ${user_id}: ${allAnswers.length} answers, ${input.internal_trait_definitions.length} internal + ${input.external_trait_definitions.length} external trait defs`);

    const output = await runAnalysisAgent(input, user_id, "analysis");

    console.log(`[analyze-profile] Agent returned ${output.internal_traits.length} internal, ${output.external_traits.length} external traits for user ${user_id}`);

    // 4. Save traits to DB (COALESCE preserves existing non-null values)
    const saved = saveAnalysisToDb(db, user_id, output);
    console.log(`[analyze-profile] User ${user_id}: saved ${saved.internal_saved} internal, ${saved.external_saved} external traits`);
    console.log(`[analyze-profile] User ${user_id}: coverage ${output.profiling_completeness.coverage_pct}%, ready: ${output.profiling_completeness.ready_for_matching}`);

    // 5. Update the latest profile record with analysis JSON
    db.prepare(`
      UPDATE profiles SET analysis_json = ?
      WHERE user_id = ? AND id = (SELECT MAX(id) FROM profiles WHERE user_id = ?)
    `).run(JSON.stringify(output), user_id, user_id);

    return res.status(200).json({
      saved,
      analysis: output,
    });
  } catch (err: any) {
    console.error(`[analyze-profile] Error for user ${user_id}:`, err);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
});

// GET /users/:id/profile-status — Get current trait coverage and readiness
app.get("/users/:id/profile-status", (req, res) => {
  const userId = parseInt(req.params.id);

  const internalCount = (db.prepare(`
    SELECT COUNT(*) as c FROM user_traits WHERE user_id = ? AND score IS NOT NULL
  `).get(userId) as any).c;

  const internalTotal = (db.prepare(`
    SELECT COUNT(*) as c FROM trait_definitions WHERE is_active = 1
  `).get() as any).c;

  const externalCount = (db.prepare(`
    SELECT COUNT(*) as c FROM user_look_traits WHERE user_id = ? AND personal_value IS NOT NULL
  `).get(userId) as any).c;

  const externalTotal = (db.prepare(`
    SELECT COUNT(*) as c FROM look_trait_definitions WHERE is_active = 1
  `).get() as any).c;

  const total = internalTotal + externalTotal;
  const assessed = internalCount + externalCount;
  const coverage_pct = total > 0 ? Math.round((assessed / total) * 100) : 0;

  const answerCount = (db.prepare(
    "SELECT COUNT(*) as c FROM profiles WHERE user_id = ?"
  ).get(userId) as any).c;

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

// DELETE /admin/users/:id — Permanently delete a user and all related data
app.delete("/admin/users/:id", (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user_id" });
  }

  const user = db.prepare("SELECT id, first_name, email FROM users WHERE id = ?").get(userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const result = db.transaction(() => {
    const profiles = db.prepare("DELETE FROM profiles WHERE user_id = ?").run(userId).changes;
    const traits = db.prepare("DELETE FROM user_traits WHERE user_id = ?").run(userId).changes;
    const lookTraits = db.prepare("DELETE FROM user_look_traits WHERE user_id = ?").run(userId).changes;
    const matchScores = db.prepare("DELETE FROM match_scores WHERE match_id IN (SELECT id FROM matches WHERE user1_id = ? OR user2_id = ?)").run(userId, userId).changes;
    const matches = db.prepare("DELETE FROM matches WHERE user1_id = ? OR user2_id = ?").run(userId, userId).changes;
    const candidates = db.prepare("DELETE FROM candidate_matches WHERE user_id = ? OR candidate_user_id = ?").run(userId, userId).changes;
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return { profiles, traits, lookTraits, matchScores, matches, candidates };
  })();

  // Clear in-memory conversation state
  conversationStates.delete(userId);

  console.log(`[admin] Deleted user ${userId} (${user.first_name} <${user.email}>):`, result);
  return res.json({ deleted: true, user_id: userId, ...result });
});

// GET /admin/users — All users with registration data
app.get("/admin/users", (_req, res) => {
  // Use a subquery to get only the LATEST profile per user (avoids duplicate rows)
  const users = db.prepare(`
    SELECT u.*,
      lp.raw_answer,
      lp.analysis_json,
      lp.created_at as profile_created_at,
      COALESCE(tu.total_tokens, 0) as total_tokens,
      COALESCE(tu.total_cost_usd, 0) as total_cost_usd
    FROM users u
    LEFT JOIN profiles lp ON lp.user_id = u.id
      AND lp.id = (SELECT MAX(p2.id) FROM profiles p2 WHERE p2.user_id = u.id)
    LEFT JOIN (
      SELECT user_id, SUM(total_tokens) as total_tokens, SUM(estimated_cost_usd) as total_cost_usd
      FROM token_usage GROUP BY user_id
    ) tu ON tu.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();

  const now = Date.now();
  const result = (users as any[]).map((u) => {
    let waiting_days = 0;
    if (u.waiting_since) {
      const ms = now - new Date(u.waiting_since + "Z").getTime();
      waiting_days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    }
    return {
      ...u,
      self_style: u.self_style ? JSON.parse(u.self_style) : null,
      analysis: u.analysis_json ? JSON.parse(u.analysis_json) : null,
      waiting_days,
    };
  });

  return res.json(result);
});

// GET /admin/users/:id/full — Complete user profile (user + traits + look traits + profile)
app.get("/admin/users/:id/full", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  user.self_style = user.self_style ? JSON.parse(user.self_style) : null;

  // Compute waiting_days
  if (user.waiting_since) {
    const ms = Date.now() - new Date(user.waiting_since + "Z").getTime();
    user.waiting_days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  } else {
    user.waiting_days = 0;
  }

  const profile = db.prepare(`
    SELECT raw_answer, analysis_json, created_at FROM profiles
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id) as any;

  const traits = db.prepare(`
    SELECT ut.score, ut.confidence, ut.weight_for_match, ut.weight_confidence, ut.source,
           td.internal_name, td.display_name_he, td.display_name_en, td.weight as default_weight,
           td.sensitivity, td.calc_type
    FROM user_traits ut
    JOIN trait_definitions td ON td.id = ut.trait_definition_id
    WHERE ut.user_id = ?
    ORDER BY td.sort_order
  `).all(req.params.id);

  const lookTraits = db.prepare(`
    SELECT ult.personal_value, ult.personal_value_confidence,
           ult.desired_value, ult.desired_value_confidence,
           ult.weight_for_match, ult.weight_confidence, ult.source,
           ltd.internal_name, ltd.display_name_he, ltd.display_name_en,
           ltd.weight as default_weight, ltd.possible_values
    FROM user_look_traits ult
    JOIN look_trait_definitions ltd ON ltd.id = ult.look_trait_definition_id
    WHERE ult.user_id = ?
    ORDER BY ltd.sort_order
  `).all(req.params.id);

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
  const userId = parseInt(req.params.id, 10);
  const serverCoverage = computeCoverage(db, userId);

  return res.json({
    user,
    profile: profile ? { raw_answer: profile.raw_answer, analysis: JSON.parse(profile.analysis_json), created_at: profile.created_at } : null,
    traits: traitsWithEW,
    lookTraits: lookTraitsWithEW,
    coverage: serverCoverage,
  });
});

// GET /admin/users/:id/traits — All traits for a specific user
app.get("/admin/users/:id/traits", (req, res) => {
  const traits = db.prepare(`
    SELECT ut.*, td.internal_name, td.display_name_he, td.display_name_en
    FROM user_traits ut
    JOIN trait_definitions td ON td.id = ut.trait_definition_id
    WHERE ut.user_id = ?
    ORDER BY td.sort_order
  `).all(req.params.id);

  return res.json(traits);
});

// GET /admin/users/:id/look-traits — Look traits for a specific user
app.get("/admin/users/:id/look-traits", (req, res) => {
  const traits = db.prepare(`
    SELECT ult.*, ltd.internal_name, ltd.display_name_he, ltd.display_name_en
    FROM user_look_traits ult
    JOIN look_trait_definitions ltd ON ltd.id = ult.look_trait_definition_id
    WHERE ult.user_id = ?
    ORDER BY ltd.sort_order
  `).all(req.params.id);

  return res.json(traits);
});

// GET /admin/trait-definitions — All trait definitions
app.get("/admin/trait-definitions", (_req, res) => {
  const traits = db.prepare("SELECT * FROM trait_definitions ORDER BY sort_order").all();
  return res.json(traits);
});

// GET /admin/look-trait-definitions — All look trait definitions
app.get("/admin/look-trait-definitions", (_req, res) => {
  const traits = db.prepare("SELECT * FROM look_trait_definitions ORDER BY sort_order").all();
  return res.json(traits);
});

// PUT /admin/trait-definitions/:id — Update editable fields
app.put("/admin/trait-definitions/:id", (req, res) => {
  const { weight, is_filter, filter_type, min_value, max_value } = req.body;
  const stmt = db.prepare(`
    UPDATE trait_definitions
    SET weight = ?, is_filter = ?, filter_type = ?, min_value = ?, max_value = ?
    WHERE id = ?
  `);
  const result = stmt.run(weight, is_filter, filter_type ?? null, min_value ?? null, max_value ?? null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ success: true });
});

// PUT /admin/look-trait-definitions/:id — Update editable fields
app.put("/admin/look-trait-definitions/:id", (req, res) => {
  const { weight, is_filter, filter_type, min_value, max_value } = req.body;
  const stmt = db.prepare(`
    UPDATE look_trait_definitions
    SET weight = ?, is_filter = ?, filter_type = ?, min_value = ?, max_value = ?
    WHERE id = ?
  `);
  const result = stmt.run(weight, is_filter, filter_type ?? null, min_value ?? null, max_value ?? null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Not found" });
  return res.json({ success: true });
});

// GET /admin/enum-options — All enums, optionally filtered by category
app.get("/admin/enum-options", (req, res) => {
  const category = req.query.category;
  if (category) {
    const options = db.prepare("SELECT * FROM enum_options WHERE category = ? ORDER BY sort_order").all(category);
    return res.json(options);
  }
  const options = db.prepare("SELECT * FROM enum_options ORDER BY category, sort_order").all();
  return res.json(options);
});

// GET /admin/config — All config values, optionally filtered by category
app.get("/admin/config", (req, res) => {
  const category = req.query.category;
  if (category) {
    const configs = db.prepare("SELECT * FROM config WHERE category = ? ORDER BY key").all(category);
    return res.json(configs);
  }
  const configs = db.prepare("SELECT * FROM config ORDER BY category, key").all();
  return res.json(configs);
});

// PUT /admin/config/:key — Update a config value
app.put("/admin/config/:key", (req, res) => {
  const { value } = req.body;
  if (value === undefined) {
    return res.status(400).json({ error: "value is required" });
  }
  const stmt = db.prepare("UPDATE config SET value = ?, updated_at = datetime('now') WHERE key = ?");
  const result = stmt.run(String(value), req.params.key);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Config key not found" });
  }
  return res.json({ success: true });
});

// GET /admin/matches — All matches
app.get("/admin/matches", (_req, res) => {
  const matches = db.prepare(`
    SELECT m.*,
      u1.first_name as user1_name,
      u2.first_name as user2_name
    FROM matches m
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    ORDER BY m.created_at DESC
  `).all();
  return res.json(matches);
});

// GET /admin/stats — Quick overview stats
app.get("/admin/stats", (_req, res) => {
  const tokenStats = db.prepare(`
    SELECT COUNT(*) as total_calls,
           SUM(total_tokens) as total_tokens,
           SUM(estimated_cost_usd) as total_cost_usd
    FROM token_usage
  `).get() as any;

  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;

  const stats = {
    total_users: userCount,
    users_with_profiles: (db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM profiles").get() as any).c,
    users_with_traits: (db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM user_traits").get() as any).c,
    total_trait_definitions: (db.prepare("SELECT COUNT(*) as c FROM trait_definitions").get() as any).c,
    total_look_trait_definitions: (db.prepare("SELECT COUNT(*) as c FROM look_trait_definitions").get() as any).c,
    total_matches: (db.prepare("SELECT COUNT(*) as c FROM matches").get() as any).c,
    total_config_keys: (db.prepare("SELECT COUNT(*) as c FROM config").get() as any).c,
    total_ai_calls: tokenStats.total_calls || 0,
    total_tokens: tokenStats.total_tokens || 0,
    total_cost_usd: Math.round((tokenStats.total_cost_usd || 0) * 1000000) / 1000000,
    avg_tokens_per_user: userCount > 0 ? Math.round((tokenStats.total_tokens || 0) / userCount) : 0,
    avg_cost_per_user: userCount > 0 ? Math.round(((tokenStats.total_cost_usd || 0) / userCount) * 1000000) / 1000000 : 0,
  };
  return res.json(stats);
});

// GET /admin/users/:id/token-usage — Per-user token usage breakdown
app.get("/admin/users/:id/token-usage", (req, res) => {
  const userId = parseInt(req.params.id, 10);

  const byAction = db.prepare(`
    SELECT action_type,
           COUNT(*) as calls,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens,
           SUM(total_tokens) as total_tokens,
           SUM(estimated_cost_usd) as cost_usd
    FROM token_usage
    WHERE user_id = ?
    GROUP BY action_type
    ORDER BY total_tokens DESC
  `).all(userId) as any[];

  const totals = db.prepare(`
    SELECT SUM(total_tokens) as total_tokens,
           SUM(estimated_cost_usd) as total_cost_usd,
           COUNT(*) as total_calls
    FROM token_usage
    WHERE user_id = ?
  `).get(userId) as any;

  return res.json({
    user_id: userId,
    total_tokens: totals.total_tokens || 0,
    total_cost_usd: Math.round((totals.total_cost_usd || 0) * 1000000) / 1000000,
    total_calls: totals.total_calls || 0,
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
app.post("/admin/run-matching", (_req, res) => {
  try {
    const stage1 = runStage1(db);
    const stage2 = runStage2(db);
    return res.json({ stage1, stage2 });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/run-matchmaking — Matchmaking selection: prioritize + select + freeze
// Works on existing approved_by_both matches only. Does NOT regenerate candidates.
app.post("/admin/run-matchmaking", (_req, res) => {
  try {
    const result = runMatchmaking(db);
    return res.json(result);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/approve-all-ratings — Testing shortcut: bulk-approve all pending ratings
app.post("/admin/approve-all-ratings", (_req, res) => {
  try {
    const result = db.prepare(`
      UPDATE matches SET status = 'approved_by_both', updated_at = datetime('now')
      WHERE status IN ('waiting_first_rating', 'waiting_second_rating')
    `).run();
    return res.json({ approved: result.changes });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/reset-matches — Full reset of all matching data
app.post("/admin/reset-matches", (_req, res) => {
  try {
    const deletedCandidates = db.prepare("DELETE FROM candidate_matches").run().changes;
    const deletedMatches = db.prepare("DELETE FROM matches").run().changes;
    db.prepare(`
      UPDATE users SET
        user_status = 'waiting_match',
        waiting_since = COALESCE(waiting_since, created_at),
        total_matches = 0,
        good_matches = 0,
        system_match_priority = 0
    `).run();
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

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const allAnswers = db.prepare(
    "SELECT raw_answer, created_at FROM profiles WHERE user_id = ? ORDER BY created_at ASC"
  ).all(user_id) as { raw_answer: string; created_at: string }[];

  if (allAnswers.length === 0) {
    return res.status(400).json({ error: "No profile answers found for this user" });
  }

  const transcript = allAnswers
    .map((a, i) => `[Round ${i + 1}]\nUser: ${a.raw_answer}`)
    .join("\n\n");

  try {
    const input = buildAnalysisInput(db, transcript);
    console.log(`[reanalyze] User ${user_id}: ${allAnswers.length} answers, running analysis agent...`);

    const output = await runAnalysisAgent(input, user_id, "reanalyze");
    const saved = saveAnalysisToDb(db, user_id, output);

    // Update latest profile with new analysis JSON
    db.prepare(`
      UPDATE profiles SET analysis_json = ?
      WHERE user_id = ? AND id = (SELECT MAX(id) FROM profiles WHERE user_id = ?)
    `).run(JSON.stringify(output), user_id, user_id);

    console.log(`[reanalyze] User ${user_id}: saved ${saved.internal_saved} internal, ${saved.external_saved} external traits`);
    return res.json({ saved, analysis: output });
  } catch (err: any) {
    console.error(`[reanalyze] Error for user ${user_id}:`, err);
    return res.status(500).json({ error: "Re-analysis failed: " + err.message });
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
app.post("/admin/users/:id/reset-analysis", (req, res) => {
  const user_id = parseInt(req.params.id, 10);
  if (!Number.isFinite(user_id) || user_id <= 0) {
    return res.status(400).json({ error: `Invalid user_id: ${req.params.id}` });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const result = db.transaction(() => {
    const deletedTraits = db.prepare("DELETE FROM user_traits WHERE user_id = ?").run(user_id);
    const deletedLookTraits = db.prepare("DELETE FROM user_look_traits WHERE user_id = ?").run(user_id);
    const clearedProfiles = db.prepare("UPDATE profiles SET analysis_json = '{}' WHERE user_id = ?").run(user_id);
    return {
      deleted_traits: deletedTraits.changes,
      deleted_look_traits: deletedLookTraits.changes,
      cleared_profiles: clearedProfiles.changes,
    };
  })();

  console.log(`[reset-analysis] User ${user_id}: deleted ${result.deleted_traits} traits, ${result.deleted_look_traits} look traits, cleared ${result.cleared_profiles} profiles`);
  return res.json(result);
});

// GET /admin/users/:id/matches — Actual matches for a specific user (from matches table)
app.get("/admin/users/:id/matches", (req, res) => {
  const rows = db.prepare(`
    SELECT m.id, m.match_score, m.status, m.user1_id, m.user2_id,
      m.user1_rating, m.user2_rating,
      u.id as other_id, u.first_name as other_name,
      u1.pickiness_score as user1_pickiness,
      u2.pickiness_score as user2_pickiness
    FROM matches m
    JOIN users u ON u.id = CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    WHERE m.user1_id = ? OR m.user2_id = ?
    ORDER BY m.final_match_priority DESC
  `).all(req.params.id, req.params.id, req.params.id);
  return res.json(rows);
});

// GET /admin/users/:id/candidate-matches — Matches for a specific user
app.get("/admin/users/:id/candidate-matches", (req, res) => {
  const rows = db.prepare(`
    SELECT cm.*, u.id as other_id, u.first_name as other_name, u.age as other_age, u.city as other_city,
      m.status as match_status, m.pair_priority, m.final_match_priority
    FROM candidate_matches cm
    JOIN users u ON u.id = CASE WHEN cm.user_id = ? THEN cm.candidate_user_id ELSE cm.user_id END
    LEFT JOIN matches m ON (m.user1_id = cm.user_id AND m.user2_id = cm.candidate_user_id)
                        OR (m.user1_id = cm.candidate_user_id AND m.user2_id = cm.user_id)
    WHERE cm.user_id = ? OR cm.candidate_user_id = ?
    ORDER BY cm.final_score DESC
  `).all(req.params.id, req.params.id, req.params.id);
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

app.post("/matches/:id/rate", (req, res) => {
  const { user_id, rating } = req.body;

  if (!user_id || !rating) {
    return res.status(400).json({ error: "user_id and rating are required" });
  }
  if (!VALID_RATINGS.has(rating)) {
    return res.status(400).json({ error: "rating must be miss, possible, or bullseye" });
  }

  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });

  if (match.user1_id !== user_id && match.user2_id !== user_id) {
    return res.status(403).json({ error: "User is not part of this match" });
  }

  if (match.status !== "waiting_first_rating" && match.status !== "waiting_second_rating") {
    return res.status(400).json({ error: `Cannot rate a match in status '${match.status}'` });
  }

  // Determine first and second rater based on pickiness_score.
  // Higher pickiness = rates first. Tie or nulls → user1 goes first.
  const u1 = db.prepare("SELECT id, pickiness_score FROM users WHERE id = ?").get(match.user1_id) as any;
  const u2 = db.prepare("SELECT id, pickiness_score FROM users WHERE id = ?").get(match.user2_id) as any;
  const p1 = u1.pickiness_score ?? 0;
  const p2 = u2.pickiness_score ?? 0;
  const firstRaterId = p2 > p1 ? match.user2_id : match.user1_id;
  const secondRaterId = firstRaterId === match.user1_id ? match.user2_id : match.user1_id;

  // Column to store this rating (user1_rating or user2_rating)
  const ratingCol = user_id === match.user1_id ? "user1_rating" : "user2_rating";

  if (match.status === "waiting_first_rating") {
    if (user_id !== firstRaterId) {
      return res.status(400).json({ error: "Waiting for the other user to rate first (higher pickiness)" });
    }

    const newStatus = rating === "miss" ? "rejected_by_users" : "waiting_second_rating";
    db.prepare(`
      UPDATE matches SET status = ?, ${ratingCol} = ?, updated_at = datetime('now') WHERE id = ?
    `).run(newStatus, rating, match.id);

    return res.json({ match_id: match.id, new_status: newStatus, rated_by: user_id });
  }

  // waiting_second_rating
  if (user_id !== secondRaterId) {
    return res.status(400).json({ error: "Waiting for the other user to rate" });
  }

  const newStatus = rating === "miss" ? "rejected_by_users" : "approved_by_both";
  db.prepare(`
    UPDATE matches SET status = ?, ${ratingCol} = ?, updated_at = datetime('now') WHERE id = ?
  `).run(newStatus, rating, match.id);

  return res.json({ match_id: match.id, new_status: newStatus, rated_by: user_id });
});

// GET /admin/candidate-matches — View candidate match array with priority data
app.get("/admin/candidate-matches", (_req, res) => {
  const rows = db.prepare(`
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
    ORDER BY cm.final_score DESC
  `).all();
  return res.json(rows);
});

// ════════════════════════════════════════════════════════════════
// MATCH LIFECYCLE — Send / Cancel final matches
// ════════════════════════════════════════════════════════════════

// POST /admin/matches/:id/send — Mark a match as sent/revealed to both users
// This is the ONLY action that stops the waiting counter.
app.post("/admin/matches/:id/send", (req, res) => {
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });

  if (match.status === "in_match") {
    return res.status(400).json({ error: "Match is already active" });
  }

  db.transaction(() => {
    // Transition match to in_match
    db.prepare(`
      UPDATE matches SET status = 'in_match', updated_at = datetime('now') WHERE id = ?
    `).run(match.id);

    // Both users: stop waiting (waiting_since = NULL), set user_status = in_match
    db.prepare(`
      UPDATE users SET waiting_since = NULL, user_status = 'in_match', updated_at = datetime('now')
      WHERE id IN (?, ?)
    `).run(match.user1_id, match.user2_id);
  })();

  return res.json({ success: true, match_id: match.id, status: "in_match" });
});

// POST /admin/matches/:id/cancel — Cancel a match in pre_match or in_match
//
// On cancellation:
//   1. Match status → cancelled
//   2. Both users → waiting_match, waiting_since = now
//   3. Frozen matches involving either user are restored to their previous_status
//      (the status they had before being frozen by this match's selection run)

app.post("/admin/matches/:id/cancel", (req, res) => {
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: "Match not found" });

  if (match.status !== "pre_match" && match.status !== "in_match") {
    return res.status(400).json({ error: `Can only cancel matches in pre_match or in_match, current status is '${match.status}'` });
  }

  let unfrozen = 0;

  db.transaction(() => {
    // 1. Cancel the match
    db.prepare(`
      UPDATE matches SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
    `).run(match.id);

    // 2. Restore both users to waiting state
    db.prepare(`
      UPDATE users SET user_status = 'waiting_match', waiting_since = datetime('now'), updated_at = datetime('now')
      WHERE id IN (?, ?)
    `).run(match.user1_id, match.user2_id);

    // 3. Unfreeze competing matches for both users.
    //    Restore frozen matches where either cancelled user is involved
    //    and previous_status was saved.
    const frozenMatches = db.prepare(`
      SELECT id, previous_status FROM matches
      WHERE status = 'frozen'
        AND previous_status IS NOT NULL
        AND (user1_id IN (?, ?) OR user2_id IN (?, ?))
    `).all(match.user1_id, match.user2_id, match.user1_id, match.user2_id) as { id: number; previous_status: string }[];

    const restoreStmt = db.prepare(`
      UPDATE matches SET status = ?, previous_status = NULL, updated_at = datetime('now') WHERE id = ?
    `);

    for (const fm of frozenMatches) {
      restoreStmt.run(fm.previous_status, fm.id);
      unfrozen++;
    }
  })();

  return res.json({ success: true, match_id: match.id, status: "cancelled", unfrozen });
});

// GET /admin/users/:id/waiting — Get waiting days for a specific user
app.get("/admin/users/:id/waiting", (req, res) => {
  const user = db.prepare("SELECT waiting_since, user_status FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  let waiting_days = 0;
  if (user.waiting_since) {
    const ms = Date.now() - new Date(user.waiting_since + "Z").getTime();
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
app.get("/users", (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.first_name as name, u.email, u.created_at,
      p.raw_answer, p.analysis_json, p.created_at as profile_created_at
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();

  const result = (users as any[]).map((u) => ({
    ...u,
    analysis: u.analysis_json ? JSON.parse(u.analysis_json) : null,
  }));

  return res.json(result);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
