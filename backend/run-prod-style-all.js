require("dotenv").config();
process.env.DATABASE_URL = "postgresql://postgres:ZWbozClRQOUwUZqoUaqQvPHstweWnzGY@nozomi.proxy.rlwy.net:32470/railway";
const { runSingleGroupAnalysis } = require("./dist/agents/analysis/agent");
const { buildAnalysisTranscript } = require("./dist/agents/conversation/analysisHelpers");

const userIds = [153,154,155,158,161,163,164,165,166,167,168,169,170,173,175,176,179,180,181,182,183,188,189,190,193,199,201,202,204,205,206,207,208,209,211,212,213,214,216,219,220,221,224,225,227,228,229,231,232,234,235,237,238,239,242,244,246,247,249,250,252,256,257,260,263,264,267,268,272,275];

async function run() {
  let done = 0;
  for (const uid of userIds) {
    try {
      const transcript = await buildAnalysisTranscript(null, uid);
      if (!transcript || transcript.trim().length === 0) {
        console.log("[" + uid + "] No transcript, skipping");
        continue;
      }
      console.log("[" + uid + "] Running style analysis... (" + (++done) + "/" + userIds.length + ")");
      const result = await runSingleGroupAnalysis("style", transcript, uid);
      console.log("[" + uid + "] Done — " + result.internal_saved + " traits saved");
    } catch (err) {
      console.error("[" + uid + "] Error:", err.message);
    }
  }
  console.log("All done! " + done + " users processed");
  process.exit(0);
}

run();
