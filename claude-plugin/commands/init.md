---
description: Initialize whspr voice transcription support in the current project
---

# whspr Init Command

Initialize whspr (voice transcription) support for this project by creating a WHSPR.md file.

## What is whspr?

whspr is a CLI tool (npm package: `whspr`, often aliased as `whisper`) that:

1. Records audio from your microphone
2. Transcribes speech using Groq's Whisper API
3. Post-processes transcriptions with AI to fix errors using custom vocabulary

The WHSPR.md file (or WHISPER.md) provides project-specific vocabulary and context that helps the AI correct transcription errors. For example, if your project uses "PostgreSQL" but Whisper transcribes it as "post crest QL", the WHSPR.md file can specify the correct term.

## Your Task

Create a `WHSPR.md` file in the project root with the following structure:

```markdown
# Project Vocabulary

This file helps whspr (voice transcription) correct transcription errors by providing project-specific context.

## Project Info

- Project name: [name]
- Main technologies: [list key technologies]

## Common Terms

<!-- Use simple sentences to establish vocabulary context -->

My project uses PostgreSQL for the database.
The main framework is Kubernetes.
We use Claude for AI assistance.

## File Names

<!-- Important files that might be referenced in voice commands -->

## Function/Class Names

<!-- Key identifiers that should be transcribed correctly -->

## Naming Conventions

<!-- Patterns used in this codebase -->
```

## Instructions

1. First, explore the project to understand:
   - The project name (from package.json, pyproject.toml, Cargo.toml, etc.)
   - Main technologies and frameworks used
   - Important file names
   - Key function/class names that are likely to be spoken
   - Naming conventions (camelCase, snake_case, etc.)

2. Create `WHSPR.md` in the project root with relevant context gathered from step 1

3. Keep the file lightweight - focus on terms most likely to be mistranscribed:
   - Technical terms with unusual pronunciation
   - Project-specific names and identifiers
   - Acronyms and abbreviations

4. Inform the user that:
   - The WHSPR.md file has been created
   - The whspr plugin's Stop hook will automatically keep it updated as they work
   - They can manually edit WHSPR.md to add corrections when they notice transcription errors
   - They can run `/whspr:uninstall` to remove the file and disable updates

$ARGUMENTS
