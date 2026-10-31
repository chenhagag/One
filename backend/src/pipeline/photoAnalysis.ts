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
    description: `Overall physical attractiveness. These scores are never shown to users — be honest and differentiate.
Scale:
  85-95: Very attractive, striking, would stand out in a crowd
  70-84: Attractive, good-looking, pretty
  55-69: Decent-looking, above plain but not notably pretty
  40-54: Average/plain — unremarkable appearance
  25-39: Below average
  under 25: Well below average
IMPORTANT: If someone is clearly good-looking/pretty, score 70+. Do not give 60-65 to someone who is obviously attractive.`,
  },
  {
    name: "fitness_aesthetic",
    description: `How physically fit the person LOOKS based on visible body shape.
Scale:
  85-95: Very athletic, visibly muscular or extremely toned
  75-84: Clearly fit and toned, athletic build
  65-74: Slim and appears in good shape
  50-64: Slim but not particularly toned, or average build
  40-49: Average, neither fit nor unfit
  25-39: Somewhat overweight or out of shape
  under 25: Clearly overweight
IMPORTANT: A visibly slim woman with a good figure should score at least 65. If she also looks toned/fit, score 75+. If body is not visible (face-only), score 50.`,
  },
  {
    name: "femininity_masculinity",
    description: `Feminine vs. butch appearance — for a lesbian/WW community. The baseline for a typical woman is 75 (clearly feminine), NOT 50.
Scale:
  85-95: Very glamorous, hyperfeminine (heavy makeup, very styled, glamorous clothing)
  75-84: Clearly feminine — long/styled hair, makeup, feminine clothing, no ambiguity
  65-74: Feminine but understated — feminine features but casual/minimal styling
  55-64: Slightly androgynous — still reads as feminine but with some non-traditional elements
  45-54: On the border — could go either way, noticeable androgyny or 'soft lesbian' look
  35-44: Soft-butch — short hair but retains some feminine elements
  20-34: Clearly butch — masculine clothing, short hair, no makeup
  under 20: Distinctly masculine presentation
CRITICAL: A woman who looks completely, unambiguously feminine must score 75+. A woman 'on the border' who looks slightly lesbian/androgynous should score 50-60. These two MUST get different scores. Do not give both 70.`,
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
- DIFFERENTIATE. Two people who look different MUST get different scores. If you give similar scores to clearly different people, the system fails.
- Each trait has its own baseline — read the scale carefully. Femininity baseline for a regular woman is 75. Appeal 50 = plain average. Fitness depends on body.
- Use the full range described in each trait. Do NOT cluster all scores in a 10-point band.
- Look at ALL provided photos together to form your assessment.

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
    temperature: 0.1,
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
