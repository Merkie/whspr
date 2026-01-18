import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";

const MAX_DURATION_SECONDS = 900; // 15 minutes
const DEFAULT_WAVE_WIDTH = 60;
const STATUS_TEXT_WIDTH = 45; // " Recording [00:00 / 15:00] Press Enter to stop"

// Horizontal bar characters for waveform (quiet to loud)
const WAVE_CHARS = ["·", "-", "=", "≡", "■", "█"];

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function dbToChar(db: number): string {
  // Adjusted range: -45 (quiet) to -18 (normal speech peaks)
  const clamped = Math.max(-45, Math.min(-18, db));
  const normalized = (clamped + 45) / 27;
  const index = Math.min(
    WAVE_CHARS.length - 1,
    Math.floor(normalized * WAVE_CHARS.length),
  );
  return WAVE_CHARS[index];
}

function getWaveWidth(): number {
  const termWidth = process.stdout.columns || 80;
  // If terminal is wide enough for single line, use default
  if (termWidth >= DEFAULT_WAVE_WIDTH + STATUS_TEXT_WIDTH) {
    return DEFAULT_WAVE_WIDTH;
  }
  // Otherwise, use full terminal width for wave (will wrap text to next line)
  return Math.max(10, termWidth - 2);
}

export interface RecordingResult {
  path: string;
  durationSeconds: number;
}

export async function record(verbose = false): Promise<RecordingResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-"));
  const wavPath = path.join(tmpDir, "recording.wav");

  return new Promise((resolve, reject) => {
    // Initialize waveform buffer
    let waveWidth = getWaveWidth();
    const waveBuffer: string[] = new Array(waveWidth).fill(" ");
    let currentDb = -60;

    // Spawn FFmpeg with ebur128 filter to get volume levels
    const ffmpeg: ChildProcess = spawn(
      "ffmpeg",
      [
        "-f",
        "avfoundation",
        "-i",
        ":0",
        "-af",
        "ebur128=peak=true",
        "-t",
        MAX_DURATION_SECONDS.toString(),
        "-y",
        wavPath,
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let elapsedSeconds = 0;
    let stopped = false;

    function renderTUI() {
      const elapsed = formatTime(elapsedSeconds);
      const max = formatTime(MAX_DURATION_SECONDS);
      const wave = waveBuffer.join("");
      const termWidth = process.stdout.columns || 80;
      const singleLineWidth = waveWidth + STATUS_TEXT_WIDTH;

      if (termWidth >= singleLineWidth) {
        // Single line layout
        process.stdout.write(
          `\x1b[2K\r${chalk.cyan(wave)} ${chalk.blue("Recording")} [${chalk.yellow(elapsed)} / ${max}] ${chalk.gray("Press Enter to stop")}`,
        );
      } else {
        // Two line layout: wave on first line, status on second
        process.stdout.write(
          `\x1b[2K\r${chalk.cyan(wave)}\n\x1b[2K${chalk.blue("Recording")} [${chalk.yellow(elapsed)} / ${max}] ${chalk.gray("Press Enter to stop")}\x1b[A\r`,
        );
      }
    }

    // Update timer every second
    const timer = setInterval(() => {
      if (stopped) return;
      elapsedSeconds++;
      renderTUI();

      if (elapsedSeconds >= MAX_DURATION_SECONDS) {
        clearInterval(timer);
      }
    }, 1000);

    // Update waveform more frequently
    const waveTimer = setInterval(() => {
      if (stopped) return;
      // Push new character based on current dB level
      waveBuffer.shift();
      waveBuffer.push(dbToChar(currentDb));
      renderTUI();
    }, 50);

    // Initial display
    renderTUI();

    // Parse stderr for volume levels from ebur128
    ffmpeg.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();

      // Look for FTPK (frame true peak) from ebur128 output
      // Format: "FTPK: -XX.X -XX.X dBFS"
      const ftpkMatch = output.match(/FTPK:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+dBFS/);
      if (ftpkMatch) {
        // Average the left and right channels
        const left = parseFloat(ftpkMatch[1]);
        const right = parseFloat(ftpkMatch[2]);
        if (!isNaN(left) && !isNaN(right)) {
          currentDb = (left + right) / 2;
        }
      }
    });

    // Listen for Enter key to stop recording
    const onKeypress = (data: Buffer) => {
      if (data.toString().includes("\n") || data.toString().includes("\r")) {
        stopped = true;
        clearInterval(timer);
        clearInterval(waveTimer);
        process.stdin.removeListener("data", onKeypress);
        process.stdin.setRawMode(false);
        process.stdin.pause();

        // Send SIGINT to FFmpeg to stop gracefully
        ffmpeg.kill("SIGINT");
      }
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onKeypress);
    }

    ffmpeg.on("close", (code) => {
      clearInterval(timer);
      clearInterval(waveTimer);
      const termWidth = process.stdout.columns || 80;
      const singleLineWidth = waveWidth + STATUS_TEXT_WIDTH;
      if (termWidth >= singleLineWidth) {
        process.stdout.write("\x1b[2K\r"); // Clear the line
      } else {
        process.stdout.write("\x1b[2K\n\x1b[2K\x1b[A\r"); // Clear both lines
      }

      if (stopped || code === 0 || code === 255) {
        // FFmpeg returns 255 when interrupted with SIGINT
        if (fs.existsSync(wavPath)) {
          if (verbose) {
            console.log(
              chalk.green(`Recording complete (${formatTime(elapsedSeconds)})`),
            );
          }
          resolve({ path: wavPath, durationSeconds: elapsedSeconds });
        } else {
          reject(new Error("Recording failed: no output file created"));
        }
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      clearInterval(timer);
      clearInterval(waveTimer);
      stopped = true;
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

export async function convertToMp3(wavPath: string): Promise<string> {
  const mp3Path = wavPath.replace(/\.wav$/, ".mp3");

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-i",
        wavPath,
        "-codec:a",
        "libmp3lame",
        "-qscale:a",
        "2",
        "-y",
        mp3Path,
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        // Delete the WAV file after successful conversion
        fs.unlinkSync(wavPath);
        resolve(mp3Path);
      } else {
        reject(new Error(`MP3 conversion failed with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to convert to MP3: ${err.message}`));
    });
  });
}
