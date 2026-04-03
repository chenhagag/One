import fs from "fs";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";
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

const SYSTEM_PROMPT = loadPrompt("system.txt");
const USER_TEMPLATE = loadPrompt("user-template.txt");

// ── Build the user message from input ───────────────────────────

function buildUserMessage(input: AnalysisAgentInput): string {
  let msg = USER_TEMPLATE;

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
  const traitId = t.trait_id ?? t.id;
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

function validateExternalTrait(t: any): ExternalTraitAssessment | null {
  const traitId = t.trait_id ?? t.id;
  if (typeof traitId !== "number") return null;

  // At least one value must be present
  if (t.personal_value == null && t.desired_value == null) return null;

  const name = t.internal_name ?? externalIdToName.get(traitId) ?? `look_trait_${traitId}`;

  return {
    trait_id: traitId,
    internal_name: name,
    personal_value: t.personal_value ?? null,
    personal_value_confidence:
      t.personal_value_confidence != null
        ? Math.round(t.personal_value_confidence * 100) / 100
        : null,
    desired_value: t.desired_value ?? null,
    desired_value_confidence:
      t.desired_value_confidence != null
        ? Math.round(t.desired_value_confidence * 100) / 100
        : null,
    weight_for_match: t.weight_for_match ?? null,
    weight_confidence: t.weight_confidence ?? null,
    source: "ai",
  };
}

function validateOutput(raw: any): AnalysisAgentOutput {
  const internal_traits: InternalTraitAssessment[] = [];
  const external_traits: ExternalTraitAssessment[] = [];

  if (Array.isArray(raw.internal_traits)) {
    for (const t of raw.internal_traits) {
      const valid = validateInternalTrait(t);
      if (valid) internal_traits.push(valid);
    }
  }

  if (Array.isArray(raw.external_traits)) {
    for (const t of raw.external_traits) {
      const valid = validateExternalTrait(t);
      if (valid) external_traits.push(valid);
    }
  }

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
  input: AnalysisAgentInput
): Promise<AnalysisAgentOutput> {
  // Set up ID→name lookups for validation
  setTraitLookups(input.internal_trait_definitions, input.external_trait_definitions);

  const userMessage = buildUserMessage(input);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw);

  if (process.env.ANALYSIS_DEBUG) {
    console.log("\n=== RAW MODEL OUTPUT (first 2000 chars) ===");
    console.log(raw.slice(0, 2000));
  }

  return validateOutput(parsed);
}
