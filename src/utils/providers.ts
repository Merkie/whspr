import { createGroq } from "@ai-sdk/groq";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

export const groq = createGroq();
export const anthropic = createAnthropic();

let _openrouter: ReturnType<typeof createOpenRouter> | null = null;
function getOpenRouter() {
  if (_openrouter) return _openrouter;
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }
  _openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  return _openrouter;
}

export type ProviderType = "groq" | "anthropic" | "openrouter";

export type LanguageModelFactory = (modelName: string) => LanguageModel;

export function getProvider(provider: ProviderType): LanguageModelFactory {
  switch (provider) {
    case "groq":
      return (modelName) => groq(modelName);
    case "anthropic":
      return (modelName) => anthropic(modelName);
    case "openrouter":
      return (modelName) => getOpenRouter().chat(modelName);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// OpenRouter returns `cost` (USD) in providerMetadata when usage accounting is
// enabled. Returns undefined if not present.
export function extractOpenRouterCost(providerMetadata: unknown): number | undefined {
  const pm = providerMetadata as
    | { openrouter?: { usage?: { cost?: number } } }
    | undefined;
  const cost = pm?.openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : undefined;
}
