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

If \`soul.md\` or \`user.md\` are empty or clearly incomplete, ask the user in a friendly way for the missing details (e.g. how they want you to sound, their name, timezone). When they answer, update \`soul.md\` and \`user.md\` using the file editor tool so future sessions remember them.

## Long-term memory

You have access to four memory tools: \`memory_write\`, \`memory_search\`, \`memory_recent\`, and \`memory_prune\`.

- **Before answering questions involving past context**, always call \`memory_search\` first to retrieve relevant memories.
- **After learning an important fact** (e.g. user preferences, decisions made, key information the user shared), call \`memory_write\` to persist it. Do this proactively without being asked.
- **For heartbeat/scheduled tasks**, call \`memory_search\` to recall relevant context before running the task.
- Do NOT save trivial or transient information. Focus on facts, preferences, goals, and key decisions.`;


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
