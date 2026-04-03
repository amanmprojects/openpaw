/**
 * Creates the OpenPaw workspace tree, default markdown files, bundled skills, and cron directories.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureCronDirectories,
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

/** Only this skill is seeded by default; users add more via \`npx skills\` (see find-skills SKILL). */
const BUNDLED_FIND_SKILLS_DIR = "find-skills";

/**
 * Shipped skill trees live under \`bundled-skills/\` at the package root (not under \`.agents/skills\` in the repo).
 */
const BUNDLED_SKILLS_ROOT = "bundled-skills";

/**
 * Path to the shipped \`find-skills\` folder (\`SKILL.md\` + any assets), from \`bundled-skills/find-skills\`.
 */
function bundledFindSkillsSourceDir(): string | null {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidate = join(moduleDir, "..", BUNDLED_SKILLS_ROOT, BUNDLED_FIND_SKILLS_DIR);
  return existsSync(candidate) ? candidate : null;
}

/**
 * Seeds \`workspace/.agents/skills/find-skills\` when that folder is missing (onboard / reset).
 * Other skills are installed later into the same \`skills\` directory by the user or agent.
 */
function seedBundledFindSkillsIfAbsent(workspaceRoot: string): void {
  const src = bundledFindSkillsSourceDir();
  if (!src) {
    return;
  }
  const dest = join(workspaceRoot, ".agents", "skills", BUNDLED_FIND_SKILLS_DIR);
  if (existsSync(dest)) {
    return;
  }
  mkdirSync(join(workspaceRoot, ".agents", "skills"), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

/**
 * Creates \`~/.openpaw/workspace\`, \`sessions/\`, \`memories/\`, default markdown files if absent,
 * and seeds the default \`find-skills\` skill under \`.agents/skills/\` when absent.
 */
export function ensureWorkspaceLayout(): void {
  ensureWorkspaceDirectories();
  ensureCronDirectories();
  const root = getWorkspaceRoot();
  const memoriesDir = join(root, "memories");
  if (!existsSync(memoriesDir)) {
    mkdirSync(memoriesDir, { recursive: true });
  }
  seedBundledFindSkillsIfAbsent(root);
  const files: { name: string; content: string }[] = [
    { name: "AGENTS.md", content: DEFAULT_AGENTS_MD },
    { name: "SOUL.md", content: DEFAULT_SOUL_MD },
    { name: "USER.md", content: DEFAULT_USER_MD },
  ];
  for (const { name, content } of files) {
    const p = join(root, name);
    const legacy = join(root, name.toLowerCase());
    if (!existsSync(p) && !existsSync(legacy)) {
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
