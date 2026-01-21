import { streamText } from "ai";
import { withRetry } from "./utils/retry.js";
import { getProvider, ProviderType } from "./utils/providers.js";

export interface PostprocessOptions {
  provider: ProviderType;
  modelName: string;
  systemPrompt: string;
  customPromptPrefix: string;
  transcriptionPrefix: string;
  onProgress?: (progress: number) => void;
}

export async function postprocess(
  rawTranscription: string,
  customPrompt: string | null,
  options: PostprocessOptions,
): Promise<string> {
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
            content: systemPrompt + "\n\nIMPORTANT: Output ONLY the corrected transcription text. Do not wrap it in JSON, markdown code blocks, or any other formatting. Just output the fixed text directly.",
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
          const progress = Math.min(100, Math.round((accumulated.length / rawLength) * 100));
          onProgress(progress);
        }
      }

      return accumulated.trim();
    },
    3,
    "postprocess",
  );

  return result;
}
