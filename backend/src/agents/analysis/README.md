# Analysis Agent

Extracts structured user profile data from conversation transcripts using AI.

## Files

```
agents/analysis/
├── agent.ts          — Main agent: builds prompt, calls OpenAI, validates output
├── loader.ts         — DB helpers: load trait definitions, save results
├── types.ts          — TypeScript interfaces for input/output
├── index.ts          — Public exports
├── test-run.ts       — Test runner with sample transcript
├── README.md         — This file
└── prompts/
    ├── system.txt        — System prompt (role, rules, confidence logic)
    └── user-template.txt — User message template with placeholders
```

## Input Format

```typescript
interface AnalysisAgentInput {
  transcript: string;                           // Conversation text
  internal_trait_definitions: TraitDefinitionInput[];   // From DB
  external_trait_definitions: LookTraitDefinitionInput[]; // From DB
  existing_profile?: AnalysisAgentOutput | null;       // Previous analysis (for updates)
}
```

Use `buildAnalysisInput(db, transcript)` to construct this from the database.

## Output Format

```typescript
interface AnalysisAgentOutput {
  internal_traits: InternalTraitAssessment[];   // Assessed personality traits
  external_traits: ExternalTraitAssessment[];   // Assessed appearance traits
  missing_traits: string[];                     // Traits with no signal
  recommended_probes: string[];                 // Suggested next conversation topics
  profiling_completeness: ProfilingCompleteness; // Coverage stats
}
```

## Confidence Logic

| Signal strength | Confidence range | Example |
|---|---|---|
| No signal at all | Omitted (null) | No mention of politics |
| Weak/indirect signal | 0.15 - 0.40 | Seems articulate → cognitive_profile |
| Moderate signal | 0.45 - 0.70 | "I go out a lot" → party_orientation |
| Strong/explicit signal | 0.75 - 1.0 | "I'm totally secular" → religiosity |

## Null Handling

- **No signal** → trait is omitted from output entirely (not included with null values)
- **Weak signal** → included with low confidence
- **Score null** → only for traits like deal_breakers where no issues detected
- **weight_for_match null** → normal, means no partner preference detected (system default weight applies)
- **desired_value null** → no partner preference for this external trait

## Partner-Side Importance Rule

For internal traits, `weight_for_match` is ONLY populated when:
- The user explicitly states this trait matters in a partner
- OR there is strong implicit evidence (e.g., "I could never be with someone who isn't close to their family")

Most traits will have `weight_for_match: null`. The system default weights from `trait_definitions.weight` serve as the baseline.

## Update Logic (COALESCE)

When saving to DB via `saveAnalysisToDb()`:
- New values overwrite existing scores/confidence
- `weight_for_match` and `weight_confidence` use COALESCE — new non-null values overwrite, but null values do NOT clear existing data
- `personal_value` and `desired_value` use COALESCE — same logic
- Source is always set to "ai"

This means multiple analysis runs accumulate data without losing previous assessments.

## Running

```bash
# Test with sample transcript
cd backend
npx ts-node src/agents/analysis/test-run.ts

# Debug mode (shows raw model output)
ANALYSIS_DEBUG=1 npx ts-node src/agents/analysis/test-run.ts
```

## Integration

```typescript
import { runAnalysisAgent, buildAnalysisInput, saveAnalysisToDb } from "./agents/analysis";

// 1. Build input from DB + transcript
const input = buildAnalysisInput(db, transcript);

// 2. Run analysis
const output = await runAnalysisAgent(input);

// 3. Save to DB
const saved = saveAnalysisToDb(db, userId, output);
```
