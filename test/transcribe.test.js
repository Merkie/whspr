import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { parseRecordingDate } from "../dist/selector.js";
import { transcribe } from "../dist/transcribe.js";
import { calculateCost } from "../dist/utils/pricing.js";

function temporaryAudioFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "whspr-test-"));
  const audioPath = path.join(directory, "audio.mp3");
  fs.writeFileSync(audioPath, Buffer.from([0x49, 0x44, 0x33]));
  return {
    audioPath,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

test("transcription module imports without a Groq API key", () => {
  const moduleUrl = pathToFileURL(
    path.resolve("dist/transcribe.js"),
  ).toString();
  const env = { ...process.env };
  delete env.GROQ_API_KEY;

  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(moduleUrl)})`],
    { env, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
});

test("OpenAI GPT transcription requests JSON and parses its text", async () => {
  const file = temporaryAudioFile();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";

  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
      assert.equal(options.headers.Authorization, "Bearer test-openai-key");
      assert.equal(options.body.get("model"), "gpt-4o-transcribe");
      assert.equal(options.body.get("response_format"), "json");
      assert.equal(options.body.get("language"), "en");
      return Response.json({ text: "  hello from OpenAI  " });
    };

    const text = await transcribe(file.audioPath, {
      provider: "openai",
      model: "gpt-4o-transcribe",
      language: "en",
    });

    assert.equal(text, "hello from OpenAI");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    file.cleanup();
  }
});

test("OpenRouter transcription sends base64 audio to its STT endpoint", async () => {
  const file = temporaryAudioFile();
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";

  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/v1/audio/transcriptions");
      assert.equal(options.headers.Authorization, "Bearer test-openrouter-key");
      const body = JSON.parse(options.body);
      assert.deepEqual(body, {
        model: "openai/gpt-4o-transcribe",
        input_audio: {
          data: Buffer.from([0x49, 0x44, 0x33]).toString("base64"),
          format: "mp3",
        },
        language: "en",
      });
      return Response.json({ text: "  hello from OpenRouter  " });
    };

    const text = await transcribe(file.audioPath, {
      provider: "openrouter",
      model: "openai/gpt-4o-transcribe",
      language: "en",
    });

    assert.equal(text, "hello from OpenRouter");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    file.cleanup();
  }
});

test("unknown model pricing is not reported as free", () => {
  assert.equal(
    calculateCost("unknown/model", { inputTokens: 100, outputTokens: 50 }),
    undefined,
  );
});

test("Groq default model pricing uses current rates", () => {
  assert.equal(
    calculateCost("openai/gpt-oss-120b", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }),
    0.75,
  );
});

test("saved recording timestamps are parsed as UTC", () => {
  assert.equal(
    parseRecordingDate("transcription-2024-01-15T10-30-45.mp3")?.toISOString(),
    "2024-01-15T10:30:45.000Z",
  );
});
