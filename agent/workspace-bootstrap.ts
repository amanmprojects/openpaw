import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ensureWorkspaceDirectories,
  getWorkspaceRoot,
} from "../config/paths";

export const DEFAULT_AGENTS_MD = `<!-- OpenPaw workspace instructions -->
# Workspace

You are operating in the user's OpenPaw workspace. Follow project conventions and prefer small, focused changes.

## How you come across

When you reply to the user, speak like a normal person who remembers — not like software citing files. Use "you mentioned", "you told me", "sounds like you're in…" and avoid lines like "your profile says" or naming markdown paths.

## Persisting things (for you, not for the user to hear about)

Use the \`memory\` tool for facts worth keeping: \`add\` with \`content\` for new items; \`replace\` needs both \`old_text\` and \`content\`. Use the file editor for longer persona or workspace wording when needed. Entries in memory are separated by §.
`;

export const DEFAULT_SOUL_MD = `<!-- Assistant persona — fill in with the user's help -->
`;

export const DEFAULT_USER_MD = `<!-- Legacy: prefer the memory tool (target user) for durable profile facts -->
`;

/**
 * Creates \`~/.openpaw/workspace\`, \`sessions/\`, \`memories/\`, and default markdown files if absent.
 */
export function ensureWorkspaceLayout(): void {
  ensureWorkspaceDirectories();
  const root = getWorkspaceRoot();
  const memoriesDir = join(root, "memories");
  if (!existsSync(memoriesDir)) {
    mkdirSync(memoriesDir, { recursive: true });
  }
  const files: { name: string; content: string }[] = [
    { name: "agents.md", content: DEFAULT_AGENTS_MD },
    { name: "soul.md", content: DEFAULT_SOUL_MD },
    { name: "user.md", content: DEFAULT_USER_MD },
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
