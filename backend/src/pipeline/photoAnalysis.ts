/**
 * Photo Analysis — GPT-4o Vision analysis of user photos for look traits.
 *
 * Extracts 11 visual traits:
 *   Numeric (0-100): appeal, fitness_aesthetic, femininity_masculinity,
 *     warmth_visual, glamour, naturalness, style_polish, skin_tone_range
 *   Categorical: hair_color, eye_color, hair_type
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

// Trait definitions for the Vision prompt
const NUMERIC_TRAITS = [
  { name: "appeal", description: "Overall physical attractiveness / visual appeal. 0 = very low, 100 = very high." },
  { name: "fitness_aesthetic", description: "Apparent fitness level and body composition. 0 = no visible fitness, 100 = very athletic/fit." },
  { name: "femininity_masculinity", description: "Gender expression on a spectrum. 0 = very feminine, 100 = very masculine." },
  { name: "warmth_visual", description: "How warm, friendly, and approachable the person appears. 0 = cold/distant, 100 = very warm/inviting." },
  { name: "glamour", description: "Level of polished, glamorous appearance. 0 = casual/plain, 100 = very glamorous." },
  { name: "naturalness", description: "How natural vs. made-up the person appears. 0 = heavily styled/made-up, 100 = very natural." },
  { name: "style_polish", description: "Quality of clothing, grooming, and overall style. 0 = unkempt, 100 = impeccably styled." },
  { name: "skin_tone_range", description: "Skin tone on a light-to-dark spectrum. 0 = very light, 100 = very dark." },
];

const CATEGORICAL_TRAITS = [
  { name: "hair_color", values: ["black", "dark_brown", "brown", "light_brown", "blonde", "red", "gray", "white", "other"] },
  { name: "eye_color", values: ["brown", "dark_brown", "blue", "green", "hazel", "gray", "other"] },
  { name: "hair_type", values: ["straight", "wavy", "curly", "coily", "bald", "shaved", "other"] },
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
        detail: "low", // Cost-efficient: ~85 tokens per image
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
  ).join("\n");

  const categoricalDesc = CATEGORICAL_TRAITS.map(t =>
    `"${t.name}": one of [${t.values.map(v => `"${v}"`).join(", ")}]`
  ).join("\n");

  const systemPrompt = `You are a visual trait assessor for a matchmaking system. Analyze the provided photos of ONE person and return a JSON object with the following fields.

Be consistent and calibrated. Use the full range of each scale. These scores are used internally for compatibility matching — they are never shown to users.

## Numeric traits (integer 0-100):
${numericDesc}

## Categorical traits (string):
${categoricalDesc}

## Verification fields (CRITICAL — answer honestly):
"is_real_photo": boolean — true if these appear to be real photos of a real person (not stock photos, memes, objects, landscapes, or other non-personal content).
"is_adult": boolean — true if the person appears to be 18+ years old. false if they appear to be a child or young teenager.
"apparent_gender": "male" | "female" | "unclear" — the apparent gender of the person in the photos.
"is_ai_generated": boolean — true if the photos appear to be AI-generated (look for telltale signs: uncanny smoothness, weird hands/fingers, asymmetric earrings, distorted backgrounds, unnatural skin texture).
"verification_notes": string — brief note if anything seems off (e.g. "photos show different people", "stock photo watermark visible", "cartoon/avatar"). Empty string if everything looks normal.

Important:
- Assess based on ALL provided photos together (they show the same person).
- If a trait cannot be determined from the photos, use your best estimate.
- For femininity_masculinity, calibrate based on the person's apparent gender expression.
- The verification fields are critical for safety — be strict and honest.
- Return ONLY valid JSON. No markdown, no explanation, no wrapping.`;

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

  const allTraitNames = [...NUMERIC_TRAITS.map(t => t.name), ...CATEGORICAL_TRAITS.map(t => t.name)];

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
    const isNumeric = NUMERIC_TRAITS.some(t => t.name === traitName);
    const confidence = isNumeric ? 0.7 : 0.8;

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
