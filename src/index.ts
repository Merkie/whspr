#!/usr/bin/env node
import { record, convertToMp3 } from "./recorder.js";
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

async function main() {
  try {
    // 1. Record audio
    const wavPath = await record(verbose);

    // 2. Convert to MP3
    status("Converting to MP3...");
    const mp3Path = await convertToMp3(wavPath);

    try {
      // 3. Transcribe with Whisper
      status("Transcribing...");
      const rawText = await transcribe(mp3Path);

      if (verbose) {
        clearStatus();
        console.log(chalk.gray(`Raw: ${rawText}`));
      }

      // 4. Read WHISPER.md if exists
      const whisperMdPath = path.join(process.cwd(), "WHISPER.md");
      const customPrompt = fs.existsSync(whisperMdPath)
        ? fs.readFileSync(whisperMdPath, "utf-8")
        : null;

      if (customPrompt && verbose) {
        console.log(chalk.gray("Using custom vocabulary from WHISPER.md"));
      }

      // 5. Post-process
      status("Post-processing...");
      const fixedText = await postprocess(rawText, customPrompt);

      // 6. Output and copy
      clearStatus();
      console.log(fixedText);
      await copyToClipboard(fixedText);
      console.log(chalk.gray("(Copied to clipboard)"));

      // 7. Clean up
      fs.unlinkSync(mp3Path);
    } catch (error) {
      clearStatus();
      // Save recording on failure
      const backupDir = path.join(os.homedir(), ".whisper-cli", "recordings");
      fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `recording-${Date.now()}.mp3`);
      fs.renameSync(mp3Path, backupPath);
      console.error(chalk.red(`Error: ${error}`));
      console.log(chalk.yellow(`Recording saved to: ${backupPath}`));
      process.exit(1);
    }
  } catch (error) {
    clearStatus();
    console.error(chalk.red(`Recording error: ${error}`));
    process.exit(1);
  }
}

main();
