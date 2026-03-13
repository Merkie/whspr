import { spawn, spawnSync, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";

const MAX_DURATION_SECONDS = 900; // 15 minutes
const DEFAULT_WAVE_WIDTH = 60;

function getAudioInput(): {
  format: string;
  device: string;
  extraArgs: string[];
} {
  switch (process.platform) {
    case "darwin":
      return {
        format: "avfoundation",
        device: ":0",
        extraArgs: ["-thread_queue_size", "1024"],
      };
    case "linux":
      return { format: "pulse", device: "default", extraArgs: [] };
    case "win32": {
      const device = detectWindowsAudioDevice();
      return { format: "dshow", device: `audio=${device}`, extraArgs: [] };
    }
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. Supported: macOS, Linux, Windows`,
      );
  }
}

function detectWindowsAudioDevice(): string {
  const result = spawnSync("ffmpeg", ["-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  // ffmpeg exits with error when listing devices, but prints the list to stderr
  const stderr = result.stderr || "";
  const lines = stderr.split("\n");
  let inAudioSection = false;

  for (const line of lines) {
    if (line.includes("DirectShow audio devices")) {
      inAudioSection = true;
      continue;
    }
    if (inAudioSection) {
      const match = line.match(/"(.+?)"/);
      if (match) {
        return match[1];
      }
    }
  }

  throw new Error(
    "No audio input device found. Make sure a microphone is connected.",
  );
}

export function checkFfmpeg(): void {
  const result = spawnSync("ffmpeg", ["-version"], { stdio: "pipe" });
  if (result.error) {
    console.error(
      chalk.red("Error: FFmpeg is not installed or not found in PATH."),
    );
    console.log();
    if (process.platform === "darwin") {
      console.log(chalk.yellow("Install with Homebrew:"));
      console.log("  brew install ffmpeg");
    } else if (process.platform === "linux") {
      console.log(chalk.yellow("Install with your package manager:"));
      console.log("  sudo apt install ffmpeg    # Debian/Ubuntu");
      console.log("  sudo dnf install ffmpeg    # Fedora");
      console.log("  sudo pacman -S ffmpeg      # Arch");
    } else if (process.platform === "win32") {
      console.log(chalk.yellow("Install with a package manager:"));
      console.log("  choco install ffmpeg       # Chocolatey");
      console.log("  scoop install ffmpeg       # Scoop");
      console.log("  winget install ffmpeg      # WinGet");
    }
    process.exit(1);
  }
}
const BRACKET_WIDTH = 2; // For "[" and "]" wrapping the waveform

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
  // Use full terminal width minus brackets and small margin
  const availableWidth = termWidth - BRACKET_WIDTH - 2;
  return Math.max(10, Math.min(DEFAULT_WAVE_WIDTH, availableWidth));
}

export interface RecordingResult {
  path: string;
  durationSeconds: number;
}

export async function record(verbose = false): Promise<RecordingResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "whspr-"));
  const wavPath = path.join(tmpDir, "recording.wav");

  return new Promise((resolve, reject) => {
    // Initialize waveform buffer
    let waveWidth = getWaveWidth();
    const waveBuffer: string[] = new Array(waveWidth).fill(WAVE_CHARS[0]);
    let currentDb = -60;
    let cancelled = false;

    // Spawn FFmpeg with ebur128 filter to get volume levels
    const { format, device, extraArgs } = getAudioInput();
    const ffmpeg: ChildProcess = spawn(
      "ffmpeg",
      [
        "-f",
        format,
        ...extraArgs,
        "-i",
        device,
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

      // Always render waveform on its own line, wrapped in brackets
      process.stdout.write(
        `\x1b[2K\r${chalk.cyan(`[${wave}]`)}\n\x1b[2K${chalk.blue("Recording")} [${chalk.yellow(elapsed)} / ${max}] ${chalk.gray("Press Enter to stop")}\x1b[A\r`,
      );
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

    // Listen for Enter to stop, Ctrl+C to cancel
    const onKeypress = (data: Buffer) => {
      const key = data.toString();
      const isEnter = key.includes("\n") || key.includes("\r");
      const isCtrlC = key.includes("\x03");

      if (isEnter || isCtrlC) {
        stopped = true;
        cancelled = isCtrlC;
        clearInterval(timer);
        clearInterval(waveTimer);
        process.stdin.removeListener("data", onKeypress);
        process.stdin.setRawMode(false);
        process.stdin.pause();

        // Stop FFmpeg gracefully — Windows doesn't support SIGINT for child processes
        if (process.platform === "win32") {
          ffmpeg.stdin?.write("q");
        } else {
          ffmpeg.kill("SIGINT");
        }
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
      // Clear both lines (waveform and status)
      process.stdout.write("\x1b[2K\n\x1b[2K\x1b[A\r");

      if (cancelled) {
        // User pressed Ctrl+C - clean up and reject
        if (fs.existsSync(wavPath)) {
          fs.unlinkSync(wavPath);
        }
        reject(new Error("cancelled"));
      } else if (stopped || code === 0 || code === 255) {
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
