# 🐾 OpenPaw

A localized, self-hosted, multimodal AI agent runtime built with **Bun** and the **AI SDK**. OpenPaw provides a personal, persistent, and proactive AI companion that runs via a beautiful Terminal UI (TUI) or headless through Telegram.

## 🚀 Key Features

*   **Dual Interface:** Run locally via a beautiful React-based TUI (`@opentui`) or headlessly via Telegram long-polling.
*   **Proactive Heartbeat:** Schedule Cron-based tasks (`HEARTBEAT.md`) where the agent proactively messages you first (e.g. Morning Briefings, Evening Summaries).
*   **Persistent Memory:** Zero-dependency SQLite Vector DB wrapper for long-term memory. The agent writes to its own diary and automatically retrieves relevant context before answering.
*   **Multimodal (Telegram):** Send photos for vision context; send voice memos (`.ogg`) and have them automatically transcribed to text via local Whisper CLI.
*   **Web Dashboard:** Real-time web UI (`localhost:4242`) overlay to view memory, manage sessions, edit workspace files, and monitor token budgets.
*   **India-First Tools:** Built-in tools to parse UPI/Bank SMS notifications, summarize expenses, and track academic deadlines.
*   **Local Action Approval:** High-stakes actions (like running bash commands or modifying files) can be approved or denied directly via Telegram inline buttons.
*   **Agent Tools:** File editing, Bash execution, PDF Reading, Web Searching (DuckDuckGo/Brave).

---

## 💻 Commands Summary

From the root repository (`/home/sharvarianand/Documents/openpaw`), here are the main commands to interact with OpenPaw:

### 1. Install Dependencies
```bash
bun install
```

### 2. First-Time Setup
Run the guided onboarding wizard to configure your LLM provider and initialize your `~/.openpaw` config directory.
```bash
bun run onboard
```

### 3. Open the Terminal Chat UI
Launch the interactive TUI for local chatting:
```bash
bun run dev
# (Equivalent direct command: bun run ./cli/openpaw.tsx tui)
```

### 4. Start the Messaging Gateway (Telegram & Dashboard)
Boot the headless Telegram adapter, Heartbeat scheduler, and Web Dashboard.
```bash
bun run gateway
# (Equivalent direct command: bun run ./cli/openpaw.tsx gateway start)
```
*Note: The web dashboard starts automatically and runs at `http://localhost:4242`.*

### 5. Typechecking & Reset
```bash
# Verify TypeScript compilation
bun run typecheck

# Reset your local workspace (deletes memory, sessions, etc)
bun run reset

# View complete CLI help
bun run ./cli/openpaw.tsx --help
```

---

## ⚙️ Configuration & Environment Secrets

The agent's state boundary is entirely contained within `~/.openpaw/` (no database servers needed).

### Required Environment Variables for Proactive Messaging
If you want the agent to message you proactively based on the `HEARTBEAT.md` schedule, export this before starting the gateway:
```bash
export OPENPAW_HEARTBEAT_CHAT_ID=<your_telegram_chat_id>
bun run gateway
```

### Telegram Setup
Ensure your `~/.openpaw/config.yaml` contains your Telegram Bot token:
```yaml
channels:
  telegram:
    botToken: "123456789:YOUR_BOT_TOKEN_HERE"
```

### External Tool Credentials (Optional)
If you want to use advanced search APIs instead of the free DuckDuckGo fallback, set this in your environment:
```bash
export BRAVE_SEARCH_API_KEY=YOUR_KEY  # Powers the web_search tool
```

### Multimodal Extra Setup 🗣️
- **PDF Read Tool:** Requires `pdftotext` installed on the host OS (`sudo apt install poppler-utils` or `brew install poppler`).
- **Voice Messages (Telegram):** Requires `whisper` CLI installed on the host OS to transcribe audio (`pip install -U openai-whisper`).

---

## 🏗️ Architecture

- **`agent/`**: Core runtime (`agent.ts`), persistent memory SQLite (`memory-store.ts`), tokenizer budget, and LLM orchestration via Vercel AI SDK.
- **`cli/`**: The `commander` CLI wrapper and `@opentui/react` interface.
- **`gateway/`**: The headless messaging adapters (Telegram long-polling, inline buttons, webhooks).
- **`dashboard/`**: The web dashboard codebase (`server.ts`, `index.html`) using `Bun.serve`.
- **`scheduler/`**: The heartbeat CRON engine.

## 📦 Building a Binary (Coming Soon)
A build script utilizing `bun build --compile` is being integrated to distribute OpenPaw as a single standalone executable.
