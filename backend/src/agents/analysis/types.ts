// ── Analysis Agent Output Schema ─────────────────────────────────

export interface InternalTraitAssessment {
  trait_id: number;
  internal_name: string;
  score: number;                    // 0-100 (for numeric traits)
  confidence: number;               // 0.0-1.0
  weight_for_match?: number | null; // 0-10, only when partner preference detected
  weight_confidence?: number | null;// 0.0-1.0
  text_value?: string | null;       // for text-type traits like deal_breakers
  source: "ai";
}

export interface ExternalTraitAssessment {
  trait_id: number;
  internal_name: string;
  personal_value?: string | null;
  personal_value_confidence?: number | null;  // 0.0-1.0
  desired_value?: string | null;
  desired_value_confidence?: number | null;   // 0.0-1.0
  weight_for_match?: number | null;           // 0-100
  weight_confidence?: number | null;          // 0.0-1.0
  source: "ai";
}

export interface ProfilingCompleteness {
  internal_assessed: number;        // how many internal traits have a score
  internal_total: number;           // total active internal traits
  external_assessed: number;        // how many external traits have a personal_value
  external_total: number;           // total external traits
  coverage_pct: number;             // overall percentage
  ready_for_matching: boolean;      // enough data to enter matching?
  notes: string;                    // human-readable summary
}

export interface AnalysisAgentOutput {
  internal_traits: InternalTraitAssessment[];
  external_traits: ExternalTraitAssessment[];
  missing_traits: string[];         // internal_names of traits with no data
  recommended_probes: string[];     // suggested conversation topics
  profiling_completeness: ProfilingCompleteness;
}

// ── Analysis Agent Input ────────────────────────────────────────

export interface TraitDefinitionInput {
  id: number;
  internal_name: string;
  display_name_en: string;
  display_name_he?: string;
  ai_description: string;
  required_confidence: number;
  weight: number;
  sensitivity: string;
  calc_type: string;
  trait_group?: string | null;
}

export interface LookTraitDefinitionInput {
  id: number;
  internal_name: string;
  display_name_en: string;
  display_name_he?: string;
  source: string;
  weight: number;
  sensitivity: string;
  possible_values: string[] | null;
  ai_description?: string | null;
  required_confidence?: number;
  trait_group?: string | null;
}

export interface AnalysisAgentInput {
  transcript: string;
  internal_trait_definitions: TraitDefinitionInput[];
  external_trait_definitions: LookTraitDefinitionInput[];
  existing_profile?: AnalysisAgentOutput | null;
}
