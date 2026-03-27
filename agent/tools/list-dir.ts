import { readdir } from "node:fs/promises";
import { parse, resolve, sep } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { isSandboxRestricted } from "../turn-context";

/**
 * Resolves {@link userPath} under {@link allowedBase} and rejects path traversal.
 */
function resolveSafe(allowedBase: string, userPath: string): string {
  const root = resolve(allowedBase);
  const full = resolve(root, userPath);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (full !== root && !full.startsWith(prefix)) {
    throw new Error(`Path traversal blocked: "${userPath}"`);
  }
  return full;
}

/**
 * Root for sandboxed paths: workspace (or `FILE_EDITOR_ROOT`) when restricted, else filesystem root.
 */
function allowedBaseFor(workspaceRoot: string): string {
  if (isSandboxRestricted()) {
    return resolve(process.env.FILE_EDITOR_ROOT ?? workspaceRoot);
  }
  return parse(process.cwd()).root;
}

/**
 * Resolves which directory to list: optional path, or workspace root (sandbox on) / cwd (sandbox off).
 */
function resolveListDirPath(
  workspaceRoot: string,
  pathArg: string | undefined,
): string {
  const base = allowedBaseFor(workspaceRoot);
  if (pathArg === undefined || pathArg === "") {
    if (isSandboxRestricted()) {
      return base;
    }
    return process.cwd();
  }
  return resolveSafe(base, pathArg);
}

/**
 * Lists directory entries as newline-separated names. Paths follow the same sandbox rules as
 * `file_editor` and `bash`.
 */
export function createListDirTool(workspaceRoot: string) {
  return tool({
    description:
      "List the contents of a directory at the given path. If no path is provided, lists the " +
      "workspace root when the filesystem sandbox is on, or the current working directory when it is off.",
    inputSchema: z.object({
      path: z.string().optional().describe("Directory path to list (relative to workspace when sandbox is on)."),
    }),
    execute: async ({ path: pathArg }): Promise<{ contents: string }> => {
      try {
        const dirPath = resolveListDirPath(workspaceRoot, pathArg);
        const names = await readdir(dirPath);
        return { contents: names.join("\n") };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { contents: `Error: ${msg}` };
      }
    },
  });
}
