import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import type { SkillMetadata } from "../skills/discover";
import { stripSkillBody } from "../skills/discover";

/**
 * Tool that loads the markdown body of a discovered skill and returns its directory for bundled assets.
 */
export function createLoadSkillTool(skills: SkillMetadata[]) {
  return tool({
    description:
      "Load a skill by name to get specialized instructions (markdown, no frontmatter) and " +
      "`skillDirectory` for paths to references, scripts, etc. Use when the user's task matches " +
      "a skill listed in the system prompt.",
    inputSchema: z.object({
      name: z.string().describe("Skill name from the available skills list"),
    }),
    execute: async ({ name }) => {
      const key = name.trim().toLowerCase();
      const skill = skills.find((s) => s.name.toLowerCase() === key);
      if (!skill) {
        return { error: `Skill "${name}" not found` };
      }
      try {
        const raw = await readFile(join(skill.path, "SKILL.md"), "utf-8");
        return {
          skillDirectory: skill.path,
          content: stripSkillBody(raw),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}
