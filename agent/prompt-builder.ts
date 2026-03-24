import { join } from "node:path";
import type { Personality } from "../config/types";

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

const BOOTSTRAP = `## Onboarding behavior

If \`soul.md\` or \`user.md\` are empty or clearly incomplete, ask the user in a friendly way for the missing details (e.g. how they want you to sound, their name, timezone). When they answer, update \`soul.md\` and \`user.md\` using the file editor tool so future sessions remember them.`;

/**
 * Builds the system / instruction block from workspace markdown and config.
 */
export async function buildSystemPrompt(
  workspacePath: string,
  personality: Personality,
): Promise<string> {
  const agents = await readUtf8(join(workspacePath, "agents.md"));
  const soul = await readUtf8(join(workspacePath, "soul.md"));
  const user = await readUtf8(join(workspacePath, "user.md"));

  const sections = [
    `# Personality preset\n${personality}\n`,
    `# agents.md (workspace)\n${agents.trim() || "(empty)"}\n`,
    `# soul.md (assistant persona)\n${soul.trim() || "(empty — consider asking the user)"}\n`,
    `# user.md (user profile)\n${user.trim() || "(empty — consider asking the user)"}\n`,
    BOOTSTRAP,
  ];

  return sections.join("\n");
}
