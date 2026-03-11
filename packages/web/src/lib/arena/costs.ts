// Token cost calculator for arena LLM calls
// Prices in dollars per million tokens

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
};

// Fallback pricing for unknown models
const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

export function calculateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return (inputCost + outputCost) * 100; // convert dollars to cents
}
