import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ensureWorkspaceDirectories,
  getWorkspaceRoot,
} from "../config/paths";

export const DEFAULT_AGENTS_MD = `<!-- OpenPaw workspace instructions -->
# Workspace

You are operating in the user's OpenPaw workspace. Follow project conventions and prefer small, focused changes.

## Profile files

The workspace includes \`soul.md\` (assistant persona) and \`user.md\` (user profile). When these are empty or incomplete, ask the user naturally for the missing details and update the files using the file editor tool.
`;

export const DEFAULT_SOUL_MD = `<!-- Assistant persona — fill in with the user's help -->
`;

export const DEFAULT_USER_MD = `<!-- User profile (name, timezone, preferences) — fill in with the user's help -->
`;

export const DEFAULT_HEARTBEAT_MD = `<!-- OpenPaw Heartbeat — proactive scheduled tasks -->
# Heartbeat

Define scheduled tasks below. Each task runs automatically and sends you a message.

## Syntax
\`\`\`
## [schedule] Task name
What the agent should do and tell you.
\`\`\`

## Supported schedules
- \`every monday 8am\` — weekly
- \`daily 9pm\` — every day at 9 PM
- \`every weekday 9am\` — Mon–Fri
- \`every 30min\` — every 30 minutes
- \`0 8 * * 1\` — raw cron (Monday 8:00)

---

<!-- Uncomment and edit to enable your first heartbeat task:

## [every monday 8am] Weekly briefing
Check my workspace for any notes I left about upcoming tasks or goals.
Summarise what I should focus on this week in 3–5 bullet points.
Be concise and energetic.

-->
`;

/**
 * Creates \`~/.openpaw/workspace\`, \`sessions/\`, and default markdown files if absent.
 */
export function ensureWorkspaceLayout(): void {
  ensureWorkspaceDirectories();
  const root = getWorkspaceRoot();
  const files: { name: string; content: string }[] = [
    { name: "agents.md", content: DEFAULT_AGENTS_MD },
    { name: "soul.md", content: DEFAULT_SOUL_MD },
    { name: "user.md", content: DEFAULT_USER_MD },
    { name: "HEARTBEAT.md", content: DEFAULT_HEARTBEAT_MD },
  ];
  for (const { name, content } of files) {
    const p = join(root, name);
    if (!existsSync(p)) {
      writeFileSync(p, content, "utf8");
    }
  }
}

/**
 * Deletes the entire workspace directory (sessions, markdown, and any other files), then
 * recreates it with the same defaults as a fresh onboarding run.
 */
export function resetWorkspaceToOnboardingDefaults(): void {
  const root = getWorkspaceRoot();
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
  ensureWorkspaceLayout();
}
