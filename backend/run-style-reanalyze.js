require("dotenv").config();
const { runSingleGroupAnalysis } = require("./dist/agents/analysis/agent");
const { buildAnalysisTranscript } = require("./dist/agents/conversation/analysisHelpers");

const userIds = [8, 14, 16, 17, 18, 22, 23, 24, 25, 58, 95, 97, 117, 120, 130, 133, 136, 137, 145, 149];

async function run() {
  for (const uid of userIds) {
    try {
      const transcript = await buildAnalysisTranscript(null, uid);
      if (!transcript || transcript.trim().length === 0) {
        console.log(`[${uid}] No transcript, skipping`);
        continue;
      }
      console.log(`[${uid}] Running style analysis...`);
      const result = await runSingleGroupAnalysis("style", transcript, uid);
      console.log(`[${uid}] Done — ${result.internal_saved} traits saved`);
    } catch (err) {
      console.error(`[${uid}] Error:`, err.message);
    }
  }
  console.log("All done!");
  process.exit(0);
}

run();
