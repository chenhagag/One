import fs from "fs";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";
import { trackTokens } from "../../tokenTracker";
import type {
  AnalysisAgentInput,
  AnalysisAgentOutput,
  InternalTraitAssessment,
  ExternalTraitAssessment,
} from "./types";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Load prompts from files ─────────────────────────────────────

const PROMPTS_DIR = path.join(__dirname, "prompts");

function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf-8");
}

// Prompts are loaded fresh each call so edits take effect without restart
function getSystemPrompt(): string { return loadPrompt("system.txt"); }
function getUserTemplate(): string { return loadPrompt("user-template.txt"); }

// ── Build the user message from input ───────────────────────────

function buildUserMessage(input: AnalysisAgentInput): string {
  let msg = getUserTemplate();

  msg = msg.replace("{{transcript}}", input.transcript);

  const internalDefs = input.internal_trait_definitions
    .map(
      (t) =>
        `- ID ${t.id}: ${t.internal_name} (${t.display_name_en}) — ${t.ai_description || "no description"} ` +
        `[weight: ${t.weight}, sensitivity: ${t.sensitivity}, calc_type: ${t.calc_type}, required_confidence: ${t.required_confidence}]`
    )
    .join("\n");
  msg = msg.replace("{{internal_trait_definitions}}", internalDefs);

  const externalDefs = input.external_trait_definitions
    .map(
      (t) =>
        `- ID ${t.id}: ${t.internal_name} (${t.display_name_en}) — ` +
        `source: ${t.source}, weight: ${t.weight}, sensitivity: ${t.sensitivity}` +
        (t.possible_values ? `, values: [${t.possible_values.join(", ")}]` : "")
    )
    .join("\n");
  msg = msg.replace("{{external_trait_definitions}}", externalDefs);

  if (input.existing_profile) {
    msg = msg.replace(
      "{{existing_profile}}",
      JSON.stringify(input.existing_profile, null, 2)
    );
  } else {
    msg = msg.replace("{{existing_profile}}", "No existing profile. This is a new user.");
  }

  msg = msg.replace("{{internal_total}}", String(input.internal_trait_definitions.length));
  msg = msg.replace("{{external_total}}", String(input.external_trait_definitions.length));

  return msg;
}

// ── Validation ──────────────────────────────────────────────────

// Trait ID lookup maps — populated before validation
let internalIdToName = new Map<number, string>();
let externalIdToName = new Map<number, string>();

function setTraitLookups(
  internalDefs: { id: number; internal_name: string }[],
  externalDefs: { id: number; internal_name: string }[]
) {
  internalIdToName = new Map(internalDefs.map((d) => [d.id, d.internal_name]));
  externalIdToName = new Map(externalDefs.map((d) => [d.id, d.internal_name]));
}

function validateInternalTrait(t: any): InternalTraitAssessment | null {
  // Accept trait_id or id
  let traitId = t.trait_id ?? t.id;

  // Fallback: resolve trait_id from internal_name if model forgot to include the ID
  if (typeof traitId !== "number" && t.internal_name) {
    for (const [id, name] of internalIdToName) {
      if (name === t.internal_name) { traitId = id; break; }
    }
  }

  if (typeof traitId !== "number") return null;
  if (typeof t.score !== "number" || t.score < 0 || t.score > 100) return null;
  if (typeof t.confidence !== "number" || t.confidence < 0 || t.confidence > 1) return null;

  const name = t.internal_name ?? internalIdToName.get(traitId) ?? `trait_${traitId}`;

  return {
    trait_id: traitId,
    internal_name: name,
    score: Math.round(t.score * 100) / 100,
    confidence: Math.round(t.confidence * 100) / 100,
    weight_for_match: t.weight_for_match != null ? Math.round(t.weight_for_match * 100) / 100 : null,
    weight_confidence: t.weight_confidence != null ? Math.round(t.weight_confidence * 100) / 100 : null,
    source: "ai",
  };
}

// Map of possible_values keywords → external trait internal_name for fuzzy matching
let externalNameToId = new Map<string, number>();
let externalPossibleValues = new Map<number, string[]>(); // trait_id → possible values

// Synonyms that map natural language to trait internal_name.
// These catch common user expressions that don't appear in possible_values.
const EXTERNAL_TRAIT_SYNONYMS: Record<string, string[]> = {
  body_type: [
    "sturdy", "broad", "solid", "strong", "built", "buff", "beefy",
    "athletic", "fit", "lean", "petite", "curvy", "thick", "big",
    "skinny", "heavy", "stocky", "lanky", "bulky", "ripped",
    "masculine build", "has presence", "well-built",
  ],
  skin_color: [
    "tan", "tanned", "dark-skinned", "pale", "fair", "olive", "brown",
  ],
  height: [
    "tall", "short", "average height",
  ],
  gender_expression: [
    "masculine", "feminine", "androgynous", "manly", "womanly", "butch", "femme",
  ],
  look_style: [
    "sporty", "elegant", "casual", "hipster", "groomed", "natural",
  ],
  grooming_level: [
    "well-groomed", "scruffy", "polished", "clean-cut", "rugged",
  ],
};

function setExternalPossibleValues(defs: { id: number; internal_name: string; possible_values?: string[] | null }[]) {
  externalNameToId = new Map(defs.map(d => [d.internal_name, d.id]));
  externalPossibleValues = new Map();
  for (const d of defs) {
    // Combine DB possible_values with synonym list for this trait
    const dbVals = (d.possible_values && Array.isArray(d.possible_values))
      ? d.possible_values.map(v => String(v).toLowerCase())
      : [];
    const synonyms = (EXTERNAL_TRAIT_SYNONYMS[d.internal_name] || []).map(s => s.toLowerCase());
    const combined = [...new Set([...dbVals, ...synonyms])];
    if (combined.length > 0) {
      externalPossibleValues.set(d.id, combined);
    }
  }
}

function guessExternalTraitId(t: any): number | null {
  // Try trait_id / id first
  const directId = t.trait_id ?? t.id;
  if (typeof directId === "number") return directId;

  // Try internal_name match
  if (t.internal_name) {
    const id = externalNameToId.get(t.internal_name);
    if (id != null) return id;
    // Try partial match
    for (const [name, id] of externalNameToId) {
      if (t.internal_name.toLowerCase().includes(name) || name.includes(t.internal_name.toLowerCase())) return id;
    }
  }

  // Match desired_value or personal_value against possible_values + synonyms
  const valuesToCheck = [t.desired_value, t.personal_value].filter(Boolean).map((v: any) => String(v).toLowerCase().trim());
  for (const val of valuesToCheck) {
    for (const [traitId, possibleVals] of externalPossibleValues) {
      if (possibleVals.some(pv => pv === val || pv.includes(val) || val.includes(pv))) return traitId;
    }
  }

  return null;
}

function validateExternalTrait(t: any): ExternalTraitAssessment | null {
  const traitId = guessExternalTraitId(t);

  if (typeof traitId !== "number") return null;

  // At least one value must be present
  if (t.personal_value == null && t.desired_value == null) return null;

  const name = t.internal_name ?? externalIdToName.get(traitId) ?? `look_trait_${traitId}`;

  let personalValue = t.personal_value ?? null;
  let personalConfidence = t.personal_value_confidence != null
    ? Math.round(t.personal_value_confidence * 100) / 100
    : null;

  const desiredValue = t.desired_value ?? null;
  const desiredConfidence = t.desired_value_confidence != null
    ? Math.round(t.desired_value_confidence * 100) / 100
    : null;

  // Post-processing guard: if personal_value looks like it was mirrored from desired_value
  // (same or very similar value + similar confidence), strip it.
  // The model often incorrectly infers "user IS X" from "user WANTS X in a partner".
  if (personalValue != null && desiredValue != null) {
    const pv = String(personalValue).toLowerCase().trim();
    const dv = String(desiredValue).toLowerCase().trim();
    const confDiff = Math.abs((personalConfidence ?? 0) - (desiredConfidence ?? 0));
    // If values are identical/similar and confidence is within 0.15, it's likely mirrored
    if ((pv === dv || pv.includes(dv) || dv.includes(pv)) && confDiff <= 0.15) {
      console.log(`[validateExternalTrait] Stripped mirrored personal_value="${personalValue}" from ${name} (matched desired_value="${desiredValue}")`);
      personalValue = null;
      personalConfidence = null;
    }
  }

  // After stripping, still need at least one value
  if (personalValue == null && desiredValue == null) return null;

  return {
    trait_id: traitId,
    internal_name: name,
    personal_value: personalValue,
    personal_value_confidence: personalConfidence,
    desired_value: desiredValue,
    desired_value_confidence: desiredConfidence,
    weight_for_match: t.weight_for_match ?? null,
    weight_confidence: t.weight_confidence ?? null,
    source: "ai",
  };
}

function validateOutput(raw: any): AnalysisAgentOutput {
  const internal_traits: InternalTraitAssessment[] = [];
  const external_traits: ExternalTraitAssessment[] = [];

  const rawInternalCount = Array.isArray(raw.internal_traits) ? raw.internal_traits.length : 0;
  const rawExternalCount = Array.isArray(raw.external_traits) ? raw.external_traits.length : 0;

  // Log raw external trait structure for debugging
  if (Array.isArray(raw.external_traits) && raw.external_traits.length > 0) {
    console.log(`[validateOutput] Raw external trait sample:`, JSON.stringify(raw.external_traits[0]));
  }

  if (Array.isArray(raw.internal_traits)) {
    for (const t of raw.internal_traits) {
      const valid = validateInternalTrait(t);
      if (valid) internal_traits.push(valid);
      else console.warn(`[validateOutput] Dropped internal trait:`, JSON.stringify(t));
    }
  } else if (raw.internal_traits !== undefined) {
    console.warn(`[validateOutput] internal_traits is not an array:`, typeof raw.internal_traits);
  }

  const seenExternalIds = new Set<number>();
  if (Array.isArray(raw.external_traits)) {
    for (const t of raw.external_traits) {
      const valid = validateExternalTrait(t);
      if (valid) {
        // Deduplicate: keep first occurrence per trait_id
        if (!seenExternalIds.has(valid.trait_id)) {
          seenExternalIds.add(valid.trait_id);
          external_traits.push(valid);
        }
      } else {
        console.warn(`[validateOutput] Dropped external trait:`, JSON.stringify(t));
      }
    }
  } else if (raw.external_traits !== undefined) {
    console.warn(`[validateOutput] external_traits is not an array:`, typeof raw.external_traits);
  }

  console.log(`[validateOutput] Raw: ${rawInternalCount} internal, ${rawExternalCount} external → Valid: ${internal_traits.length} internal, ${external_traits.length} external`);

  return {
    internal_traits,
    external_traits,
    missing_traits: Array.isArray(raw.missing_traits) ? raw.missing_traits : [],
    recommended_probes: Array.isArray(raw.recommended_probes) ? raw.recommended_probes : [],
    profiling_completeness: {
      internal_assessed: internal_traits.length,
      internal_total: raw.profiling_completeness?.internal_total ?? 0,
      external_assessed: external_traits.length,
      external_total: raw.profiling_completeness?.external_total ?? 0,
      coverage_pct: raw.profiling_completeness?.coverage_pct ?? 0,
      ready_for_matching: raw.profiling_completeness?.ready_for_matching ?? false,
      notes: raw.profiling_completeness?.notes ?? "",
    },
  };
}

// ── Main Agent Function ─────────────────────────────────────────

export async function runAnalysisAgent(
  input: AnalysisAgentInput,
  userId?: number | null,
  actionType: string = "analysis"
): Promise<AnalysisAgentOutput> {
  // Set up ID→name lookups for validation
  setTraitLookups(input.internal_trait_definitions, input.external_trait_definitions);
  setExternalPossibleValues(input.external_trait_definitions as any[]);

  const userMessage = buildUserMessage(input);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  trackTokens(userId ?? null, actionType, "gpt-4o-mini", response.usage);

  const raw = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw);

  console.log(`[runAnalysisAgent] Model returned JSON with keys: ${Object.keys(parsed).join(", ")}`);
  if (process.env.ANALYSIS_DEBUG) {
    console.log("\n=== RAW MODEL OUTPUT (first 2000 chars) ===");
    console.log(raw.slice(0, 2000));
  }

  return validateOutput(parsed);
}
