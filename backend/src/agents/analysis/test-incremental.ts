/**
 * Incremental analysis test — 3 conversation rounds for the same user.
 * Usage: npx ts-node src/agents/analysis/test-incremental.ts
 */

import db from "../../db";
import { runAnalysisAgent } from "./agent";
import { buildAnalysisInput, saveAnalysisToDb } from "./loader";
import type { AnalysisAgentOutput } from "./types";

const CHUNK_1 = `
Agent: Hey! Tell me a bit about yourself.

User: I'm Noa, 29, marketing in Tel Aviv. I go out a lot — bars, concerts, always planning stuff with friends. I'm pretty social and energetic. Family is important to me, I'm close with my parents.
`;

const CHUNK_2 = `
Agent: What about values and lifestyle?

User: I'm completely secular — wouldn't date someone religious, that's a deal breaker. I go to the gym regularly, I run on weekends. I really value emotional stability in a partner. I've had bad experiences with emotionally unstable guys. I also can't deal with immaturity — I need someone who has their life together. I love animals, I have a dog. Oh and I care about grooming — I notice when a guy takes care of himself.

Agent: Any appearance preferences?

User: I tend to like taller guys, maybe 175-180+. Not a deal breaker but a preference. I'm about 168cm myself.
`;

const CHUNK_3 = `
Agent: Let's go a bit deeper. How would you describe your political views?

User: I'm center-left, but honestly politics isn't a huge factor for me in dating unless someone is really extreme. I'm more tolerant than people think.

Agent: You mentioned being super social and outgoing. Do you need that in a partner too?

User: Actually, I've been thinking about that. I used to think I needed someone as outgoing as me, but my best relationship was actually with a more introverted guy who balanced me out. So I'm more open to that now. The energy matters more than whether they're the life of the party.

Agent: And about the religious thing — you said deal breaker. What about someone who's traditional but not religious?

User: Hmm, I might be a bit flexible on that actually. If someone does Friday dinners with family as tradition but isn't actually religious, that's fine. It's more about orthodoxy that I can't handle.
`;

// ── Test user setup ─────────────────────────────────────────────

const TEST_USER_EMAIL = "noa-incremental-test@matchme-test.dev";

function getOrCreateTestUser(): number {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(TEST_USER_EMAIL) as any;
  if (existing) {
    // Clean previous test data
    db.prepare("DELETE FROM user_traits WHERE user_id = ?").run(existing.id);
    db.prepare("DELETE FROM user_look_traits WHERE user_id = ?").run(existing.id);
    return existing.id;
  }
  const result = db.prepare(
    "INSERT INTO users (first_name, email, age, gender, city, is_real_user) VALUES (?, ?, ?, ?, ?, 0) RETURNING id"
  ).get("Noa (test)", TEST_USER_EMAIL, 29, "woman", "תל אביב") as any;
  return result.id;
}

// ── Helpers ──────────────────────────────────────────────────────

function printTraits(output: AnalysisAgentOutput) {
  console.log(`  Internal (${output.internal_traits.length}):`);
  for (const t of output.internal_traits) {
    const w = t.weight_for_match != null ? ` | PARTNER_WEIGHT: ${t.weight_for_match} (conf ${t.weight_confidence})` : "";
    console.log(`    ${t.internal_name.padEnd(25)} score=${String(t.score).padEnd(5)} conf=${t.confidence}${w}`);
  }
  console.log(`  External (${output.external_traits.length}):`);
  for (const t of output.external_traits) {
    const parts: string[] = [];
    if (t.personal_value) parts.push(`self=${t.personal_value}(${t.personal_value_confidence})`);
    if (t.desired_value) parts.push(`wants=${t.desired_value}(${t.desired_value_confidence})`);
    if (t.weight_for_match != null) parts.push(`importance=${t.weight_for_match}(${t.weight_confidence})`);
    console.log(`    ${t.internal_name.padEnd(25)} ${parts.join(" | ")}`);
  }
  console.log(`  Coverage: ${output.profiling_completeness.coverage_pct}% | Ready: ${output.profiling_completeness.ready_for_matching}`);
  console.log(`  Missing: ${output.missing_traits.length} traits`);
}

function readDbTraits(userId: number) {
  const internal = db.prepare(`
    SELECT td.internal_name, ut.score, ut.confidence, ut.weight_for_match, ut.weight_confidence
    FROM user_traits ut
    JOIN trait_definitions td ON td.id = ut.trait_definition_id
    WHERE ut.user_id = ?
    ORDER BY td.sort_order
  `).all(userId) as any[];

  const external = db.prepare(`
    SELECT ltd.internal_name, ult.personal_value, ult.personal_value_confidence,
           ult.desired_value, ult.desired_value_confidence, ult.weight_for_match, ult.weight_confidence
    FROM user_look_traits ult
    JOIN look_trait_definitions ltd ON ltd.id = ult.look_trait_definition_id
    WHERE ult.user_id = ?
    ORDER BY ltd.sort_order
  `).all(userId) as any[];

  return { internal, external };
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const userId = getOrCreateTestUser();
  console.log(`Test user ID: ${userId}\n`);

  let cumulativeTranscript = "";
  let previousOutput: AnalysisAgentOutput | null = null;

  for (const [i, chunk] of [CHUNK_1, CHUNK_2, CHUNK_3].entries()) {
    const round = i + 1;
    cumulativeTranscript += chunk;

    console.log(`${"=".repeat(60)}`);
    console.log(`ROUND ${round}`);
    console.log(`${"=".repeat(60)}`);

    const input = await buildAnalysisInput(db, cumulativeTranscript, previousOutput);
    const start = Date.now();
    const output = await runAnalysisAgent(input);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  (AI took ${elapsed}s)\n`);

    console.log("--- Agent Output ---");
    printTraits(output);

    // Save to DB
    const saved = await saveAnalysisToDb(db, userId, output);
    console.log(`\n--- Saved to DB: ${saved.internal_saved} internal, ${saved.external_saved} external ---`);

    // Read back from DB
    const dbState = readDbTraits(userId);
    console.log(`\n--- DB State (accumulated) ---`);
    console.log(`  Internal traits in DB: ${dbState.internal.length}`);
    for (const t of dbState.internal) {
      const w = t.weight_for_match != null ? ` | w=${t.weight_for_match}(${t.weight_confidence})` : "";
      console.log(`    ${t.internal_name.padEnd(25)} score=${String(t.score).padEnd(5)} conf=${t.confidence}${w}`);
    }
    console.log(`  External traits in DB: ${dbState.external.length}`);
    for (const t of dbState.external) {
      const parts: string[] = [];
      if (t.personal_value) parts.push(`self=${t.personal_value}(${t.personal_value_confidence})`);
      if (t.desired_value) parts.push(`wants=${t.desired_value}(${t.desired_value_confidence})`);
      if (t.weight_for_match != null) parts.push(`imp=${t.weight_for_match}(${t.weight_confidence})`);
      console.log(`    ${t.internal_name.padEnd(25)} ${parts.join(" | ")}`);
    }

    previousOutput = output;
    console.log("");
  }

  // Cleanup
  db.prepare("DELETE FROM user_traits WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM user_look_traits WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  console.log("Test user cleaned up.");
}

main().catch(console.error);
