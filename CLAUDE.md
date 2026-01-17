# whisper-cli

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
  - `utils/` - Shared utilities (retry, clipboard, groq client)
- `bin/whisper.js` - CLI entrypoint
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
whisper
whisper --verbose
```

## Environment

Requires `GROQ_API_KEY` environment variable.

## Key Conventions

- Uses Groq SDK for both Whisper transcription and AI post-processing
- Recording uses FFmpeg's avfoundation (macOS) with ebur128 for volume levels
- Max recording duration: 15 minutes
- Failed recordings are saved to `~/.whisper-cli/recordings/` for recovery
- Custom vocabulary via `WHISPER.md` in current directory

## API Flow

1. Record audio → WAV file (FFmpeg)
2. Convert WAV → MP3
3. Transcribe MP3 → text (Groq Whisper)
4. Post-process text → fixed text (Groq AI)
5. Copy result to clipboard
