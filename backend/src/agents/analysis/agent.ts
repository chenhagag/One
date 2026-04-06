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

// ── All active traits from DB are analyzed (no filter) ─────────
const ACTIVE_TRAIT_NAMES: Set<string> | null = null;

// Traits that explicitly allow weight_for_match output (per trait definition instruction)
const WEIGHT_ALLOWED_TRAITS = new Set([
  "cognitive_profile",
  "career_prestige",
]);

function filterActiveTraits(defs: AnalysisAgentInput["internal_trait_definitions"]): AnalysisAgentInput["internal_trait_definitions"] {
  if (!ACTIVE_TRAIT_NAMES) return defs; // null = no filter, analyze all
  return defs.filter(t => ACTIVE_TRAIT_NAMES.has(t.internal_name));
}

// ── Build Stage A prompt (structured trait blocks from Excel columns D-G) ──

function buildTraitPrompt(traits: AnalysisAgentInput["internal_trait_definitions"]): string {
  const blocks: string[] = [];

  for (const t of traits) {
    const lines: string[] = [];
    lines.push(`תכונה: ${t.display_name_he || t.internal_name}`);
    lines.push(`מזהה: ${t.internal_name} (ID=${t.id})`);

    if (t.ai_description) {
      // The ai_description is structured with labeled sections from Excel columns D-G
      // Only include sections that have actual content — skip empty ones entirely
      const rawSections = t.ai_description.split("\n").filter((l: string) => l.trim());

      const sectionPatterns: RegExp[] = [
        /^סיגנלים:/,
        /^הבחנות:/,
        /^סקאלה:/,
      ];

      for (const s of rawSections) {
        const trimmedLine = s.trim();
        if (!trimmedLine) continue;

        // Check if it's a labeled section
        const isLabeled = sectionPatterns.some(p => p.test(trimmedLine));
        if (isLabeled) {
          lines.push(trimmedLine);
        } else if (trimmedLine.length > 3) {
          // General explanation or unmatched content
          lines.push(trimmedLine);
        }
      }
    }

    if (t.calc_type === "text") {
      lines.push("סוג פלט: טקסט בלבד, לא ציון מספרי");
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n---\n\n");
}

function buildStageAUserMessage(input: AnalysisAgentInput): string {
  // Filter to active traits only
  const activeTraits = filterActiveTraits(input.internal_trait_definitions);
  const traitPrompt = buildTraitPrompt(activeTraits);

  const externalDefs = input.external_trait_definitions
    .map((t) => {
      const vals = t.possible_values ? ` values=[${t.possible_values.join(", ")}]` : "";
      return `- ${t.internal_name} (${t.display_name_he || ""}) | w=${t.weight}${vals}`;
    })
    .join("\n");

  const checklist = activeTraits.map(t => t.internal_name).join(", ");
  const traitCount = activeTraits.length;

  return `## תמליל שיחה
${input.transcript}

## הגדרות תכונות פנימיות

${traitPrompt}

## תכונות חיצוניות
${externalDefs}

## פרופיל קיים
${input.existing_profile ? JSON.stringify(input.existing_profile, null, 2) : "אין פרופיל קיים."}

## המשימה — קריטי

חובה לכתוב בלוק עבור כל אחת מ-${traitCount} התכונות הפנימיות. אסור לדלג.

עבור תכונות עם ראיות → פורמט מלא.
עבור תכונות ללא ראיות → פורמט קצר:
## [שם]
Key: [internal_name]
ראיות: אין אינדיקציה ברורה
ציון: [best guess] | ודאות: 0.1

הערה: weight_for_match — רק אם מצוין מפורשות בהגדרת התכונה. אם לא — לא לכתוב weight.

## רשימת כל התכונות (חובה — כל אחת חייבת להופיע בפלט)
${checklist}

אזהרה: אם חסרות תכונות — הפלט פסול.

אם אין ראיות ישירות — בדוק ראיות עקיפות.
אם אין כלום — ציון best-guess עם ודאות 0.1. הציון לא חייב להיות 50 — תן את ההערכה הסבירה ביותר.

אזהרה: אם חסרים תכונות בפלט — התוצאה פסולה. כל ${traitCount} חייבות להופיע.

אחרי כל התכונות: דיל ברייקרס, יתרונות, תכונות חסרות, הערות כלליות.

גם עבור תכונות חיצוניות — הערך personal_value ו-desired_value בנפרד.`;
}

// ── Validation (same as before but simplified) ─────────────────

function validateInternalTrait(t: any): InternalTraitAssessment | null {
  let traitId = t.trait_id ?? t.id;
  if (typeof traitId !== "number" && t.internal_name) {
    for (const [id, name] of internalIdToName) {
      if (name === t.internal_name) { traitId = id; break; }
    }
  }
  if (typeof traitId !== "number") return null;

  const name = t.internal_name ?? internalIdToName.get(traitId) ?? `trait_${traitId}`;

  if (textTypeTraits.has(traitId)) {
    const textVal = t.text_value ?? t.value ?? t.score;
    if (textVal == null) return null;
    return { trait_id: traitId, internal_name: name, score: 0, confidence: typeof t.confidence === "number" ? Math.round(t.confidence * 100) / 100 : 0.5, text_value: String(textVal), source: "ai" };
  }

  if (typeof t.score !== "number" || t.score < 0 || t.score > 100) return null;
  if (typeof t.confidence !== "number" || t.confidence < 0 || t.confidence > 1) return null;

  // Only allow weight_for_match for traits that explicitly define it in their definition
  const allowWeight = WEIGHT_ALLOWED_TRAITS.has(name);
  return {
    trait_id: traitId, internal_name: name,
    score: Math.round(t.score * 100) / 100,
    confidence: Math.round(t.confidence * 100) / 100,
    weight_for_match: allowWeight && t.weight_for_match != null ? Math.round(t.weight_for_match * 100) / 100 : null,
    weight_confidence: allowWeight && t.weight_confidence != null ? Math.round(t.weight_confidence * 100) / 100 : null,
    source: "ai",
  };
}

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

  // Strip mirrored personal_value
  if (personalValue != null && desiredValue != null) {
    const pv = String(personalValue).toLowerCase().trim();
    const dv = String(desiredValue).toLowerCase().trim();
    const confDiff = Math.abs((personalConfidence ?? 0) - (desiredConfidence ?? 0));
    if ((pv === dv || pv.includes(dv) || dv.includes(pv)) && confDiff <= 0.15) {
      personalValue = null; personalConfidence = null;
    }
  }
  if (personalValue == null && desiredValue == null) return null;

  return {
    trait_id: traitId, internal_name: name,
    personal_value: personalValue, personal_value_confidence: personalConfidence,
    desired_value: desiredValue, desired_value_confidence: desiredConfidence,
    weight_for_match: t.weight_for_match ?? null, weight_confidence: t.weight_confidence ?? null,
    source: "ai",
  };
}

function validateStageBOutput(raw: any): AnalysisAgentOutput {
  const internal_traits: InternalTraitAssessment[] = [];
  const external_traits: ExternalTraitAssessment[] = [];

  if (Array.isArray(raw.internal_traits)) {
    for (const t of raw.internal_traits) {
      const valid = validateInternalTrait(t);
      if (valid) internal_traits.push(valid);
    }
  }

  const seenExternalIds = new Set<number>();
  if (Array.isArray(raw.external_traits)) {
    for (const t of raw.external_traits) {
      const valid = validateExternalTrait(t);
      if (valid && !seenExternalIds.has(valid.trait_id)) {
        seenExternalIds.add(valid.trait_id);
        external_traits.push(valid);
      }
    }
  }

  return {
    internal_traits, external_traits,
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

// ── Main 2-Stage Agent Function ────────────────────────────────

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

  // ── Stage A: Text analysis ──────────────────────────────────
  const stageASystem = loadPrompt("stage-a-system.txt");
  const stageAUser = buildStageAUserMessage(input);

  console.log(`[analysis] Stage A: transcript=${input.transcript.length}chars, prompt=${stageAUser.length}chars`);

  const stageAResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: stageASystem },
      { role: "user", content: stageAUser },
    ],
    temperature: 0.2,
    max_tokens: 16000,  // Stage A produces text — needs more room than JSON
  });

  trackTokens(userId ?? null, `${actionType}_stage_a`, "gpt-4o-mini", stageAResponse.usage);

  const stageAOutput = stageAResponse.choices[0].message.content || "";
  const stageAFinish = stageAResponse.choices[0].finish_reason;

  console.log(`[analysis] Stage A output: ${stageAOutput.length}chars, finish=${stageAFinish}`);
  if (stageAFinish !== "stop") {
    console.error(`[analysis] WARNING: Stage A finish_reason=${stageAFinish}`);
  }

  // ── Stage B: JSON structuring ───────────────────────────────
  const stageBSystem = loadPrompt("stage-b-system.txt");

  // Build trait ID mapping for Stage B (only active traits)
  const activeTraits = filterActiveTraits(input.internal_trait_definitions);
  const idMapping = activeTraits
    .map(t => `${t.internal_name} → ID ${t.id}`)
    .join("\n");
  const extIdMapping = input.external_trait_definitions
    .map(t => `${t.internal_name} → ID ${t.id}`)
    .join("\n");

  const stageBUser = `## Stage A Analysis Output
${stageAOutput}

## Trait ID Mapping (internal)
${idMapping}

## Trait ID Mapping (external)
${extIdMapping}

## Task
Convert the Stage A analysis above into the required JSON format.
Use the trait ID mapping to fill trait_id for each trait.
internal_total = ${activeTraits.length}
external_total = ${input.external_trait_definitions.length}`;

  const stageBResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: stageBSystem },
      { role: "user", content: stageBUser },
    ],
    temperature: 0,
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });

  trackTokens(userId ?? null, `${actionType}_stage_b`, "gpt-4o-mini", stageBResponse.usage);

  const stageBRaw = stageBResponse.choices[0].message.content || "{}";
  console.log(`[analysis] Stage B output: ${stageBRaw.length}chars`);

  const parsed = JSON.parse(stageBRaw);
  const result = validateStageBOutput(parsed);

  console.log(`[analysis] Final: ${result.internal_traits.length} internal, ${result.external_traits.length} external`);

  // Attach run data for persistence
  const runData: AnalysisRunData = {
    generated_prompt: stageAUser,
    stage_a_output: stageAOutput,
    stage_b_output: result,
  };

  return Object.assign(result, { _run_data: runData });
}
