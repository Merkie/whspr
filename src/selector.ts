import fs from "fs";
import path from "path";
import { colors } from "./ui.js";

interface RecordingEntry {
  filename: string;
  filepath: string;
  date: Date;
}

function parseRecordingDate(filename: string): Date | null {
  // Pattern: recording-{epoch}.mp3
  const epochMatch = filename.match(/^recording-(\d{13,})\.mp3$/);
  if (epochMatch) {
    return new Date(parseInt(epochMatch[1]));
  }

  // Pattern: transcription-{ISO}.mp3 (e.g., transcription-2024-01-15T10-30-45.mp3)
  const isoMatch = filename.match(
    /^transcription-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.mp3$/,
  );
  if (isoMatch) {
    const isoStr = isoMatch[1].replace(
      /T(\d{2})-(\d{2})-(\d{2})/,
      "T$1:$2:$3",
    );
    return new Date(isoStr);
  }

  return null;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getRecordings(recordingsDir: string): RecordingEntry[] {
  if (!fs.existsSync(recordingsDir)) return [];

  return fs
    .readdirSync(recordingsDir)
    .filter((f) => f.endsWith(".mp3"))
    .map((filename) => {
      const date = parseRecordingDate(filename);
      if (!date) return null;
      return {
        filename,
        filepath: path.join(recordingsDir, filename),
        date,
      };
    })
    .filter((entry): entry is RecordingEntry => entry !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function selectRecording(recordingsDir: string): Promise<string> {
  const entries = getRecordings(recordingsDir);

  if (entries.length === 0) {
    return Promise.reject(
      new Error("No saved recordings found in ~/.whspr/recordings/"),
    );
  }

  return new Promise((resolve, reject) => {
    let selectedIndex = 0;
    const maxVisible = Math.min(
      entries.length,
      Math.max(5, (process.stdout.rows || 20) - 4),
    );
    let scrollOffset = 0;

    function render() {
      // Header line
      process.stdout.write(`\x1b[?25l`); // Hide cursor
      process.stdout.write(
        `\x1b[2K${colors.header.bold("Select a recording:")} ${colors.dim(`(${entries.length} found)`)}\n`,
      );

      const visibleEntries = entries.slice(
        scrollOffset,
        scrollOffset + maxVisible,
      );

      for (let i = 0; i < maxVisible; i++) {
        const entry = visibleEntries[i];
        if (!entry) {
          process.stdout.write(`\x1b[2K\n`);
          continue;
        }
        const globalIndex = scrollOffset + i;
        const isSelected = globalIndex === selectedIndex;
        const dateStr = formatDate(entry.date);
        const ago = timeAgo(entry.date);

        const prefix = isSelected ? colors.action("\u276f ") : "  ";
        const main = isSelected ? colors.white(dateStr) : colors.dim(dateStr);
        const suffix = colors.metadata(` (${ago})`);

        process.stdout.write(`\x1b[2K${prefix}${main}${suffix}\n`);
      }

      process.stdout.write(
        `\x1b[2K${colors.dim("\u2191/\u2193 navigate \u2022 Enter select \u2022 Esc cancel")}`,
      );

      // Move cursor back to top
      const totalLines = maxVisible + 1; // entries + hint
      process.stdout.write(`\x1b[${totalLines}A\r`);
    }

    function cleanup() {
      process.stdin.removeListener("data", onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(`\x1b[?25h`); // Show cursor

      // Clear all rendered lines
      const totalLines = maxVisible + 2; // header + entries + hint
      for (let i = 0; i < totalLines; i++) {
        process.stdout.write(`\x1b[2K\n`);
      }
      process.stdout.write(`\x1b[${totalLines}A\r`);
    }

    function onKeypress(data: Buffer) {
      const key = data.toString();

      // Up arrow or k
      if (key === "\x1b[A" || key === "k") {
        if (selectedIndex > 0) {
          selectedIndex--;
          if (selectedIndex < scrollOffset) {
            scrollOffset = selectedIndex;
          }
        }
        render();
      }
      // Down arrow or j
      else if (key === "\x1b[B" || key === "j") {
        if (selectedIndex < entries.length - 1) {
          selectedIndex++;
          if (selectedIndex >= scrollOffset + maxVisible) {
            scrollOffset = selectedIndex - maxVisible + 1;
          }
        }
        render();
      }
      // Enter
      else if (key === "\r" || key === "\n") {
        cleanup();
        resolve(entries[selectedIndex].filepath);
      }
      // Escape or Ctrl+C
      else if (key === "\x1b" || key === "\x03") {
        cleanup();
        reject(new Error("cancelled"));
      }
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onKeypress);
      render();
    } else {
      reject(new Error("--from-recording requires an interactive terminal"));
    }
  });
}
