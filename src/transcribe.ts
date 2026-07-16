import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

export type TranscriptionProvider = "groq" | "openai" | "openrouter";

export type GroqTranscriptionModel =
  | "whisper-large-v3"
  | "whisper-large-v3-turbo";

export type OpenAITranscriptionModel =
  | "gpt-4o-transcribe"
  | "gpt-4o-mini-transcribe"
  | "whisper-1";

export type OpenRouterTranscriptionModel =
  | "openai/gpt-4o-transcribe"
  | "openai/gpt-4o-mini-transcribe"
  | "openai/whisper-large-v3";

export type TranscriptionModel =
  | GroqTranscriptionModel
  | OpenAITranscriptionModel
  | OpenRouterTranscriptionModel;

export interface TranscribeOptions {
  provider: TranscriptionProvider;
  model: TranscriptionModel;
  language: string;
  prompt?: string;
}

export async function transcribe(
  audioPath: string,
  options: TranscribeOptions,
): Promise<string> {
  switch (options.provider) {
    case "groq":
      return transcribeGroq(audioPath, options);
    case "openai":
      return transcribeOpenAI(audioPath, options);
    case "openrouter":
      return transcribeOpenRouter(audioPath, options);
    default:
      throw new Error(`Unknown transcription provider: ${options.provider}`);
  }
}

async function transcribeGroq(
  audioPath: string,
  options: TranscribeOptions,
): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: options.model,
    temperature: 0,
    language: options.language,
    prompt: options.prompt,
  });
  return transcription.text;
}

async function transcribeOpenAI(
  audioPath: string,
  options: TranscribeOptions,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const fileBuffer = fs.readFileSync(audioPath);
  const fileBlob = new Blob([Uint8Array.from(fileBuffer)], {
    type: "audio/mpeg",
  });

  const form = new FormData();
  form.append("file", fileBlob, "audio.mp3");
  form.append("model", options.model);
  const responseFormat = options.model === "whisper-1" ? "text" : "json";
  form.append("response_format", responseFormat);
  if (options.prompt) {
    form.append("prompt", options.prompt);
  }
  if (options.language) {
    form.append("language", options.language);
  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI transcription failed (${res.status}): ${errText}`);
  }

  if (responseFormat === "text") {
    return (await res.text()).trim();
  }

  const result = (await res.json()) as { text?: unknown };
  if (typeof result.text !== "string") {
    throw new Error("OpenAI transcription response did not include text");
  }
  return result.text.trim();
}

async function transcribeOpenRouter(
  audioPath: string,
  options: TranscribeOptions,
): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }

  const format = path.extname(audioPath).slice(1).toLowerCase() || "mp3";
  const audio = await fs.promises.readFile(audioPath);
  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Merkie/whspr",
      "X-OpenRouter-Title": "whspr",
    },
    body: JSON.stringify({
      model: options.model,
      input_audio: {
        data: audio.toString("base64"),
        format,
      },
      ...(options.language ? { language: options.language } : {}),
    }),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(
      `OpenRouter transcription failed (${res.status}): ${responseText}`,
    );
  }

  let result: { text?: unknown };
  try {
    result = JSON.parse(responseText) as { text?: unknown };
  } catch {
    throw new Error("OpenRouter transcription returned invalid JSON");
  }

  if (typeof result.text !== "string") {
    throw new Error("OpenRouter transcription response did not include text");
  }
  return result.text.trim();
}
