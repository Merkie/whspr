// Model pricing in USD per million tokens
export interface ModelPricing {
  input: number; // $/1M input tokens
  output: number; // $/1M output tokens
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Groq models
  "openai/gpt-oss-120b": { input: 0.0, output: 0.0 }, // Free tier pricing

  // Anthropic models
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
};

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
}

export function calculateCost(modelName: string, usage: UsageInfo): number {
  const pricing = MODEL_PRICING[modelName];
  if (!pricing) {
    return 0;
  }

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

export function formatCost(cost: number): string {
  if (cost === 0) {
    return "$0.00";
  }
  if (cost < 0.0001) {
    return `$${cost.toFixed(6)}`;
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}
