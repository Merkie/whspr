import Groq from "groq-sdk";
import fs from "fs";

const groq = new Groq(); // Uses GROQ_API_KEY env var

export async function transcribe(audioPath: string): Promise<string> {
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-large-v3-turbo",
    temperature: 0,
    language: "en",
  });
  return transcription.text;
}
