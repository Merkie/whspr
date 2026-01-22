import chalk from "chalk";

// Box-drawing characters
export const BOX = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeRight: "├",
  teeLeft: "┤",
} as const;

// Semantic colors following Research-Agent aesthetics
export const colors = {
  header: chalk.blue,
  action: chalk.cyan,
  info: chalk.yellow.italic,
  metadata: chalk.gray,
  success: chalk.green,
  error: chalk.red,
  dim: chalk.dim,
  white: chalk.white,
} as const;

export interface StartupConfig {
  model: string;
  vocabSources: string[];
}

export function renderStartupHeader(config: StartupConfig): void {
  const termWidth = Math.min(process.stdout.columns || 60, 66);
  const innerWidth = termWidth - 4; // Account for "│  " and " │"

  const headerLabel = " WHSPR ";
  const topLine =
    BOX.topLeft +
    BOX.horizontal +
    colors.header.bold(headerLabel) +
    colors.dim(
      BOX.horizontal.repeat(termWidth - headerLabel.length - 3) + BOX.topRight,
    );

  console.log(topLine);

  // Model line
  const modelLabel = "Model: ";
  const modelValue = config.model;
  const modelLine = `${modelLabel}${modelValue}`;
  console.log(
    colors.dim(BOX.vertical + "  ") +
      colors.metadata(modelLabel) +
      colors.white(modelValue) +
      " ".repeat(Math.max(0, innerWidth - modelLine.length)) +
      colors.dim(" " + BOX.vertical),
  );

  // Vocab line (only show if sources exist)
  if (config.vocabSources.length > 0) {
    const vocabLabel = "Vocab: ";
    const vocabValue = config.vocabSources.join(" + ");
    const vocabLine = `${vocabLabel}${vocabValue}`;
    console.log(
      colors.dim(BOX.vertical + "  ") +
        colors.metadata(vocabLabel) +
        colors.info(vocabValue) +
        " ".repeat(Math.max(0, innerWidth - vocabLine.length)) +
        colors.dim(" " + BOX.vertical),
    );
  }

  // Bottom border
  console.log(
    colors.dim(
      BOX.bottomLeft + BOX.horizontal.repeat(termWidth - 2) + BOX.bottomRight,
    ),
  );
  console.log(); // Empty line after header
}

export interface CompactStats {
  audioDuration: string;
  processingTime: string;
  cost?: string;
}

export function formatCompactStats(stats: CompactStats): string {
  let result =
    colors.metadata("Audio: ") +
    colors.white(stats.audioDuration) +
    colors.metadata(" \u2022 Processing: ") +
    colors.white(stats.processingTime);

  if (stats.cost) {
    result += colors.metadata(" \u2022 Cost: ") + colors.white(stats.cost);
  }

  return result;
}

export function statusPrefix(): string {
  return colors.dim(BOX.teeRight + BOX.horizontal + " ");
}

export function formatStatus(message: string): string {
  return statusPrefix() + colors.action(message);
}
