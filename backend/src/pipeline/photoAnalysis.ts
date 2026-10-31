/**
 * Photo Analysis — GPT-4o Vision analysis of user photos for look traits.
 *
 * Extracts 3 visual traits (numeric 0-100):
 *   appeal, fitness_aesthetic, femininity_masculinity
 *
 * Guards:
 * - Only runs with photo_ai_consent = true
 * - Never overwrites manual look traits (source = 'manual')
 * - Saves with source = 'ai'
 * - Tracks which photos were analyzed (metadata on job)
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";
import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { trackTokens } from "../tokenTracker";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const uploadsDir = process.env.NODE_ENV === "production"
  ? "/app/data/uploads"
  : path.join(__dirname, "../../uploads");

export interface PhotoAnalysisResult {
  traits_saved: number;
  traits_skipped_manual: number;
  photos_analyzed: string[];
  skipped_reason?: string;
}

// Trait definitions for the Vision prompt — only the 3 traits used in matching
const NUMERIC_TRAITS = [
  {
    name: "appeal",
    description: "Overall physical attractiveness. Use the FULL 0-100 range honestly. 50 = average-looking, and most people ARE average — do not cluster scores around 60-70. A truly stunning person = 85-95. Above average but not remarkable = 55-65. Below average = 30-45. Very unattractive = 5-20. These scores are never shown to users — accuracy matters more than kindness.",
  },
  {
    name: "fitness_aesthetic",
    description: "How physically fit the person LOOKS in the photo. Judge by visible body composition: muscle tone, low body fat, athletic build. Being slim alone is not fitness — look for signs of actual physical activity/strength. Visibly athletic/toned = 75-95. Average build, not particularly fit or unfit = 40-55. Overweight or visibly out of shape = 10-35. If body is not visible (face-only photo), estimate conservatively around 45-55.",
  },
  {
    name: "femininity_masculinity",
    description: "Feminine vs. masculine/butch appearance — calibrated for a lesbian/WW (women-seeking-women) community. This measures how traditionally feminine vs. butch/tomboyish someone LOOKS, not their identity. A woman with a standard feminine appearance (long or styled hair, makeup, feminine clothing) = 60-75. Very glamorous/hyperfeminine = 80-95. Somewhat androgynous or soft-butch (short hair but still feminine features/clothing) = 40-55. Distinctly butch/tomboyish (short hair, masculine clothing, no makeup, masculine presentation) = 15-35. 0 = very masculine/butch, 100 = very feminine/glamorous.",
  },
];

export async function analyzeUserPhotos(
  userId: number,
  jobId?: number
): Promise<PhotoAnalysisResult> {
  // ── Precondition: consent ──────────────────────────────────────
  const user = await pgQueryOne<{ photo_ai_consent: boolean | null; gender: string | null }>(
    "SELECT photo_ai_consent, gender FROM users WHERE id = $1",
    [userId]
  );
  if (!user) {
    return { traits_saved: 0, traits_skipped_manual: 0, photos_analyzed: [], skipped_reason: "user_not_found" };
  }
  if (!user.photo_ai_consent) {
    return { traits_saved: 0, traits_skipped_manual: 0, photos_analyzed: [], skipped_reason: "no_consent" };
  }

  // ── Precondition: photos exist ─────────────────────────────────
  const photos = await pgQueryAll<{ id: number; filename: string }>(
    "SELECT id, filename FROM user_photos WHERE user_id = $1 ORDER BY id ASC LIMIT 4",
    [userId]
  );
  if (!photos.length) {
    return { traits_saved: 0, traits_skipped_manual: 0, photos_analyzed: [], skipped_reason: "no_photos" };
  }

  // ── Read photos and encode as base64 ───────────────────────────
  const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  const analyzedPhotos: string[] = [];

  for (const photo of photos) {
    const filePath = path.join(uploadsDir, photo.filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[photoAnalysis] User ${userId}: photo file missing: ${filePath}`);
      continue;
    }

    const data = fs.readFileSync(filePath);
    const base64 = data.toString("base64");
    const ext = path.extname(photo.filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

    imageContents.push({
      type: "image_url",
      image_url: {
        url: `data:${mime};base64,${base64}`,
        detail: "auto", // Let GPT choose resolution for better accuracy
      },
    });
    analyzedPhotos.push(photo.filename);
  }

  if (!imageContents.length) {
    return { traits_saved: 0, traits_skipped_manual: 0, photos_analyzed: [], skipped_reason: "no_readable_photos" };
  }

  // ── Build GPT-4o Vision prompt ─────────────────────────────────
  const numericDesc = NUMERIC_TRAITS.map(t =>
    `"${t.name}": integer 0-100. ${t.description}`
  ).join("\n\n");

  const systemPrompt = `You are a visual trait assessor for a matchmaking system. Analyze the provided photos of ONE person and return a JSON object.

These scores are used internally for compatibility matching — they are NEVER shown to users. Accuracy is critical. Do NOT be generous or flattering.

## Scoring principles:
- Use the FULL 0-100 range. Most people should score near 50 (average). Do not cluster scores in the 55-75 "safe zone".
- A score of 50 is not an insult — it means average, which is where most people fall.
- Look at ALL provided photos together to form your assessment.
- If body is not visible (face-only photos), note this in your estimate for fitness.

## Traits to assess (integer 0-100):
${numericDesc}

## Verification fields (CRITICAL — answer honestly):
"is_real_photo": boolean — true if real photos of a real person (not stock, memes, objects, landscapes).
"is_adult": boolean — true if person appears 18+.
"apparent_gender": "male" | "female" | "unclear"
"is_ai_generated": boolean — true if photos appear AI-generated.
"verification_notes": string — brief note if anything seems off. Empty string if normal.

Return ONLY valid JSON. No markdown, no explanation.`;

  // ── Call GPT-4o Vision ─────────────────────────────────────────
  console.log(`[photoAnalysis] User ${userId}: analyzing ${imageContents.length} photos...`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this person's visual traits:" },
          ...imageContents,
        ],
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: "json_object" },
  });

  if (response.usage) {
    trackTokens(userId, "photo_analysis", "gpt-4o", response.usage as any);
  }

  const raw = response.choices[0]?.message?.content || "{}";
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse photo analysis response: ${raw.slice(0, 200)}`);
  }

  // ── Check verification flags ───────────────────────────────────
  const photoFlags: Record<string, any> = {};
  let hasConcerns = false;

  if (parsed.is_real_photo === false) {
    photoFlags.not_real_photo = true;
    hasConcerns = true;
  }
  if (parsed.is_adult === false) {
    photoFlags.appears_minor = true;
    hasConcerns = true;
  }
  if (parsed.is_ai_generated === true) {
    photoFlags.ai_generated = true;
    hasConcerns = true;
  }
  if (parsed.apparent_gender && user.gender) {
    const genderMap: Record<string, string> = { man: "male", woman: "female" };
    if (parsed.apparent_gender !== "unclear" && genderMap[user.gender] && parsed.apparent_gender !== genderMap[user.gender]) {
      photoFlags.gender_mismatch = true;
      photoFlags.apparent_gender = parsed.apparent_gender;
      photoFlags.registered_gender = user.gender;
      hasConcerns = true;
    }
  }
  if (parsed.verification_notes && parsed.verification_notes.trim()) {
    photoFlags.notes = parsed.verification_notes.trim();
  }

  if (hasConcerns || Object.keys(photoFlags).length > 0) {
    await pgQueryOne(
      "UPDATE users SET photo_flags = $1, updated_at = NOW() WHERE id = $2",
      [JSON.stringify(photoFlags), userId]
    );
    console.warn(`[photoAnalysis] User ${userId}: ⚠️ Photo concerns detected:`, photoFlags);
  } else {
    // Clear old flags if any
    await pgQueryOne(
      "UPDATE users SET photo_flags = NULL, updated_at = NOW() WHERE id = $1",
      [userId]
    );
  }

  // ── Load trait definitions ─────────────────────────────────────
  const traitDefs = await pgQueryAll<{ id: number; internal_name: string }>(
    "SELECT id, internal_name FROM look_trait_definitions WHERE is_active = TRUE",
    []
  );
  const defMap = new Map(traitDefs.map(d => [d.internal_name, d.id]));

  // ── Check existing manual traits ───────────────────────────────
  const manualTraits = await pgQueryAll<{ look_trait_definition_id: number }>(
    "SELECT look_trait_definition_id FROM user_look_traits WHERE user_id = $1 AND source = 'manual'",
    [userId]
  );
  const manualSet = new Set(manualTraits.map(t => t.look_trait_definition_id));

  // ── Save traits ────────────────────────────────────────────────
  let saved = 0;
  let skippedManual = 0;

  const allTraitNames = NUMERIC_TRAITS.map(t => t.name);

  for (const traitName of allTraitNames) {
    const defId = defMap.get(traitName);
    if (!defId) {
      console.warn(`[photoAnalysis] User ${userId}: trait definition not found: ${traitName}`);
      continue;
    }

    // Skip if manual trait exists
    if (manualSet.has(defId)) {
      skippedManual++;
      continue;
    }

    const value = parsed[traitName];
    if (value === undefined || value === null) continue;

    const personalValue = String(value);
    const confidence = 0.75;

    // Upsert with manual-source guard (belt + suspenders with the Set check above)
    await pgQueryAll(
      `INSERT INTO user_look_traits (user_id, look_trait_definition_id, personal_value, personal_value_confidence, source)
       VALUES ($1, $2, $3, $4, 'ai')
       ON CONFLICT (user_id, look_trait_definition_id) DO UPDATE SET
         personal_value = EXCLUDED.personal_value,
         personal_value_confidence = EXCLUDED.personal_value_confidence,
         source = 'ai',
         updated_at = NOW()
       WHERE user_look_traits.source != 'manual'`,
      [userId, defId, personalValue, confidence]
    );
    saved++;
  }

  // ── Update job metadata with analysis details ──────────────────
  if (jobId) {
    await pgQueryAll(
      `UPDATE pipeline_jobs SET metadata = $1 WHERE id = $2`,
      [JSON.stringify({
        photos_analyzed: analyzedPhotos,
        analyzed_at: new Date().toISOString(),
        model: "gpt-4o",
        traits_saved: saved,
        traits_skipped_manual: skippedManual,
        raw_output: parsed,
      }), jobId]
    );
  }

  console.log(`[photoAnalysis] User ${userId}: saved ${saved} traits, skipped ${skippedManual} manual, from ${analyzedPhotos.length} photos`);

  return {
    traits_saved: saved,
    traits_skipped_manual: skippedManual,
    photos_analyzed: analyzedPhotos,
  };
}
