# whspr Claude Code Plugin

A Claude Code plugin that integrates [whspr](https://www.npmjs.com/package/whspr) voice transcription with your development workflow.

## What it does

This plugin helps improve voice transcription accuracy by maintaining a `WHSPR.md` file in your project that contains:

- Project-specific vocabulary
- Function and class names
- File names
- Technical terms
- Naming conventions

The plugin automatically updates this file as you work, so when you use `whspr` (or `whisper`) to dictate your next message, the transcription AI has the context it needs to correctly transcribe project-specific terms.

## Installation

### Local testing

```bash
claude --plugin-dir /path/to/whspr/claude-plugin
```

### From a marketplace

```
/plugin install <marketplace-url>
```

## Commands

### `/whspr:init`

Initialize whspr support in your project:

```
/whspr:init
```

This creates a `WHSPR.md` file in your project root populated with:

- Project name and technologies
- Common technical terms
- Key file and function names
- Naming conventions

### `/whspr:uninstall [path]`

Remove whspr support from a project:

```
/whspr:uninstall           # Current project
/whspr:uninstall /path/to  # Specific project
```

## How it works

1. **Initialization**: Run `/whspr:init` to create a `WHSPR.md` file with initial project context
2. **Automatic updates**: The plugin's Stop hook triggers after each Claude response, updating `WHSPR.md` with new context from the conversation
3. **Voice input**: When you use whspr to dictate, it reads `WHSPR.md` and uses that vocabulary to correct transcription errors

### Example flow

1. You run `/whspr:init` in your React project
2. Claude creates `WHSPR.md` with terms like "useState", "useEffect", component names, etc.
3. You dictate: "add a use effect hook to the user profile component"
4. whspr correctly transcribes "useEffect" and "UserProfile" instead of "use effect" and "user profile"

## Supported file names

The plugin looks for these vocabulary files:

- `WHSPR.md`
- `WHISPER.md`
- `.whspr.md`
- `.whisper.md`

## Requirements

- [whspr](https://www.npmjs.com/package/whspr) CLI installed (`npm install -g whspr`)
- Claude Code 1.0.33+

## Model Configuration

whspr supports multiple AI providers for post-processing. Configure the model in `~/.whspr/settings.json`:

```json
{
  "model": "groq:openai/gpt-oss-120b"
}
```

Supported providers:

- `groq` - Groq models (default, requires `GROQ_API_KEY`)
- `anthropic` - Anthropic models (requires `ANTHROPIC_API_KEY`)

Example configurations:

```json
{"model": "groq:openai/gpt-oss-120b"}
{"model": "anthropic:claude-sonnet-4-5-20250514"}
```

## About whspr

whspr is a CLI tool that:

1. Records audio from your microphone
2. Transcribes using Groq's Whisper API
3. Post-processes with AI to fix errors using custom vocabulary from `WHSPR.md`

The `WHSPR.md` file lets you define project-specific terms so the AI can correct common transcription errors like:

- "cloud" -> "Claude"
- "post crest QL" -> "PostgreSQL"
- "cooper netties" -> "Kubernetes"
