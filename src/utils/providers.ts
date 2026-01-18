import { createGroq } from "@ai-sdk/groq";
import { createAnthropic } from "@ai-sdk/anthropic";

export const groq = createGroq();
export const anthropic = createAnthropic();

export type ProviderType = "groq" | "anthropic";

export function getProvider(provider: ProviderType) {
  switch (provider) {
    case "groq":
      return groq;
    case "anthropic":
      return anthropic;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
