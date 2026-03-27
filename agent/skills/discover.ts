import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

/** Metadata for one discovered skill (Agent Skills-style); `path` is the absolute skill folder. */
export type SkillMetadata = {
  name: string;
  description: string;
  path: string;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Returns the raw YAML string inside the first frontmatter block, or null if none.
 */
export function extractFrontmatterYaml(content: string): string | null {
  const m = content.match(FRONTMATTER_RE);
  return m?.[1]?.trim() ? m[1] : null;
}

/**
 * Strips the leading `---` / `---` frontmatter block from SKILL.md content for tool output.
 */
export function stripSkillBody(content: string): string {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return (m ? content.slice(m[0].length) : content).trim();
}

/**
 * Scans each base directory for immediate subfolders containing `SKILL.md`, parses YAML
 * frontmatter for `name` and `description`, and returns skills in stable order.
 * First occurrence of a given `name` wins; invalid or missing entries are skipped.
 */
export async function discoverSkillDirectories(dirs: string[]): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];
  const seenNames = new Set<string>();

  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDir = resolve(dir, entry.name);
      const skillFile = join(skillDir, "SKILL.md");

      let content: string;
      try {
        content = await readFile(skillFile, "utf-8");
      } catch {
        continue;
      }

      const fm = extractFrontmatterYaml(content);
      if (fm == null) {
        continue;
      }

      let meta: unknown;
      try {
        meta = parseYaml(fm);
      } catch {
        continue;
      }

      if (typeof meta !== "object" || meta === null) {
        continue;
      }

      const rec = meta as { name?: unknown; description?: unknown };
      if (typeof rec.name !== "string" || typeof rec.description !== "string") {
        continue;
      }

      const name = rec.name.trim();
      const description = rec.description.trim();
      if (!name || !description) {
        continue;
      }

      const dedupeKey = name.toLowerCase();
      if (seenNames.has(dedupeKey)) {
        continue;
      }
      seenNames.add(dedupeKey);

      skills.push({ name, description, path: skillDir });
    }
  }

  return skills;
}
