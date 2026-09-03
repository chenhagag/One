require("dotenv").config();
// Override to production DB
process.env.DATABASE_URL = "postgresql://postgres:ZWbozClRQOUwUZqoUaqQvPHstweWnzGY@nozomi.proxy.rlwy.net:32470/railway";
const { runSingleGroupAnalysis } = require("./dist/agents/analysis/agent");
const { buildAnalysisTranscript } = require("./dist/agents/conversation/analysisHelpers");

const userIds = [16, 23, 142, 150];

async function run() {
  for (const uid of userIds) {
    try {
      const transcript = await buildAnalysisTranscript(null, uid);
      if (!transcript || transcript.trim().length === 0) {
        console.log("[" + uid + "] No transcript, skipping");
        continue;
      }
      console.log("[" + uid + "] Running style analysis...");
      const result = await runSingleGroupAnalysis("style", transcript, uid);
      console.log("[" + uid + "] Done — " + result.internal_saved + " traits saved");
    } catch (err) {
      console.error("[" + uid + "] Error:", err.message);
    }
  }
  console.log("All done!");
  process.exit(0);
}

run();
