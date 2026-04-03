import fs from "fs";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPTS_DIR = path.join(__dirname, "prompts");

function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf-8");
}

export interface ConversationContext {
  user_name: string;
  user_age?: number | null;
  user_gender?: string | null;
  user_city?: string | null;
  conversation_history: string;  // formatted "User: ...\nAssistant: ...\n"
  turn_number: number;
  stage: "early" | "middle" | "later" | "closing";
  coverage_pct: number;
  guidance_block: string;         // compact text from orchestrator
}

export async function runConversationAgent(ctx: ConversationContext): Promise<string> {
  const systemPrompt = loadPrompt("system.txt");
  let userMsg = loadPrompt("user-template.txt");

  userMsg = userMsg.replace("{{user_name}}", ctx.user_name || "there");
  userMsg = userMsg.replace("{{user_age}}", ctx.user_age ? String(ctx.user_age) : "unknown");
  userMsg = userMsg.replace("{{user_gender}}", ctx.user_gender || "unknown");
  userMsg = userMsg.replace("{{user_city}}", ctx.user_city || "unknown");
  userMsg = userMsg.replace("{{conversation_history}}", ctx.conversation_history);
  userMsg = userMsg.replace("{{turn_number}}", String(ctx.turn_number));
  userMsg = userMsg.replace("{{stage}}", ctx.stage);
  userMsg = userMsg.replace("{{coverage_pct}}", String(ctx.coverage_pct));
  userMsg = userMsg.replace("{{guidance_block}}", ctx.guidance_block);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  return response.choices[0].message.content || "";
}
