/**
 * Test runner for the analysis agent.
 * Usage: npx ts-node src/agents/analysis/test-run.ts
 */

import db from "../../db";
import { runAnalysisAgent } from "./agent";
import { buildAnalysisInput, saveAnalysisToDb } from "./loader";

const SAMPLE_TRANSCRIPT = `
Agent: Hey! Tell me a bit about yourself — what do you do, what's your life like?

User: I'm Noa, 29, I work in marketing in Tel Aviv. Pretty busy but I love it. I go out a lot — bars, restaurants, concerts. My friends say I'm the planner of the group, always organizing stuff.

Agent: Sounds fun! What about your personal side — family, values, that kind of thing?

User: Family is super important to me. I'm really close with my parents and my sister. I want that in a partner too — someone who values family, not someone who's disconnected from their roots. I'm totally secular though, and I wouldn't be comfortable with someone religious. That's kind of a deal breaker for me.

Agent: Got it. What about lifestyle — are you more of a calm/homebody type or energetic/outgoing?

User: Definitely outgoing. I need someone who can keep up with me. I'm at the gym 3 times a week, I run on weekends. I can't sit still for long. But I also appreciate a good deep conversation over wine on the balcony. I'm not one-dimensional.

Agent: What about appearance — do you have preferences for what you're looking for?

User: I don't have a strict type, but I do care about how someone presents themselves. Grooming matters — I notice if a guy takes care of himself. I guess I tend to like taller guys, but it's not a must. I'm more about the energy than specific looks.

Agent: What's something that really turns you off in a potential partner?

User: Immaturity. I can't deal with someone who acts like a kid. Also people who are closed-minded or super rigid in their views. I need someone open and curious about life. And honestly, emotional stability is huge for me. I've dated guys who were all over the place emotionally and it was exhausting.

Agent: What kind of humor do you have?

User: I love to laugh. I'm more into witty, clever humor than slapstick stuff. My friends say I'm funny but I think they're being nice. I don't take myself too seriously.
`;

async function main() {
  console.log("Building analysis input...");
  const input = await buildAnalysisInput(db, SAMPLE_TRANSCRIPT);
  console.log(
    `Loaded ${input.internal_trait_definitions.length} internal + ${input.external_trait_definitions.length} external trait definitions`
  );

  console.log("\nRunning analysis agent...");
  const start = Date.now();
  const output = await runAnalysisAgent(input);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);

  console.log("\n=== INTERNAL TRAITS ===");
  for (const t of output.internal_traits) {
    const weight = t.weight_for_match != null ? ` | partner_weight: ${t.weight_for_match} (conf: ${t.weight_confidence})` : "";
    console.log(`  ${t.internal_name}: ${t.score} (conf: ${t.confidence})${weight}`);
  }

  console.log("\n=== EXTERNAL TRAITS ===");
  for (const t of output.external_traits) {
    const parts = [];
    if (t.personal_value) parts.push(`self: ${t.personal_value} (conf: ${t.personal_value_confidence})`);
    if (t.desired_value) parts.push(`wants: ${t.desired_value} (conf: ${t.desired_value_confidence})`);
    if (t.weight_for_match != null) parts.push(`importance: ${t.weight_for_match} (conf: ${t.weight_confidence})`);
    console.log(`  ${t.internal_name}: ${parts.join(" | ")}`);
  }

  console.log("\n=== MISSING TRAITS ===");
  console.log(" ", output.missing_traits.join(", ") || "(none)");

  console.log("\n=== RECOMMENDED PROBES ===");
  for (const p of output.recommended_probes) {
    console.log(`  - ${p}`);
  }

  console.log("\n=== COMPLETENESS ===");
  console.log(`  Internal: ${output.profiling_completeness.internal_assessed}/${output.profiling_completeness.internal_total}`);
  console.log(`  External: ${output.profiling_completeness.external_assessed}/${output.profiling_completeness.external_total}`);
  console.log(`  Coverage: ${output.profiling_completeness.coverage_pct}%`);
  console.log(`  Ready: ${output.profiling_completeness.ready_for_matching}`);
  console.log(`  Notes: ${output.profiling_completeness.notes}`);

  // Optionally save to a test user
  // Uncomment to test DB persistence:
  // const saved = saveAnalysisToDb(db, 1, output);
  // console.log("\nSaved to DB:", saved);

  console.log("\n=== RAW OUTPUT (for debugging) ===");
  console.log(JSON.stringify(output, null, 2));
}

main().catch(console.error);
