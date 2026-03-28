# OpenPaw

OpenPaw is a Bun + TypeScript local agent runtime with:

- a terminal chat UI (`openpaw tui`) built with OpenTUI
- a gateway process (`openpaw gateway dev` in foreground, `openpaw gateway start` in background) for messaging channels (Telegram today)
- persisted sessions and workspace instructions under `~/.openpaw`

## Prerequisites

- Node.js `>=18.18` (for npm-installed launcher)
- Bun `>=1.3` runtime (tested with `1.3.11`)
- A model provider compatible with OpenAI-style chat APIs
- Optional: Telegram bot token if you want Telegram channel support

## Install

Global install (recommended for end users):

```bash
npm i -g @amanm/openpaw
```

After install you can run `openpaw` (and `opaw`) commands directly.
The first run checks for Bun. If Bun is missing on macOS/Linux, OpenPaw prompts to install it automatically.

Windows note: Bun auto-install is not performed yet. Install Bun manually from `https://bun.sh/docs/installation`.

From-source install (development):

```bash
bun install
```

## CLI Usage

```bash
openpaw --help
```

Main commands:

- `openpaw onboard`  
  Interactive onboarding (provider URL, API key, model, optional Telegram token, personality)
- `openpaw tui`  
  Start local terminal chat UI
- `openpaw gateway dev`  
  Start configured messaging adapters in foreground mode (blocking)
- `openpaw gateway start`  
  Start gateway daemon in background mode
- `openpaw gateway status`  
  Show background gateway status and log paths
- `openpaw gateway stop`  
  Stop background gateway daemon
- `openpaw gateway logs [-n 80] [--stderr]`  
  Show recent daemon logs

## First-Time Setup

Run onboarding once:

```bash
openpaw onboard
```

This creates:

- config file: `~/.openpaw/config.yaml`
- workspace: `~/.openpaw/workspace`
- defaults:
  - `~/.openpaw/workspace/agents.md`
  - `~/.openpaw/workspace/soul.md`
  - `~/.openpaw/workspace/user.md` (legacy; prefer the `memory` tool for profile facts)
  - `~/.openpaw/workspace/memories/` (curated `MEMORY.md` / `USER.md` via the `memory` tool)
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
  Agent runtime, model wiring (`@ai-sdk/openai-compatible`), structured prompt building (identity, channel hints, optional project context from cwd), tools (`bash`, `file_editor`, `list_dir`, `memory`), session persistence
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

- Background gateway state files:
  - PID: `~/.openpaw/gateway/gateway.pid`
  - stdout log: `~/.openpaw/gateway/gateway.log`
  - stderr log: `~/.openpaw/gateway/gateway.err.log`
- For development from source, you can still run: `bun run openpaw ...`
