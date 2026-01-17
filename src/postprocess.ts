import { generateObject } from "ai";
import { z } from "zod";
import { withRetry } from "./utils/retry.js";
import { groq } from "./utils/groq.js";

const MODEL = "openai/gpt-oss-120b";

const outputSchema = z.object({
  fixed_transcription: z.string(),
});

export async function postprocess(
  rawTranscription: string,
  customPrompt: string | null
): Promise<string> {
  const result = await withRetry(async () => {
    const response = await generateObject({
      model: groq(MODEL),
      schema: outputSchema,
      messages: [
        {
          role: "system",
          content: "Your task is to clean up/fix transcribed text generated from mic input by the user according to the user's own prompt, this prompt may contain custom vocabulary, instructions, etc. Please return the user's transcription with the fixes made (e.g. the AI might hear \"PostgreSQL\" as \"post crest QL\" you need to use your own reasoning to fix these mistakes in the transcription)"
        },
        {
          role: "user",
          content: customPrompt
            ? `Here's my custom user prompt:\n\`\`\`\n${customPrompt}\n\`\`\`\n\nHere's my raw transcription output that I need you to edit:\n\`\`\`\n${rawTranscription}\n\`\`\``
            : `Here's my raw transcription output that I need you to edit:\n\`\`\`\n${rawTranscription}\n\`\`\``
        }
      ],
    });
    return response.object;
  }, 3, "postprocess");

  return result.fixed_transcription;
}
