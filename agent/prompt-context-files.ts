/**
 * Optional project-context discovery from the process cwd (Hermes-style priority chain).
 * OpenPaw workspace files under ~/.openpaw/workspace are handled separately in prompt-builder.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanContextContent, truncateContextContent } from "./context-scan";

const OPENPAW_MD_NAMES = [".openpaw.md", "OPENPAW.md"] as const;

/**
 * Walks from start through parents until a `.git` directory is found or filesystem root.
 */
export function findGitRoot(start: string): string | null {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Finds the nearest `.openpaw.md` or `OPENPAW.md` from cwd up to (and including) git root.
 */
export function findOpenpawMd(cwd: string): string | null {
  const stopAt = findGitRoot(cwd);
  let current = resolve(cwd);
  const seen = new Set<string>();

  for (;;) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    for (const name of OPENPAW_MD_NAMES) {
      const candidate = join(current, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    if (stopAt !== null && current === stopAt) {
      break;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

/**
 * Strips optional YAML frontmatter (`---` delimited) from markdown; returns body only.
 */
export function stripYamlFrontmatter(content: string): string {
  if (!content.startsWith("---")) {
    return content;
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    return content;
  }
  const body = content.slice(end + 4).replace(/^\n+/, "");
  return body || content;
}

function readIfExists(path: string): string | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Loads a single prioritized project-context block from cwd (not the OpenPaw home workspace).
 * Priority: `.openpaw.md` / `OPENPAW.md` (walk to git root), else `AGENTS.md` / `agents.md` in cwd only,
 * else `CLAUDE.md` / `claude.md`, else `.cursorrules` and `.cursor/rules/*.mdc` in cwd only.
 */
export function loadProjectContextFromCwd(cwd: string): string {
  const openpawPath = findOpenpawMd(cwd);
  if (openpawPath) {
    const raw = readIfExists(openpawPath);
    if (raw) {
      const rel = openpawPath.includes("/") ? openpawPath.split("/").slice(-2).join("/") : openpawPath;
      let body = stripYamlFrontmatter(raw);
      body = scanContextContent(body, rel);
      return truncateContextContent(`## ${rel}\n\n${body}`, rel);
    }
  }

  for (const name of ["AGENTS.md", "agents.md"] as const) {
    const p = join(cwd, name);
    const raw = readIfExists(p);
    if (raw) {
      const body = scanContextContent(raw, name);
      return truncateContextContent(`## ${name}\n\n${body}`, name);
    }
  }

  for (const name of ["CLAUDE.md", "claude.md"] as const) {
    const p = join(cwd, name);
    const raw = readIfExists(p);
    if (raw) {
      const body = scanContextContent(raw, name);
      return truncateContextContent(`## ${name}\n\n${body}`, name);
    }
  }

  const cursorParts: string[] = [];
  const cursorrules = join(cwd, ".cursorrules");
  const cr = readIfExists(cursorrules);
  if (cr) {
    cursorParts.push(`## .cursorrules\n\n${scanContextContent(cr, ".cursorrules")}`);
  }

  const rulesDir = join(cwd, ".cursor", "rules");
  if (existsSync(rulesDir)) {
    const entries = readdirSync(rulesDir).filter((f) => f.endsWith(".mdc")).sort();
    for (const f of entries) {
      const p = join(rulesDir, f);
      const raw = readIfExists(p);
      if (raw) {
        const label = `.cursor/rules/${f}`;
        cursorParts.push(`## ${label}\n\n${scanContextContent(raw, label)}`);
      }
    }
  }

  if (cursorParts.length === 0) {
    return "";
  }

  const combined = cursorParts.join("\n\n");
  return truncateContextContent(combined, ".cursorrules");
}
