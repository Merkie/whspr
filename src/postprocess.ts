import { streamText } from "ai";
import { withRetry } from "./utils/retry.js";
import { getProvider, ProviderType } from "./utils/providers.js";
import type { UsageInfo } from "./utils/pricing.js";

export interface PostprocessOptions {
  provider: ProviderType;
  modelName: string;
  systemPrompt: string;
  customPromptPrefix: string;
  transcriptionPrefix: string;
  onProgress?: (progress: number) => void;
}

export interface PostprocessResult {
  text: string;
  usage?: UsageInfo;
}

export async function postprocess(
  rawTranscription: string,
  customPrompt: string | null,
  options: PostprocessOptions,
): Promise<PostprocessResult> {
  const {
    provider,
    modelName,
    systemPrompt,
    customPromptPrefix,
    transcriptionPrefix,
    onProgress,
  } = options;
  const providerInstance = getProvider(provider);

  const result = await withRetry(
    async () => {
      const textStream = streamText({
        model: providerInstance(modelName),
        messages: [
          {
            role: "system",
            content:
              systemPrompt +
              "\n\nIMPORTANT: Output ONLY the corrected transcription text. Do not wrap it in JSON, markdown code blocks, or any other formatting. Just output the fixed text directly.",
          },
          {
            role: "user",
            content: [
              customPrompt
                ? `${customPromptPrefix}\n\`\`\`\n${customPrompt}\n\`\`\`\n\n`
                : null,
              `${transcriptionPrefix}\n\`\`\`\n${rawTranscription}\n\`\`\``,
            ]
              .filter(Boolean)
              .join("")
              .trim(),
          },
        ],
      });

      let accumulated = "";
      const rawLength = rawTranscription.length;

      for await (const chunk of textStream.textStream) {
        accumulated += chunk;
        if (onProgress) {
          const progress = Math.min(
            100,
            Math.round((accumulated.length / rawLength) * 100),
          );
          onProgress(progress);
        }
      }

      // Capture usage info after stream completes
      const usage = await textStream.usage;
      const usageInfo: UsageInfo | undefined =
        usage?.inputTokens !== undefined && usage?.outputTokens !== undefined
          ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
          : undefined;

      return { text: accumulated.trim(), usage: usageInfo };
    },
    3,
    "postprocess",
  );

  return result;
}
