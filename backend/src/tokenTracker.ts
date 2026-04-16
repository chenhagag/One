/**
 * Token usage tracker.
 *
 * Writes to the pg `token_usage` table using fire-and-forget inserts.
 * The DB schema is auto-initialized on first call via initDb() — that
 * keeps this module usable even if index.ts hasn't pre-initialized pg yet.
 *
 * Callers (openai.ts and the agent modules) don't need to change: they call
 * trackTokens(...) without awaiting, same as before. Errors are logged
 * but never thrown — this is analytics, not critical path.
 */

import { getPool, initDb } from "./db.pg";

// GPT-4o-mini pricing (per 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
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

/**
 * @deprecated No longer needed once the pg migration is complete.
 * Kept as a no-op so `db.ts` (the legacy sqlite module) can still
 * import and call it without breaking.
 */
export function initTokenTracker(_db?: unknown): void {
  // no-op — the pg pool self-initializes via db.pg.ts
}

/**
 * Record token usage from an OpenAI API response.
 * Fire-and-forget: returns the in-memory record synchronously, and the
 * DB insert runs in the background.
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

  // Fire-and-forget — schema init is idempotent, insert runs in background.
  initDb()
    .then(() =>
      getPool().query(
        `INSERT INTO token_usage
           (user_id, action_type, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.user_id,
          record.action_type,
          record.model,
          record.input_tokens,
          record.output_tokens,
          record.total_tokens,
          record.estimated_cost_usd,
        ]
      )
    )
    .catch((err) => {
      console.error(`[tokens] Failed to record usage for ${actionType}:`, err.message);
    });

  console.log(
    `[tokens] ${record.action_type} user=${record.user_id}: ${record.input_tokens}+${record.output_tokens}=${record.total_tokens} tokens, $${record.estimated_cost_usd.toFixed(6)}`
  );

  return record;
}
