import Groq from "groq-sdk";
import fs from "fs";

const groq = new Groq(); // Uses GROQ_API_KEY env var

export type TranscriptionProvider = "groq" | "openai";

export type GroqTranscriptionModel =
  | "whisper-large-v3"
  | "whisper-large-v3-turbo";

export type OpenAITranscriptionModel =
  | "gpt-4o-transcribe"
  | "gpt-4o-mini-transcribe"
  | "whisper-1";

export type TranscriptionModel =
  | GroqTranscriptionModel
  | OpenAITranscriptionModel;

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
  if (options.provider === "openai") {
    return transcribeOpenAI(audioPath, options);
  }
  return transcribeGroq(audioPath, options);
}

async function transcribeGroq(
  audioPath: string,
  options: TranscribeOptions,
): Promise<string> {
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
  form.append("response_format", "text");
  if (options.prompt) {
    form.append("prompt", options.prompt);
  }
  // The gpt-4o-* transcription models do not accept a `language` parameter.
  // Only whisper-1 (OpenAI) supports it.
  if (options.model === "whisper-1" && options.language) {
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
    throw new Error(
      `OpenAI transcription failed (${res.status}): ${errText}`,
    );
  }

  // response_format=text returns the raw text
  const text = await res.text();
  return text.trim();
}
