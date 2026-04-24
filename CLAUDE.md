# whspr

A CLI tool that records audio from your microphone, transcribes it using Groq's Whisper API, and post-processes with AI to fix errors.

## Stack

- Language: TypeScript (ES2022, NodeNext modules)
- Runtime: Node.js 18+
- Package manager: npm
- External: FFmpeg (required for audio recording)

## Structure

- `src/` - Main source code
  - `index.ts` - CLI entry point and main flow
  - `recorder.ts` - FFmpeg audio recording with waveform TUI
  - `transcribe.ts` - Groq Whisper API integration
  - `postprocess.ts` - AI post-processing for corrections
  - `selector.ts` - Interactive recording picker for `--from-recording`
  - `utils/` - Shared utilities (retry, clipboard, providers)
- `bin/whspr.js` - CLI entrypoint
- `dist/` - Compiled output

## Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Development (run without build)
npm run dev

# Link globally after build
npm link

# Run the CLI
whspr
whspr --verbose
whspr --pipe "claude"        # Pipe to Claude Code
whspr --from-recording       # Re-transcribe a saved recording
```

## Environment

- `GROQ_API_KEY` - Required when using Groq for transcription (default) or post-processing
- `OPENAI_API_KEY` - Required when using OpenAI for transcription (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1`)
- `ANTHROPIC_API_KEY` - Required when using Anthropic models for post-processing
- `OPENROUTER_API_KEY` - Required when using OpenRouter models for post-processing

## Key Conventions

- Transcription supports Groq Whisper (default) and OpenAI (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1`) via the `transcriptionProvider` + `transcriptionModel` settings
- Post-processing supports multiple providers via `provider:model-name` format (e.g., `groq:openai/gpt-oss-120b`, `anthropic:claude-sonnet-4-5`, `openrouter:google/gemini-2.0-flash-001`)
- OpenRouter unlocks any model OpenRouter proxies; cost is taken directly from OpenRouter's usage accounting rather than our static pricing table
- Uses Vercel AI SDK (`ai` package) for unified provider interface
- Recording uses FFmpeg's avfoundation (macOS) with ebur128 for volume levels
- Max recording duration: 15 minutes
- Failed recordings are saved to `~/.whspr/recordings/` for recovery
- Re-transcribe saved recordings with `--from-recording` (interactive selector)
- Custom vocabulary via `WHSPR.md` in current directory (global in `~/.whspr/` and/or local)
- Settings stored in `~/.whspr/settings.json`
- Cost calculation for Anthropic models (displayed after transcription)
- Progress bar during post-processing
- Pipe output to external commands (e.g., `whspr --pipe "claude"` to pipe directly to Claude Code)

## CLI Flags

- `--verbose`, `-v` - Enable verbose output
- `--pipe <command>`, `-p <command>` - Pipe transcription to a command instead of clipboard (e.g., `--pipe "claude"`)
- `--from-recording` - Select and re-transcribe a saved recording from `~/.whspr/recordings/`

## API Flow

1. Record audio → WAV file (FFmpeg)
2. Convert WAV → MP3
3. Transcribe MP3 → text (Groq Whisper)
4. Post-process text → fixed text (configurable provider: Groq or Anthropic)
5. Apply suffix (if configured)
6. Either pipe to command (`--pipe`) or copy to clipboard
7. Save transcription/audio files (if configured)

## Settings

Settings are stored in `~/.whspr/settings.json`. Available options:

| Option                     | Type    | Description                                                                    |
| -------------------------- | ------- | ------------------------------------------------------------------------------ |
| `verbose`                  | boolean | Enable verbose output                                                          |
| `suffix`                   | string  | Text appended to all transcriptions                                            |
| `transcriptionProvider`    | string  | `groq` (default) or `openai`                                                   |
| `transcriptionModel`       | string  | Groq: `whisper-large-v3`, `whisper-large-v3-turbo`. OpenAI: `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1` |
| `language`                 | string  | ISO 639-1 language code (e.g., `en`, `zh`). Ignored by OpenAI `gpt-4o-*` models. |
| `model`                    | string  | Post-processing model in `provider:model-name` format (providers: `groq`, `anthropic`, `openrouter`) |
| `systemPrompt`             | string  | System prompt for AI post-processing                                           |
| `customPromptPrefix`       | string  | Prefix before custom prompt content                                            |
| `transcriptionPrefix`      | string  | Prefix before raw transcription                                                |
| `alwaysSaveTranscriptions` | boolean | Save transcription text files to `~/.whspr/transcriptions/`                    |
| `alwaysSaveAudio`          | boolean | Save audio MP3 files to `~/.whspr/recordings/`                                 |
| `saveTranscriptionsToCwd`  | boolean | Save transcriptions to current directory instead of `~/.whspr/transcriptions/` |
