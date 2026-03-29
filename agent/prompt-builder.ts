/**
 * Dynamic system prompt assembly for the OpenPaw runtime.
 */
import { join } from "node:path";
import type { Personality } from "../config/types";
import type { SkillMetadata } from "./skills/discover";
import type { OpenPawSurface, SessionMode } from "./types";
import {
  getPersonalityProse,
  MEMORY_GUIDANCE,
  OPENPAW_IDENTITY,
  PLATFORM_HINTS,
  SESSION_NOTE,
  USER_FACING_VOICE,
} from "../config/personality-copy";
import { scanContextContent, truncateContextContent } from "./context-scan";
import { loadProjectContextFromCwd } from "./prompt-context-files";

async function readUtf8(path: string): Promise<string> {
  try {
    const f = Bun.file(path);
    if (!(await f.exists())) {
      return "";
    }
    return await f.text();
  } catch {
    return "";
  }
}

export type BuildSystemPromptOptions = {
  workspacePath: string;
  personality: Personality;
  /** Where the user is chatting from — affects formatting hints. */
  surface: OpenPawSurface;
  /** Session mode used to bias prompt behavior for the current conversation. */
  sessionMode: SessionMode;
  /** Frozen blocks from MemoryStore (may be null if empty). */
  memoryUserBlock: string | null;
  memoryAgentBlock: string | null;
  /** Discovered Agent Skills (name + description only until `load_skill` is called). */
  skills?: SkillMetadata[];
};

const BOOTSTRAP = `## Onboarding and workspace (internal — do not expose filenames to the user)

If persona/voice for this install is missing or vague, ask in plain language how they want you to sound; then persist it with the file editor (workspace persona file).

For durable facts and notes, use the \`memory\` tool: new items → \`add\` + \`content\`; corrections → \`replace\` with \`old_text\` + \`content\`. Offer reminders in human terms (\"Want me to remember that?\") — never say you're writing to a specific file.

For file edits: always \`view\` before \`str_replace\`; \`old_str\` must match exactly once (including whitespace).`;

const STATIC_TOOL_RULES = `## Tools overview

- **bash**: shell commands (cwd is the workspace when sandbox is on, or user home when sandbox is off).
- **file_editor**: view before str_replace; \`old_str\` must match exactly once; create, insert, delete_lines, undo_edit as needed.
- **list_dir**: list directories under the sandbox (including under loaded skill directories).
- **load_skill**: load full markdown instructions for a named skill; use \`skillDirectory\` from the result for bundled paths (\`references/\`, \`scripts/\`, etc.).
- **memory**: persistent facts (\`user\` / \`memory\` targets). \`add\`: \`content\`. \`replace\`: \`old_text\` + \`content\`. \`remove\`: \`old_text\`. (Live state in tool results; frozen snapshot in system prompt.) When discussing with the user, see \"How to talk with the user\" — do not name these mechanisms.`;

/**
 * Assembles the Skills section for the system prompt: short list and when to call `load_skill`,
 * or onboarding text if nothing was discovered.
 */
function buildSkillsSection(skills: SkillMetadata[] | undefined): string {
  if (skills?.length) {
    const lines = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
    return `## Skills

Use the \`load_skill\` tool when the user's request matches a skill below. Full instructions load on demand.

Available skills:
${lines}`;
  }
  return `## Skills

No skills discovered. Optional: add skill folders containing \`SKILL.md\` under \`.agents/skills\` in the workspace (or \`~/.config/agent/skills\`).`;
}

function buildSessionModeSection(sessionMode: SessionMode): string {
  switch (sessionMode) {
    case "coding":
      return "Prefer concrete implementation details, small diffs, commands, and precise technical reasoning.";
    case "research":
      return "Prefer synthesis, comparison, explicit uncertainty, and concise evidence-backed explanations.";
    case "general":
    default:
      return "Use the default OpenPaw style for mixed conversation, analysis, and light execution.";
  }
}

/**
 * Assembles the dynamic system prompt: identity, guidance, platform, workspace files, frozen memory, optional project context.
 */
export async function buildSystemPrompt(options: BuildSystemPromptOptions): Promise<string> {
  const {
    workspacePath,
    personality,
    surface,
    sessionMode,
    memoryUserBlock,
    memoryAgentBlock,
    skills,
  } = options;

  let agentsRaw = (await readUtf8(join(workspacePath, "AGENTS.md"))).trim();
  if (!agentsRaw) {
    agentsRaw = (await readUtf8(join(workspacePath, "agents.md"))).trim();
  }
  let soulRaw = (await readUtf8(join(workspacePath, "SOUL.md"))).trim();
  if (!soulRaw) {
    soulRaw = (await readUtf8(join(workspacePath, "soul.md"))).trim();
  }

  const agentsLabel = agentsRaw ? "AGENTS.md" : "agents.md";
  const agents = truncateContextContent(
    scanContextContent(agentsRaw || "(empty)", agentsLabel),
    agentsLabel,
  );
  const soulLabel = soulRaw ? "SOUL.md" : "soul.md";
  const soul = truncateContextContent(
    scanContextContent(soulRaw || "(empty — consider asking the user)", soulLabel),
    soulLabel,
  );

  const platformBlock = PLATFORM_HINTS[surface];

  let memoryInjection = "";
  const mb = memoryAgentBlock
    ? truncateContextContent(scanContextContent(memoryAgentBlock, "MEMORY.md"), "MEMORY.md")
    : "";
  const ub = memoryUserBlock
    ? truncateContextContent(scanContextContent(memoryUserBlock, "USER.md"), "USER.md")
    : "";
  if (mb) {
    memoryInjection += `\n## What you know already — agent notes (internal)\n\nUse naturally in replies; do not quote section titles or imply you \"read a file\".\n\n${mb}\n`;
  }
  if (ub) {
    memoryInjection += `\n## What you know already — about the user (internal)\n\nUse naturally (\"You told me…\", \"You're in…\"); never say you saw this in a profile or markdown file.\n\n${ub}\n`;
  }
  if (!mb && !ub) {
    memoryInjection = `\n## Durable facts\n\nNothing stored yet — use the \`memory\` tool when the user wants something remembered.\n`;
  }

  const projectContext = loadProjectContextFromCwd(process.cwd());
  const projectSection = projectContext
    ? `\n## Additional project context (from current working directory)\n\n${projectContext}\n`
    : "";

  const sections = [
    `# Identity\n${OPENPAW_IDENTITY}`,
    `# Personality\n${getPersonalityProse(personality)}`,
    `# Session mode\n${buildSessionModeSection(sessionMode)}`,
    `# How to talk with the user\n${USER_FACING_VOICE}`,
    `# Memory and persistence\n${MEMORY_GUIDANCE}\n\n${SESSION_NOTE}`,
    `# Your environment\n${platformBlock}`,
    `# Workspace (OpenPaw home)\n## Workspace rules\n\n${agents}\n\n## Persona / voice (how you should sound)\n\n${soul}\n`,
    memoryInjection.trimEnd(),
    projectSection.trimEnd(),
    buildSkillsSection(skills),
    BOOTSTRAP,
    STATIC_TOOL_RULES,
  ].filter(Boolean);

  return sections.join("\n\n");
}
