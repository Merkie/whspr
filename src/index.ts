#!/usr/bin/env node
import { record, convertToMp3, RecordingResult } from "./recorder.js";
import { transcribe } from "./transcribe.js";
import { postprocess } from "./postprocess.js";
import { copyToClipboard } from "./utils/clipboard.js";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");

function status(message: string) {
  process.stdout.write(`\x1b[2K\r${chalk.blue(message)}`);
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
      const rawText = await transcribe(mp3Path);

      if (verbose) {
        clearStatus();
        console.log(chalk.gray(`Raw: ${rawText}`));
      }

      // 4. Read WHSPR.md or WHISPER.md if exists
      const whsprMdPath = path.join(process.cwd(), "WHSPR.md");
      const whisperMdPath = path.join(process.cwd(), "WHISPER.md");
      let customPrompt: string | null = null;
      let vocabFile: string | null = null;

      if (fs.existsSync(whsprMdPath)) {
        customPrompt = fs.readFileSync(whsprMdPath, "utf-8");
        vocabFile = "WHSPR.md";
      } else if (fs.existsSync(whisperMdPath)) {
        customPrompt = fs.readFileSync(whisperMdPath, "utf-8");
        vocabFile = "WHISPER.md";
      }

      if (customPrompt && verbose) {
        console.log(chalk.gray(`Using custom vocabulary from ${vocabFile}`));
      }

      // 5. Post-process
      status("Post-processing...");
      const fixedText = await postprocess(rawText, customPrompt);

      // 6. Output and copy
      clearStatus();
      const processTime = ((Date.now() - processStart) / 1000).toFixed(1);
      const wordCount = fixedText.trim().split(/\s+/).filter(w => w.length > 0).length;
      const charCount = fixedText.length;

      // Log stats
      console.log(
        chalk.dim("Audio: ") + chalk.white(formatDuration(recording.durationSeconds)) +
        chalk.dim(" • Processing: ") + chalk.white(processTime + "s")
      );

      // Draw box
      const termWidth = Math.min(process.stdout.columns || 60, 80);
      const lineWidth = termWidth - 2;
      const label = " TRANSCRIPT ";
      console.log(chalk.dim("┌─") + chalk.cyan(label) + chalk.dim("─".repeat(lineWidth - label.length - 1) + "┐"));
      const lines = fixedText.split("\n");
      for (const line of lines) {
        // Wrap long lines
        let remaining = line;
        while (remaining.length > 0) {
          const chunk = remaining.slice(0, lineWidth - 2);
          remaining = remaining.slice(lineWidth - 2);
          console.log(chalk.dim("│ ") + chalk.white(chunk.padEnd(lineWidth - 2)) + chalk.dim(" │"));
        }
        if (line.length === 0) {
          console.log(chalk.dim("│ " + " ".repeat(lineWidth - 2) + " │"));
        }
      }
      const stats = ` ${wordCount} words • ${charCount} chars `;
      const bottomLine = "─".repeat(lineWidth - stats.length - 1) + " ";
      console.log(chalk.dim("└" + bottomLine) + chalk.dim(stats) + chalk.dim("┘"));
      await copyToClipboard(fixedText);
      console.log(chalk.green("✓") + chalk.gray(" Copied to clipboard"));

      // 7. Clean up
      fs.unlinkSync(mp3Path);
    } catch (error) {
      clearStatus();
      // Save recording on failure
      const backupDir = path.join(os.homedir(), ".whspr", "recordings");
      fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `recording-${Date.now()}.mp3`);
      fs.renameSync(mp3Path, backupPath);
      console.error(chalk.red(`Error: ${error}`));
      console.log(chalk.yellow(`Recording saved to: ${backupPath}`));
      process.exit(1);
    }
  } catch (error) {
    clearStatus();
    // Silent exit on user cancel
    if (error instanceof Error && error.message === "cancelled") {
      process.exit(0);
    }
    console.error(chalk.red(`Recording error: ${error}`));
    process.exit(1);
  }
}

main();
