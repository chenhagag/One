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
  "MBTI": "mbti",
  "MBTI Test": "mbti",
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
  "analytical_reasoning",
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
  actionType: string,
  model: string = "gpt-4o"
): Promise<GroupCallResult> {
  const userPrompt = buildGroupUserMessage(transcript, groupName, traits);
  const start = Date.now();

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.05,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const durationMs = Date.now() - start;
  trackTokens(userId, `${actionType}_${groupActionLabel(groupName)}`, model, response.usage);

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
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.05,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  });

  const durationMs = Date.now() - start;
  trackTokens(userId, `${actionType}_text`, "gpt-4o", response.usage);

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
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.05,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  });

  const durationMs = Date.now() - start;
  trackTokens(userId, `${actionType}_external`, "gpt-4o", response.usage);

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
  const cognitiveSystemPrompt = loadPrompt("cognitive-system.txt");
  const personalitySystemPrompt = loadPrompt("bigfive-schwartz-system.txt");
  const communicationTonePrompt = loadPrompt("communication-tone-system.txt");
  const personalStylePrompt = loadPrompt("personal-style-system.txt");
  const emotionalProfilePrompt = loadPrompt("emotional-profile-system.txt");
  const generalInfoPrompt = loadPrompt("general-info-system.txt");
  const mbtiPrompt = loadPrompt("mbti-system.txt");

  // Group internal traits by trait_group field (data-driven, excludes text traits)
  const groupedMap = groupTraitsByCategory(input.internal_trait_definitions);

  // Split Cognitive Profile: cognitive traits (excl. career_prestige) use dedicated prompt,
  // career_prestige stays with the generic group prompt.
  const cognitiveGroup = groupedMap.get("Cognitive Profile");
  if (cognitiveGroup) {
    const cognitiveTraits = cognitiveGroup.filter(t => t.internal_name !== "career_prestige");
    const careerTrait = cognitiveGroup.filter(t => t.internal_name === "career_prestige");
    groupedMap.delete("Cognitive Profile");
    if (cognitiveTraits.length > 0) groupedMap.set("Cognitive Profile", cognitiveTraits);
    if (careerTrait.length > 0) {
      const generalGroup = groupedMap.get("General Info") || [];
      groupedMap.set("General Info", [...generalGroup, ...careerTrait]);
    }
  }

  // Merge Big Five + Schwartz Values into a single "Personality" group with dedicated prompt
  const bigFive = groupedMap.get("Big Five") || [];
  const schwartz = groupedMap.get("Schwartz Values") || [];
  groupedMap.delete("Big Five");
  groupedMap.delete("Schwartz Values");
  const personalityTraits = [...bigFive, ...schwartz];
  if (personalityTraits.length > 0) groupedMap.set("Personality", personalityTraits);

  // Include text traits in General Info group (they share a prompt now)
  const textTraits = input.internal_trait_definitions.filter(t => t.calc_type === "text");
  if (textTraits.length > 0) {
    const generalGroup = groupedMap.get("General Info") || [];
    groupedMap.set("General Info", [...generalGroup, ...textTraits]);
  }

  const groupList = Array.from(groupedMap.entries()).map(([name, traits]) => ({ name, traits }));

  console.log(
    `[analysis] Starting grouped analysis: transcript=${input.transcript.length}chars, ` +
    `${input.internal_trait_definitions.length} internal traits in ${groupList.length} groups + ${textTraits.length} text, ` +
    `${input.external_trait_definitions.length} external traits`
  );

  const overallStart = Date.now();

  // Run group calls sequentially for gpt-4o (rate limit), parallel for gpt-4o-mini
  const groupResults: GroupCallResult[] = [];
  for (const g of groupList) {
    const prompt = g.name === "Cognitive Profile" ? cognitiveSystemPrompt
      : g.name === "Personality" ? personalitySystemPrompt
      : g.name === "Communication Tone" ? communicationTonePrompt
      : g.name === "Personal Style" ? personalStylePrompt
      : g.name === "Emotional Profile" ? emotionalProfilePrompt
      : g.name === "General Info" ? generalInfoPrompt
      : g.name === "MBTI" || g.name === "MBTI Test" ? mbtiPrompt
      : systemPrompt;
    const result = await runOneGroupCall(g.name, g.traits, input.transcript,
      prompt, userId ?? null, actionType, "gpt-4o");
    groupResults.push(result);
  }

  // External call runs after groups are done (text traits are now part of General Info)
  const externalResult: ExternalCallResult | null =
    input.external_trait_definitions.length > 0
      ? await runExternalCall(input.external_trait_definitions, input.transcript, userId ?? null, actionType)
      : null;

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

  // Merge text traits from group results (General Info now includes text traits)
  for (const gr of groupResults) {
    if (Array.isArray(gr.parsed.text_traits)) {
      for (const t of gr.parsed.text_traits) {
        if (!t.text_value) continue;
        const valid = validateInternalTrait({
          internal_name: t.internal_name,
          text_value: t.text_value,
          confidence: t.confidence ?? 0.5,
        });
        if (valid) internal_traits.push(valid);
      }
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
  const externalPromptPart = externalResult ? `\n\n=== external ===\n${externalResult.promptSent}` : "";
  const outputParts = groupResults
    .map(gr => `=== ${gr.groupName} (${gr.durationMs}ms) ===\n${gr.rawOutput}`)
    .join("\n\n");
  const externalOutputPart = externalResult
    ? `\n\n=== external (${externalResult.durationMs}ms) ===\n${externalResult.rawOutput}`
    : "";

  const runData: AnalysisRunData = {
    generated_prompt: promptParts + externalPromptPart,
    stage_a_output: outputParts + externalOutputPart,
    // Use a plain copy to avoid circular reference (result._run_data.stage_b_output → result)
    stage_b_output: JSON.parse(JSON.stringify(result)),
  };

  return Object.assign(result, { _run_data: runData });
}

// ── Single group analysis (for per-group reanalyze buttons) ─────

// Map of group keys to their prompt files and which trait_groups they include
const GROUP_PROMPT_MAP: Record<string, { promptFile: string; traitGroups: string[]; excludeTraits?: string[] }> = {
  "cognitive": { promptFile: "cognitive-system.txt", traitGroups: ["Cognitive Profile"], excludeTraits: ["career_prestige"] },
  "personality": { promptFile: "bigfive-schwartz-system.txt", traitGroups: ["Big Five", "Schwartz Values"] },
  "communication": { promptFile: "communication-tone-system.txt", traitGroups: ["Communication Tone"] },
  "style": { promptFile: "personal-style-system.txt", traitGroups: ["Personal Style"] },
  "emotional": { promptFile: "emotional-profile-system.txt", traitGroups: ["Emotional Profile"] },
  "general": { promptFile: "general-info-system.txt", traitGroups: ["General Info"] },
  "mbti": { promptFile: "mbti-system.txt", traitGroups: ["MBTI", "MBTI Test"] },
  "external": { promptFile: "external-system.txt", traitGroups: [] }, // special handling
};

export function getAvailableGroups(): { key: string; label: string }[] {
  return [
    { key: "cognitive", label: "Cognitive Profile" },
    { key: "personality", label: "Big Five + Schwartz" },
    { key: "communication", label: "Communication Tone" },
    { key: "style", label: "Personal Style" },
    { key: "emotional", label: "Emotional Profile" },
    { key: "general", label: "General Info" },
    { key: "mbti", label: "MBTI" },
    { key: "external", label: "External (Look)" },
  ];
}

export async function runSingleGroupAnalysis(
  groupKey: string,
  transcript: string,
  userId: number,
): Promise<{ internal_saved: number; external_saved: number; raw_output: string }> {
  const config = GROUP_PROMPT_MAP[groupKey];
  if (!config) throw new Error(`Unknown group key: ${groupKey}`);

  const { loadInternalTraitDefs, loadExternalTraitDefs, saveAnalysisToDb } = await import("./loader");

  if (groupKey === "external") {
    // External traits use a different flow
    const externalDefs = await loadExternalTraitDefs();
    const systemPrompt = loadPrompt("external-system.txt");
    const userPrompt = buildExternalUserMessage(transcript, externalDefs);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: 0.05, max_tokens: 2000, response_format: { type: "json_object" },
    });
    trackTokens(userId, `single_external`, "gpt-4o", response.usage);

    const rawOutput = response.choices[0].message.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(rawOutput); } catch {}

    const external_traits: ExternalTraitAssessment[] = [];
    if (Array.isArray(parsed.external_traits)) {
      setExternalPossibleValues(externalDefs as any[]);
      const seen = new Set<number>();
      for (const t of parsed.external_traits) {
        const valid = validateExternalTrait(t);
        if (valid && !seen.has(valid.trait_id)) { seen.add(valid.trait_id); external_traits.push(valid); }
      }
    }

    const saved = await saveAnalysisToDb(undefined as any, userId, { internal_traits: [], external_traits, missing_traits: [], recommended_probes: [], profiling_completeness: { internal_assessed: 0, internal_total: 0, external_assessed: external_traits.length, external_total: externalDefs.length, coverage_pct: 0, ready_for_matching: false, notes: "single group" } });
    return { ...saved, raw_output: rawOutput };
  }

  // Internal group flow
  const allDefs = await loadInternalTraitDefs();
  const groupTraits = allDefs.filter(t => {
    if (!config.traitGroups.includes(t.trait_group || "")) return false;
    if (config.excludeTraits?.includes(t.internal_name)) return false;
    return true;
  });

  // For general group: also include career_prestige and text traits
  if (groupKey === "general") {
    const career = allDefs.find(t => t.internal_name === "career_prestige");
    if (career) groupTraits.push(career);
    const textTraits = allDefs.filter(t => t.calc_type === "text");
    groupTraits.push(...textTraits);
  }

  setTraitLookups(allDefs, []);
  setTextTypeTraits(allDefs as any[]);

  const systemPrompt = loadPrompt(config.promptFile);
  const displayGroupName = groupKey === "personality" ? "Personality" : config.traitGroups[0] || groupKey;
  const result = await runOneGroupCall(displayGroupName, groupTraits, transcript, systemPrompt, userId, "single", "gpt-4o");

  // Validate and collect traits
  const internal_traits: InternalTraitAssessment[] = [];
  if (Array.isArray(result.parsed.internal_traits)) {
    for (const t of result.parsed.internal_traits) {
      const valid = validateInternalTrait(t);
      if (valid) internal_traits.push(valid);
    }
  }
  // Handle text_traits from General Info
  if (Array.isArray(result.parsed.text_traits)) {
    for (const t of result.parsed.text_traits) {
      if (!t.text_value) continue;
      const valid = validateInternalTrait({ internal_name: t.internal_name, text_value: t.text_value, confidence: t.confidence ?? 0.5 });
      if (valid) internal_traits.push(valid);
    }
  }

  const saved = await saveAnalysisToDb(undefined as any, userId, { internal_traits, external_traits: [], missing_traits: [], recommended_probes: [], profiling_completeness: { internal_assessed: internal_traits.length, internal_total: groupTraits.length, external_assessed: 0, external_total: 0, coverage_pct: 0, ready_for_matching: false, notes: "single group" } });
  return { ...saved, raw_output: result.rawOutput };
}
