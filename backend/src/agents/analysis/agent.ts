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
  TraitDefinitionInput,
  LookTraitDefinitionInput,
} from "./types";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPTS_DIR = path.join(__dirname, "prompts");

function loadPrompt(filename: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf-8");
}

// ── Trait lookups ──────────────────────────────────────────────

let internalIdToName = new Map<number, string>();
let externalIdToName = new Map<number, string>();
let textTypeTraits = new Set<number>();

function setTraitLookups(
  internalDefs: { id: number; internal_name: string }[],
  externalDefs: { id: number; internal_name: string }[]
) {
  internalIdToName = new Map(internalDefs.map((d) => [d.id, d.internal_name]));
  externalIdToName = new Map(externalDefs.map((d) => [d.id, d.internal_name]));
}

function setTextTypeTraits(defs: { id: number; calc_type: string }[]) {
  textTypeTraits = new Set(defs.filter(d => d.calc_type === "text").map(d => d.id));
}

// ── External trait fuzzy matching ──────────────────────────────

let externalNameToId = new Map<string, number>();
let externalPossibleValues = new Map<number, string[]>();

const EXTERNAL_TRAIT_SYNONYMS: Record<string, string[]> = {
  body_type: ["sturdy", "broad", "solid", "strong", "built", "buff", "beefy", "athletic", "fit", "lean", "petite", "curvy", "thick", "big", "skinny", "heavy", "stocky", "lanky", "bulky", "ripped", "masculine build", "has presence", "well-built"],
  skin_color: ["tan", "tanned", "dark-skinned", "pale", "fair", "olive", "brown"],
  height: ["tall", "short", "average height"],
  gender_expression: ["masculine", "feminine", "androgynous", "manly", "womanly", "butch", "femme"],
  look_style: ["sporty", "elegant", "casual", "hipster", "groomed", "natural"],
  grooming_level: ["well-groomed", "scruffy", "polished", "clean-cut", "rugged"],
};

function setExternalPossibleValues(defs: { id: number; internal_name: string; possible_values?: string[] | null }[]) {
  externalNameToId = new Map(defs.map(d => [d.internal_name, d.id]));
  externalPossibleValues = new Map();
  for (const d of defs) {
    const dbVals = (d.possible_values && Array.isArray(d.possible_values)) ? d.possible_values.map(v => String(v).toLowerCase()) : [];
    const synonyms = (EXTERNAL_TRAIT_SYNONYMS[d.internal_name] || []).map(s => s.toLowerCase());
    const combined = [...new Set([...dbVals, ...synonyms])];
    if (combined.length > 0) externalPossibleValues.set(d.id, combined);
  }
}

// ── Trait grouping ─────────────────────────────────────────────
// Groups traits by their trait_group field (data-driven from Excel).
// Text-type traits (deal_breakers, advantages) are excluded — they go to a dedicated call.

function groupTraitsByCategory(
  traits: TraitDefinitionInput[]
): Map<string, TraitDefinitionInput[]> {
  const groups = new Map<string, TraitDefinitionInput[]>();
  for (const t of traits) {
    if (t.calc_type === "text") continue; // text traits handled separately
    const key = (t.trait_group && t.trait_group.trim()) || "כללי";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return groups;
}

// Group name → short English label for token tracking action_type
const GROUP_LABEL_EN: Record<string, string> = {
  "Cognitive Profile": "cognitive",
  "Communication Tone": "communication",
  "Big Five": "big_five",
  "Schwartz Values": "values",
  "Emotional Profile": "emotional",
  "Personal Style": "style",
  "General Info": "general",
  // Legacy Hebrew names (in case sqlite bridge still feeds them)
  "כללי": "general",
  "אורח חיים": "lifestyle",
  "וייב": "vibe",
  "פרופיל קוגנטיבי": "cognitive",
  "ערכים": "values",
  "פרופיל רגשי": "emotional",
  "סגנון": "style",
};

function groupActionLabel(groupName: string): string {
  return GROUP_LABEL_EN[groupName] || groupName.replace(/[^\w]/g, "_").substring(0, 20) || "group";
}

// ── Build a single trait block (the per-trait prompt fragment) ──

function buildTraitBlock(t: TraitDefinitionInput): string {
  const lines: string[] = [];
  lines.push(`תכונה: ${t.display_name_he || t.internal_name}`);
  lines.push(`מזהה: ${t.internal_name}`);

  if (t.ai_description) {
    const rawSections = t.ai_description.split("\n").filter((l: string) => l.trim());
    for (const s of rawSections) {
      const trimmedLine = s.trim();
      if (trimmedLine.length > 3) lines.push(trimmedLine);
    }
  }

  if (t.calc_type === "text") {
    lines.push("סוג פלט: טקסט בלבד, לא ציון מספרי");
  }

  return lines.join("\n");
}

// ── Build the user message for one group call ──

function buildGroupUserMessage(
  transcript: string,
  groupName: string,
  traits: TraitDefinitionInput[]
): string {
  const blocks = traits.map(buildTraitBlock).join("\n\n---\n\n");
  const traitNames = traits.map(t => t.internal_name).join(", ");

  return `## תמליל שיחה
${transcript}

## קבוצת תכונות: ${groupName} (${traits.length} תכונות)

${blocks}

## משימה
הערך כל אחת מ-${traits.length} התכונות בקבוצה. החזר JSON תקין.

רשימת התכונות (חובה לכלול את כולן בפלט):
${traitNames}`;
}

// ── Build the user message for the external traits call ──

function buildExternalUserMessage(
  transcript: string,
  externalDefs: LookTraitDefinitionInput[]
): string {
  const traitList = externalDefs.map((t) => {
    const vals = t.possible_values && t.possible_values.length > 0
      ? ` | ערכים מותרים: [${t.possible_values.join(", ")}]`
      : "";
    return `- ${t.internal_name} (${t.display_name_he || ""}) | משקל מערכת: ${t.weight}${vals}`;
  }).join("\n");

  return `## תמליל שיחה
${transcript}

## תכונות חיצוניות להערכה
${traitList}

## משימה
הפרד personal_value (המשתמש עצמו) מ-desired_value (פרטנר). השתמש רק בערכים מהרשימה. כלול רק תכונות שיש להן מידע. החזר JSON.`;
}

// ── Validation ──────────────────────────────────────────────────

function validateInternalTrait(t: any): InternalTraitAssessment | null {
  // Resolve trait_id from internal_name (the LLM emits internal_name only now)
  let traitId = t.trait_id ?? t.id;
  if (typeof traitId !== "number" && t.internal_name) {
    for (const [id, name] of internalIdToName) {
      if (name === t.internal_name) { traitId = id; break; }
    }
  }
  if (typeof traitId !== "number") return null;

  const name = t.internal_name ?? internalIdToName.get(traitId) ?? `trait_${traitId}`;

  // Text-type traits (deal_breakers, advantages)
  if (textTypeTraits.has(traitId)) {
    const textVal = t.text_value ?? t.value ?? (typeof t.score === "string" ? t.score : null);
    if (textVal == null) return null;
    return {
      trait_id: traitId,
      internal_name: name,
      score: 0,
      confidence: typeof t.confidence === "number" ? Math.round(t.confidence * 100) / 100 : 0.5,
      text_value: String(textVal),
      source: "ai",
    };
  }

  if (typeof t.score !== "number" || t.score < 0 || t.score > 100) return null;
  if (typeof t.confidence !== "number" || t.confidence < 0 || t.confidence > 1) return null;

  // Only allow weight_for_match for traits that explicitly define it in their definition
  const allowWeight = WEIGHT_ALLOWED_TRAITS.has(name);
  return {
    trait_id: traitId,
    internal_name: name,
    score: Math.round(t.score * 100) / 100,
    confidence: Math.round(t.confidence * 100) / 100,
    weight_for_match: allowWeight && t.weight_for_match != null ? Math.round(t.weight_for_match * 100) / 100 : null,
    weight_confidence: allowWeight && t.weight_confidence != null ? Math.round(t.weight_confidence * 100) / 100 : null,
    source: "ai",
  };
}

// Traits that explicitly allow weight_for_match output (per trait definition instruction)
const WEIGHT_ALLOWED_TRAITS = new Set([
  "cognitive_profile",
  "career_prestige",
]);

function guessExternalTraitId(t: any): number | null {
  const directId = t.trait_id ?? t.id;
  if (typeof directId === "number") return directId;
  if (t.internal_name) {
    const id = externalNameToId.get(t.internal_name);
    if (id != null) return id;
    for (const [name, id] of externalNameToId) {
      if (t.internal_name.toLowerCase().includes(name) || name.includes(t.internal_name.toLowerCase())) return id;
    }
  }
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
  if (t.personal_value == null && t.desired_value == null) return null;

  const name = t.internal_name ?? externalIdToName.get(traitId) ?? `look_trait_${traitId}`;
  let personalValue = t.personal_value ?? null;
  let personalConfidence = t.personal_value_confidence != null ? Math.round(t.personal_value_confidence * 100) / 100 : null;
  const desiredValue = t.desired_value ?? null;
  const desiredConfidence = t.desired_value_confidence != null ? Math.round(t.desired_value_confidence * 100) / 100 : null;

  // Strip mirrored personal_value (when LLM duplicates desired into personal)
  if (personalValue != null && desiredValue != null) {
    const pv = String(personalValue).toLowerCase().trim();
    const dv = String(desiredValue).toLowerCase().trim();
    const confDiff = Math.abs((personalConfidence ?? 0) - (desiredConfidence ?? 0));
    if ((pv === dv || pv.includes(dv) || dv.includes(pv)) && confDiff <= 0.15) {
      personalValue = null;
      personalConfidence = null;
    }
  }
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

// ── Single group call (one parallel branch) ─────────────────────

interface GroupCallResult {
  groupName: string;
  promptSent: string;
  rawOutput: string;
  parsed: any;
  durationMs: number;
}

async function runOneGroupCall(
  groupName: string,
  traits: TraitDefinitionInput[],
  transcript: string,
  systemPrompt: string,
  userId: number | null,
  actionType: string
): Promise<GroupCallResult> {
  const userPrompt = buildGroupUserMessage(transcript, groupName, traits);
  const start = Date.now();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.05,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const durationMs = Date.now() - start;
  trackTokens(userId, `${actionType}_${groupActionLabel(groupName)}`, "gpt-4o-mini", response.usage);

  const rawOutput = response.choices[0].message.content || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawOutput);
  } catch (err: any) {
    console.error(`[analysis] Failed to parse JSON for group "${groupName}":`, err.message);
  }

  console.log(`[analysis] Group "${groupName}" (${traits.length} traits) done in ${durationMs}ms`);
  return { groupName, promptSent: userPrompt, rawOutput, parsed, durationMs };
}

// ── Text traits call (deal_breakers, advantages) ────────────────

interface TextCallResult {
  promptSent: string;
  rawOutput: string;
  parsed: any;
  durationMs: number;
}

async function runTextTraitsCall(
  textTraits: TraitDefinitionInput[],
  transcript: string,
  userId: number | null,
  actionType: string
): Promise<TextCallResult> {
  const systemPrompt = loadPrompt("text-system.txt");
  const traitList = textTraits
    .map(t => {
      const desc = t.ai_description ? ` — ${t.ai_description.split("\n")[0].slice(0, 200)}` : "";
      return `- ${t.internal_name} (${t.display_name_he || ""})${desc}`;
    })
    .join("\n");

  const userPrompt = `## תמליל שיחה
${transcript}

## תכונות טקסטואליות לחילוץ
${traitList}

## משימה
לכל תכונה — חלץ את התוכן הרלוונטי מהשיחה. החזר JSON.`;

  const start = Date.now();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.05,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });

  const durationMs = Date.now() - start;
  trackTokens(userId, `${actionType}_text`, "gpt-4o-mini", response.usage);

  const rawOutput = response.choices[0].message.content || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawOutput);
  } catch (err: any) {
    console.error(`[analysis] Failed to parse JSON for text traits:`, err.message);
  }

  console.log(`[analysis] Text traits (${textTraits.length} traits) done in ${durationMs}ms`);
  return { promptSent: userPrompt, rawOutput, parsed, durationMs };
}

// ── External traits call ────────────────────────────────────────

interface ExternalCallResult {
  promptSent: string;
  rawOutput: string;
  parsed: any;
  durationMs: number;
}

async function runExternalCall(
  externalDefs: LookTraitDefinitionInput[],
  transcript: string,
  userId: number | null,
  actionType: string
): Promise<ExternalCallResult> {
  const systemPrompt = loadPrompt("external-system.txt");
  const userPrompt = buildExternalUserMessage(transcript, externalDefs);
  const start = Date.now();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.05,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  });

  const durationMs = Date.now() - start;
  trackTokens(userId, `${actionType}_external`, "gpt-4o-mini", response.usage);

  const rawOutput = response.choices[0].message.content || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawOutput);
  } catch (err: any) {
    console.error(`[analysis] Failed to parse JSON for external traits:`, err.message);
  }

  console.log(`[analysis] External (${externalDefs.length} traits) done in ${durationMs}ms`);
  return { promptSent: userPrompt, rawOutput, parsed, durationMs };
}

// ── Main analysis function (grouped + parallel + JSON mode) ─────

export interface AnalysisRunData {
  generated_prompt: string;
  stage_a_output: string;
  stage_b_output: AnalysisAgentOutput;
}

export async function runAnalysisAgent(
  input: AnalysisAgentInput,
  userId?: number | null,
  actionType: string = "analysis",
): Promise<AnalysisAgentOutput & { _run_data?: AnalysisRunData }> {
  setTraitLookups(input.internal_trait_definitions, input.external_trait_definitions);
  setExternalPossibleValues(input.external_trait_definitions as any[]);
  setTextTypeTraits(input.internal_trait_definitions as any[]);

  const systemPrompt = loadPrompt("group-system.txt");

  // Group internal traits by trait_group field (data-driven, excludes text traits)
  const groupedMap = groupTraitsByCategory(input.internal_trait_definitions);
  const groupList = Array.from(groupedMap.entries()).map(([name, traits]) => ({ name, traits }));

  // Text traits get their own dedicated call (different prompt structure)
  const textTraits = input.internal_trait_definitions.filter(t => t.calc_type === "text");

  console.log(
    `[analysis] Starting grouped analysis: transcript=${input.transcript.length}chars, ` +
    `${input.internal_trait_definitions.length} internal traits in ${groupList.length} groups + ${textTraits.length} text, ` +
    `${input.external_trait_definitions.length} external traits`
  );

  const overallStart = Date.now();

  // Fire all internal group calls + text + external in parallel
  const internalPromises = groupList.map(g =>
    runOneGroupCall(g.name, g.traits, input.transcript, systemPrompt, userId ?? null, actionType)
  );

  const externalPromise: Promise<ExternalCallResult | null> =
    input.external_trait_definitions.length > 0
      ? runExternalCall(input.external_trait_definitions, input.transcript, userId ?? null, actionType)
      : Promise.resolve(null);

  const textPromise: Promise<TextCallResult | null> =
    textTraits.length > 0
      ? runTextTraitsCall(textTraits, input.transcript, userId ?? null, actionType)
      : Promise.resolve(null);

  const [groupResults, externalResult, textResult] = await Promise.all([
    Promise.all(internalPromises),
    externalPromise,
    textPromise,
  ]);

  const totalDuration = Date.now() - overallStart;
  console.log(`[analysis] All parallel calls done in ${totalDuration}ms (wall time)`);

  // ── Merge results ──────────────────────────────────────────────
  const internal_traits: InternalTraitAssessment[] = [];
  const missing_traits_set = new Set<string>();
  const recommended_probes_set = new Set<string>();

  for (const gr of groupResults) {
    if (Array.isArray(gr.parsed.internal_traits)) {
      for (const t of gr.parsed.internal_traits) {
        const valid = validateInternalTrait(t);
        if (valid) internal_traits.push(valid);
      }
    }
    if (Array.isArray(gr.parsed.missing_traits)) {
      for (const m of gr.parsed.missing_traits) missing_traits_set.add(String(m));
    }
    if (Array.isArray(gr.parsed.recommended_probes)) {
      for (const p of gr.parsed.recommended_probes) recommended_probes_set.add(String(p));
    }
  }

  // Merge text traits into internal_traits
  if (textResult && Array.isArray(textResult.parsed.text_traits)) {
    for (const t of textResult.parsed.text_traits) {
      if (!t.text_value) continue; // skip null text values
      const valid = validateInternalTrait({
        internal_name: t.internal_name,
        text_value: t.text_value,
        confidence: t.confidence ?? 0.5,
      });
      if (valid) internal_traits.push(valid);
    }
  }

  // Merge external traits (dedupe by trait_id)
  const external_traits: ExternalTraitAssessment[] = [];
  if (externalResult && Array.isArray(externalResult.parsed.external_traits)) {
    const seen = new Set<number>();
    for (const t of externalResult.parsed.external_traits) {
      const valid = validateExternalTrait(t);
      if (valid && !seen.has(valid.trait_id)) {
        seen.add(valid.trait_id);
        external_traits.push(valid);
      }
    }
  }

  const totalInternal = input.internal_trait_definitions.length;
  const result: AnalysisAgentOutput = {
    internal_traits,
    external_traits,
    missing_traits: Array.from(missing_traits_set),
    recommended_probes: Array.from(recommended_probes_set).slice(0, 5),
    profiling_completeness: {
      internal_assessed: internal_traits.length,
      internal_total: totalInternal,
      external_assessed: external_traits.length,
      external_total: input.external_trait_definitions.length,
      coverage_pct: totalInternal > 0 ? Math.round((internal_traits.length / totalInternal) * 100) : 0,
      ready_for_matching: false,
      notes: `Grouped analysis: ${groupList.length} groups + ${externalResult ? 1 : 0} external, ${totalDuration}ms wall time`,
    },
  };

  console.log(
    `[analysis] Final: ${result.internal_traits.length}/${totalInternal} internal, ` +
    `${result.external_traits.length}/${input.external_trait_definitions.length} external`
  );

  // ── Build run data for persistence (admin debug view) ──────────
  const promptParts = groupResults.map(gr => `=== ${gr.groupName} ===\n${gr.promptSent}`).join("\n\n");
  const textPromptPart = textResult ? `\n\n=== text ===\n${textResult.promptSent}` : "";
  const externalPromptPart = externalResult ? `\n\n=== external ===\n${externalResult.promptSent}` : "";
  const outputParts = groupResults
    .map(gr => `=== ${gr.groupName} (${gr.durationMs}ms) ===\n${gr.rawOutput}`)
    .join("\n\n");
  const textOutputPart = textResult ? `\n\n=== text (${textResult.durationMs}ms) ===\n${textResult.rawOutput}` : "";
  const externalOutputPart = externalResult
    ? `\n\n=== external (${externalResult.durationMs}ms) ===\n${externalResult.rawOutput}`
    : "";

  const runData: AnalysisRunData = {
    generated_prompt: promptParts + textPromptPart + externalPromptPart,
    stage_a_output: outputParts + textOutputPart + externalOutputPart,
    // Use a plain copy to avoid circular reference (result._run_data.stage_b_output → result)
    stage_b_output: JSON.parse(JSON.stringify(result)),
  };

  return Object.assign(result, { _run_data: runData });
}
