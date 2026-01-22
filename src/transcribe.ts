import Groq from "groq-sdk";
import fs from "fs";

const groq = new Groq(); // Uses GROQ_API_KEY env var

export type TranscriptionModel = "whisper-large-v3" | "whisper-large-v3-turbo";

export async function transcribe(
  audioPath: string,
  model: TranscriptionModel = "whisper-large-v3-turbo",
  language: string = "en",
): Promise<string> {
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model,
    temperature: 0,
    language,
  });
  return transcription.text;
}
