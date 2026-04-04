import type Database from "better-sqlite3";

// GPT-4o-mini pricing (per 1M tokens, as of 2024)
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  // Fallback for unknown models
  default: { input: 0.50, output: 1.50 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = PRICING[model] || PRICING.default;
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

export interface TokenUsageRecord {
  user_id: number | null;
  action_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

let _db: Database.Database | null = null;

export function initTokenTracker(db: Database.Database): void {
  _db = db;
}

/**
 * Record token usage from an OpenAI API response.
 * Call this after every API call with the response.usage object.
 */
export function trackTokens(
  userId: number | null,
  actionType: string,
  model: string,
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined
): TokenUsageRecord | null {
  if (!usage) return null;

  const record: TokenUsageRecord = {
    user_id: userId,
    action_type: actionType,
    model,
    input_tokens: usage.prompt_tokens,
    output_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    estimated_cost_usd: estimateCost(model, usage.prompt_tokens, usage.completion_tokens),
  };

  if (_db) {
    _db.prepare(`
      INSERT INTO token_usage (user_id, action_type, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(record.user_id, record.action_type, record.model, record.input_tokens, record.output_tokens, record.total_tokens, record.estimated_cost_usd);
  }

  console.log(`[tokens] ${record.action_type} user=${record.user_id}: ${record.input_tokens}+${record.output_tokens}=${record.total_tokens} tokens, $${record.estimated_cost_usd.toFixed(6)}`);

  return record;
}
