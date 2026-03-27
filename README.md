# OpenPaw

OpenPaw is a Bun + TypeScript local agent runtime with:

- a terminal chat UI (`openpaw tui`) built with OpenTUI
- a gateway process (`openpaw gateway start`) for messaging channels (Telegram today)
- persisted sessions and workspace instructions under `~/.openpaw`

## Prerequisites

- Bun `>=1.3` (tested with `1.3.11`)
- A model provider compatible with OpenAI-style chat APIs
- Optional: Telegram bot token if you want Telegram channel support

## Install

```bash
bun install
```

## CLI Usage

```bash
./cli/openpaw.tsx --help
```

Main commands:

- `./cli/openpaw.tsx onboard`  
  Interactive onboarding (provider URL, API key, model, optional Telegram token, personality)
- `./cli/openpaw.tsx tui`  
  Start local terminal chat UI
- `./cli/openpaw.tsx gateway start`  
  Start all configured messaging adapters (currently Telegram when token is configured)

## First-Time Setup

Run onboarding once:

```bash
./cli/openpaw.tsx onboard
```

This creates:

- config file: `~/.openpaw/config.yaml`
- workspace: `~/.openpaw/workspace`
- defaults:
  - `~/.openpaw/workspace/agents.md`
  - `~/.openpaw/workspace/soul.md`
  - `~/.openpaw/workspace/user.md`
  - `~/.openpaw/workspace/sessions/*`

## Configuration

`~/.openpaw/config.yaml` contains:

- `provider.baseUrl`
- `provider.apiKey`
- `provider.model`
- optional `channels.telegram.botToken`
- `personality` (`Assistant`, `Meowl`, `Coder`)

Example:

```yaml
provider:
  baseUrl: "https://api.openai.com/v1"
  apiKey: "sk-..."
  model: "gpt-4o"
channels:
  telegram:
    botToken: "123456789:ABC..."
personality: "Assistant"
```

## Sessions and Commands

Sessions are persisted as JSON files under:

- `~/.openpaw/workspace/sessions`

TUI slash commands:

- `/new` start a new thread
- `/sessions` list saved sessions
- `/resume N` resume by number

Telegram bot commands:

- `/new`
- `/sessions`
- `/resume N`

## Architecture

Top-level modules:

- `agent/`  
  Agent runtime, model wiring (`@ai-sdk/openai-compatible`), prompt building, tools (`bash`, `file_editor`), session persistence
- `gateway/`  
  Shared runtime bootstrap + channel adapters (Telegram + channel orchestration)
- `cli/`  
  Commander CLI entrypoint and OpenTUI screens
- `config/`  
  Config schema, paths, and disk storage

Execution flow:

1. CLI command starts (`cli/openpaw.tsx`)
2. Gateway context loads config and ensures workspace layout
3. Agent runtime is created with tools scoped to workspace root
4. Channel (TUI or Telegram) forwards user text to `runtime.runTurn(...)`
5. Assistant output streams back and session history is saved

## Notes

- Run the CLI directly as `./cli/openpaw.tsx ...` for the most reliable terminal input behavior, especially inside integrated terminals.
