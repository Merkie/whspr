#!/usr/bin/env node
import { record, convertToMp3, RecordingResult } from "./recorder.js";
import { transcribe } from "./transcribe.js";
import { postprocess } from "./postprocess.js";
import { copyToClipboard } from "./utils/clipboard.js";
import { calculateCost, formatCost } from "./utils/pricing.js";
import {
  renderStartupHeader,
  formatCompactStats,
  formatStatus,
  colors,
  BOX,
} from "./ui.js";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

import { ProviderType } from "./utils/providers.js";

// Default prompts (can be overridden in settings.json)
export const DEFAULTS = {
  transcriptionModel: "whisper-large-v3-turbo" as const,
  language: "en",
  model: "groq:openai/gpt-oss-120b" as const,
  systemPrompt: `Your task is to fix spelling errors and proper names in transcribed text.
IMPORTANT: Only correct spelling mistakes and proper nouns (names, places, technical terms).
Do NOT change wording, phrasing, or sentence structure.
Do NOT rephrase or rewrite any part of the transcription.
Preserve the original voice and speaking style exactly as transcribed.`,
  customPromptPrefix: "Here's my custom user prompt:",
  transcriptionPrefix:
    "Here's my raw transcription output that I need you to edit:",
};

// Default settings that will be written to settings.json
const DEFAULT_SETTINGS: WhsprSettings = {
  model: DEFAULTS.model,
};

// Settings interface
export interface WhsprSettings {
  verbose?: boolean;
  suffix?: string; // Appended to all transcriptions (e.g., "\n\n(Transcribed via Whisper)")
  transcriptionModel?: "whisper-large-v3" | "whisper-large-v3-turbo";
  language?: string; // ISO 639-1 language code (e.g., "en", "zh", "es")
  model?: string; // Post-processing model in "provider:model-name" format (e.g., "groq:openai/gpt-oss-120b")
  systemPrompt?: string; // System prompt for post-processing
  customPromptPrefix?: string; // Prefix before custom prompt content
  transcriptionPrefix?: string; // Prefix before raw transcription
  alwaysSaveTranscriptions?: boolean; // Always save final transcription text files
  alwaysSaveAudio?: boolean; // Always save audio files (MP3)
  saveTranscriptionsToCwd?: boolean; // Save transcriptions to current working directory instead of ~/.whspr/transcriptions/
}

const WHSPR_DIR = path.join(os.homedir(), ".whspr");
const SETTINGS_PATH = path.join(WHSPR_DIR, "settings.json");
const TRANSCRIPTIONS_DIR = path.join(WHSPR_DIR, "transcriptions");
const RECORDINGS_DIR = path.join(WHSPR_DIR, "recordings");

function generateTimestampedFilename(extension: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `transcription-${timestamp}${extension}`;
}

function parseModelProvider(model: string): {
  provider: ProviderType;
  modelName: string;
} {
  const colonIndex = model.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Invalid model format: "${model}". Expected "provider:model-name" (e.g., "groq:openai/gpt-oss-120b")`,
    );
  }
  const provider = model.slice(0, colonIndex) as ProviderType;
  const modelName = model.slice(colonIndex + 1);
  if (provider !== "groq" && provider !== "anthropic") {
    throw new Error(
      `Unknown provider: "${provider}". Supported providers: groq, anthropic`,
    );
  }
  return { provider, modelName };
}

function loadSettings(): WhsprSettings {
  try {
    // Ensure ~/.whspr/ directory exists
    if (!fs.existsSync(WHSPR_DIR)) {
      fs.mkdirSync(WHSPR_DIR, { recursive: true });
    }

    // Create settings.json with defaults if it doesn't exist
    if (!fs.existsSync(SETTINGS_PATH)) {
      fs.writeFileSync(
        SETTINGS_PATH,
        JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n",
        "utf-8",
      );
      return { ...DEFAULT_SETTINGS };
    }

    const content = fs.readFileSync(SETTINGS_PATH, "utf-8");
    return JSON.parse(content) as WhsprSettings;
  } catch (error) {
    // Silently ignore invalid settings file
  }
  return {};
}

function loadCustomPrompt(verbose: boolean): {
  prompt: string | null;
  sources: string[];
} {
  const sources: string[] = [];
  let globalPrompt: string | null = null;
  let localPrompt: string | null = null;

  // Check for global WHSPR.md or WHISPER.md in ~/.whspr/
  const globalWhsprPath = path.join(WHSPR_DIR, "WHSPR.md");
  const globalWhisperPath = path.join(WHSPR_DIR, "WHISPER.md");

  if (fs.existsSync(globalWhsprPath)) {
    globalPrompt = fs.readFileSync(globalWhsprPath, "utf-8");
    sources.push("~/.whspr/WHSPR.md");
  } else if (fs.existsSync(globalWhisperPath)) {
    globalPrompt = fs.readFileSync(globalWhisperPath, "utf-8");
    sources.push("~/.whspr/WHISPER.md");
  }

  // Check for local WHSPR.md or WHISPER.md in current directory
  const localWhsprPath = path.join(process.cwd(), "WHSPR.md");
  const localWhisperPath = path.join(process.cwd(), "WHISPER.md");

  if (fs.existsSync(localWhsprPath)) {
    localPrompt = fs.readFileSync(localWhsprPath, "utf-8");
    sources.push("./WHSPR.md");
  } else if (fs.existsSync(localWhisperPath)) {
    localPrompt = fs.readFileSync(localWhisperPath, "utf-8");
    sources.push("./WHISPER.md");
  }

  // Combine prompts: global first, then local
  let combinedPrompt: string | null = null;
  if (globalPrompt && localPrompt) {
    combinedPrompt = globalPrompt + "\n\n" + localPrompt;
  } else if (globalPrompt) {
    combinedPrompt = globalPrompt;
  } else if (localPrompt) {
    combinedPrompt = localPrompt;
  }

  return { prompt: combinedPrompt, sources };
}

const settings = loadSettings();
const verbose =
  settings.verbose ||
  process.argv.includes("--verbose") ||
  process.argv.includes("-v");

// Parse --pipe flag
function getPipeCommand(): string | null {
  const pipeIndex = process.argv.findIndex(
    (arg) => arg === "--pipe" || arg === "-p",
  );
  if (pipeIndex !== -1 && process.argv[pipeIndex + 1]) {
    return process.argv[pipeIndex + 1];
  }
  return null;
}

const pipeCommand = getPipeCommand();

// Execute a command with text piped to stdin
function pipeToCommand(text: string, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      shell: true,
      stdio: ["pipe", "inherit", "inherit"],
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to execute pipe command: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Pipe command exited with code ${code}`));
      }
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}

function status(message: string) {
  process.stdout.write(`\x1b[2K\r${formatStatus(message)}`);
}

function clearStatus() {
  process.stdout.write("\x1b[2K\r");
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

async function main() {
  // Parse model configuration
  const modelConfig = settings.model ?? DEFAULTS.model;
  const { provider, modelName } = parseModelProvider(modelConfig);

  // Check for required API keys before recording
  // Always need GROQ_API_KEY for Whisper transcription
  if (!process.env.GROQ_API_KEY) {
    console.error(
      colors.error("Error: GROQ_API_KEY environment variable is not set"),
    );
    console.log(
      colors.metadata("Get your API key at https://console.groq.com/keys"),
    );
    console.log(
      colors.metadata('Then run: export GROQ_API_KEY="your-api-key"'),
    );
    process.exit(1);
  }

  // Check for provider-specific API key for post-processing
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      colors.error("Error: ANTHROPIC_API_KEY environment variable is not set"),
    );
    console.log(
      colors.metadata(
        "Get your API key at https://console.anthropic.com/settings/keys",
      ),
    );
    console.log(
      colors.metadata('Then run: export ANTHROPIC_API_KEY="your-api-key"'),
    );
    process.exit(1);
  }

  // Load custom prompt early to show in startup header
  const { prompt: customPrompt, sources: vocabSources } =
    loadCustomPrompt(verbose);

  // Display startup header
  renderStartupHeader({
    model: modelConfig,
    vocabSources,
  });

  try {
    // 1. Record audio
    const recording = await record(verbose);
    const processStart = Date.now();

    // 2. Convert to MP3
    status("Converting to MP3...");
    const mp3Path = await convertToMp3(recording.path);

    try {
      // 3. Transcribe with Whisper
      status("Transcribing...");
      const rawText = await transcribe(
        mp3Path,
        settings.transcriptionModel ?? DEFAULTS.transcriptionModel,
        settings.language ?? DEFAULTS.language,
      );

      if (verbose) {
        clearStatus();
        console.log(colors.metadata(`Raw: ${rawText}`));
        if (customPrompt) {
          console.log(
            colors.metadata(
              `Using custom vocabulary from: ${vocabSources.join(" + ")}`,
            ),
          );
        }
      }

      // 4. Post-process with progress bar
      status("Post-processing... 0%");
      const postprocessResult = await postprocess(rawText, customPrompt, {
        provider,
        modelName,
        systemPrompt: settings.systemPrompt ?? DEFAULTS.systemPrompt,
        customPromptPrefix:
          settings.customPromptPrefix ?? DEFAULTS.customPromptPrefix,
        transcriptionPrefix:
          settings.transcriptionPrefix ?? DEFAULTS.transcriptionPrefix,
        onProgress: (progress) => {
          const barWidth = 20;
          const filled = Math.round((progress / 100) * barWidth);
          const bar =
            "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);
          status(`Post-processing... [${bar}] ${progress}%`);
        },
      });

      let fixedText = postprocessResult.text;

      // 5. Apply suffix if configured
      if (settings.suffix) {
        fixedText = fixedText + settings.suffix;
      }

      // 6. Output and copy
      clearStatus();
      const processTime = ((Date.now() - processStart) / 1000).toFixed(1);
      const wordCount = fixedText
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
      const charCount = fixedText.length;

      // Calculate cost if usage info is available
      let costString: string | undefined;
      if (postprocessResult.usage) {
        const cost = calculateCost(modelName, postprocessResult.usage);
        costString = formatCost(cost);
      }

      // Draw box
      const termWidth = Math.min(process.stdout.columns || 60, 80);
      const lineWidth = termWidth - 2;
      const label = " TRANSCRIPT ";
      console.log(
        colors.dim(BOX.topLeft + BOX.horizontal) +
          colors.header.bold(label) +
          colors.dim(
            BOX.horizontal.repeat(lineWidth - label.length - 1) + BOX.topRight,
          ),
      );
      const lines = fixedText.split("\n");
      for (const line of lines) {
        // Wrap long lines
        let remaining = line;
        while (remaining.length > 0) {
          const chunk = remaining.slice(0, lineWidth - 2);
          remaining = remaining.slice(lineWidth - 2);
          console.log(
            colors.dim(BOX.vertical + " ") +
              colors.white(chunk.padEnd(lineWidth - 2)) +
              colors.dim(" " + BOX.vertical),
          );
        }
        if (line.length === 0) {
          console.log(
            colors.dim(
              BOX.vertical +
                " " +
                " ".repeat(lineWidth - 2) +
                " " +
                BOX.vertical,
            ),
          );
        }
      }
      const stats = ` ${wordCount} words \u2022 ${charCount} chars `;
      const bottomLine =
        BOX.horizontal.repeat(lineWidth - stats.length - 1) + " ";
      console.log(
        colors.dim(BOX.bottomLeft + bottomLine) +
          colors.metadata(stats) +
          colors.dim(BOX.bottomRight),
      );
      console.log(
        formatCompactStats({
          audioDuration: formatDuration(recording.durationSeconds),
          processingTime: processTime + "s",
          cost: costString,
        }),
      );

      // Either pipe to command or copy to clipboard
      if (pipeCommand) {
        try {
          await pipeToCommand(fixedText, pipeCommand);
          console.log(
            colors.success("\u2713") +
              colors.metadata(` Piped to: ${pipeCommand}`),
          );
        } catch (err) {
          console.error(colors.error(`Pipe failed: ${err}`));
          // Fall back to clipboard
          await copyToClipboard(fixedText);
          console.log(
            colors.success("\u2713") +
              colors.metadata(" Copied to clipboard (pipe failed)"),
          );
        }
      } else {
        await copyToClipboard(fixedText);
        console.log(
          colors.success("\u2713") + colors.metadata(" Copied to clipboard"),
        );
      }

      // 7. Save transcription if configured
      if (settings.alwaysSaveTranscriptions) {
        const filename = generateTimestampedFilename(".txt");
        let savePath: string;
        if (settings.saveTranscriptionsToCwd) {
          savePath = path.join(process.cwd(), filename);
        } else {
          fs.mkdirSync(TRANSCRIPTIONS_DIR, { recursive: true });
          savePath = path.join(TRANSCRIPTIONS_DIR, filename);
        }
        fs.writeFileSync(savePath, fixedText, "utf-8");
        console.log(
          colors.success("\u2713") +
            colors.metadata(` Saved transcription to: ${savePath}`),
        );
      }

      // 8. Save audio if configured
      if (settings.alwaysSaveAudio) {
        fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
        const audioFilename = generateTimestampedFilename(".mp3");
        const audioSavePath = path.join(RECORDINGS_DIR, audioFilename);
        fs.copyFileSync(mp3Path, audioSavePath);
        console.log(
          colors.success("\u2713") +
            colors.metadata(` Saved audio to: ${audioSavePath}`),
        );
      }

      // 9. Clean up
      fs.unlinkSync(mp3Path);
    } catch (error) {
      clearStatus();
      // Save recording on failure (post-processing failed, save audio only)
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
      const backupPath = path.join(
        RECORDINGS_DIR,
        `recording-${Date.now()}.mp3`,
      );
      fs.renameSync(mp3Path, backupPath);
      console.error(colors.error(`Error: ${error}`));
      console.log(colors.info(`Recording saved to: ${backupPath}`));
      process.exit(1);
    }
  } catch (error) {
    clearStatus();
    // Silent exit on user cancel
    if (error instanceof Error && error.message === "cancelled") {
      process.exit(0);
    }
    console.error(colors.error(`Recording error: ${error}`));
    process.exit(1);
  }
}

main();
