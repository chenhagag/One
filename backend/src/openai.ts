import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
import { trackTokens } from "./tokenTracker";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ProfileAnalysis {
  intelligence_score: number;
  emotional_depth_score: number;
  social_style: "introverted" | "balanced" | "extroverted";
  relationship_goal: "casual" | "serious" | "unsure";
}

export async function analyzeAnswer(answer: string): Promise<ProfileAnalysis> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a relationship analyst. Given a user's answer about what they are looking for in a partner, return a JSON object with exactly these fields:
- intelligence_score: number 1-10 (based on vocabulary, complexity of thought)
- emotional_depth_score: number 1-10 (based on emotional awareness expressed)
- social_style: one of "introverted", "balanced", "extroverted" (inferred from what they describe)
- relationship_goal: one of "casual", "serious", "unsure"

Return ONLY valid JSON. No explanation, no markdown, no extra text.`,
      },
      {
        role: "user",
        content: `User's answer: "${answer}"`,
      },
    ],
    temperature: 0.3,
  });

  trackTokens(null, "legacy_analyze", "gpt-4o-mini", response.usage);

  const raw = response.choices[0].message.content || "{}";

  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json|```/g, "").trim();

  const parsed = JSON.parse(cleaned);
  return parsed as ProfileAnalysis;
}
