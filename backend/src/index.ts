import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import db from "./db";
import { analyzeAnswer } from "./openai";
import { runStage1 } from "./matchStage1";
import { runStage2 } from "./matchStage2";

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
// AI CHAT (existing functionality)
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
// ADMIN — Data exploration endpoints
// ════════════════════════════════════════════════════════════════

// GET /admin/users — All users with registration data
app.get("/admin/users", (_req, res) => {
  const users = db.prepare(`
    SELECT u.*,
      p.raw_answer,
      p.analysis_json,
      p.created_at as profile_created_at
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `).all();

  const result = (users as any[]).map((u) => ({
    ...u,
    self_style: u.self_style ? JSON.parse(u.self_style) : null,
    analysis: u.analysis_json ? JSON.parse(u.analysis_json) : null,
  }));

  return res.json(result);
});

// GET /admin/users/:id/full — Complete user profile (user + traits + look traits + profile)
app.get("/admin/users/:id/full", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  user.self_style = user.self_style ? JSON.parse(user.self_style) : null;

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

  return res.json({
    user,
    profile: profile ? { raw_answer: profile.raw_answer, analysis: JSON.parse(profile.analysis_json), created_at: profile.created_at } : null,
    traits: traitsWithEW,
    lookTraits: lookTraitsWithEW,
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
  const stats = {
    total_users: (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c,
    users_with_profiles: (db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM profiles").get() as any).c,
    users_with_traits: (db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM user_traits").get() as any).c,
    total_trait_definitions: (db.prepare("SELECT COUNT(*) as c FROM trait_definitions").get() as any).c,
    total_look_trait_definitions: (db.prepare("SELECT COUNT(*) as c FROM look_trait_definitions").get() as any).c,
    total_matches: (db.prepare("SELECT COUNT(*) as c FROM matches").get() as any).c,
    total_config_keys: (db.prepare("SELECT COUNT(*) as c FROM config").get() as any).c,
  };
  return res.json(stats);
});

// POST /admin/run-matching — Run full matching: stage 1 (filter) then stage 2 (score)
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

// POST /admin/reset-matches — Clear all candidate matches
app.post("/admin/reset-matches", (_req, res) => {
  try {
    const deleted = db.prepare("DELETE FROM candidate_matches").run().changes;
    db.prepare("UPDATE users SET total_matches = 0, good_matches = 0").run();
    return res.json({ deleted });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/users/:id/candidate-matches — Matches for a specific user
app.get("/admin/users/:id/candidate-matches", (req, res) => {
  const rows = db.prepare(`
    SELECT cm.*, u.id as other_id, u.first_name as other_name, u.age as other_age, u.city as other_city
    FROM candidate_matches cm
    JOIN users u ON u.id = CASE WHEN cm.user_id = ? THEN cm.candidate_user_id ELSE cm.user_id END
    WHERE cm.user_id = ? OR cm.candidate_user_id = ?
    ORDER BY cm.final_score DESC
  `).all(req.params.id, req.params.id, req.params.id);
  return res.json(rows);
});

// GET /admin/candidate-matches — View candidate match array
app.get("/admin/candidate-matches", (_req, res) => {
  const rows = db.prepare(`
    SELECT cm.*,
      u1.first_name as user1_name, u1.age as user1_age, u1.city as user1_city,
      u2.first_name as user2_name, u2.age as user2_age, u2.city as user2_city
    FROM candidate_matches cm
    JOIN users u1 ON u1.id = cm.user_id
    JOIN users u2 ON u2.id = cm.candidate_user_id
    ORDER BY cm.created_at DESC
  `).all();
  return res.json(rows);
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
