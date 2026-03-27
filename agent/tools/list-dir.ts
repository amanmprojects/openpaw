import { readdir } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { resolveScopePath, workspaceSandboxBase } from "../sandbox-paths";
import { isSandboxRestricted } from "../turn-context";

/**
 * Resolves which directory to list: optional path, or workspace root (sandbox on) / cwd (sandbox off).
 */
function resolveListDirPath(
  workspaceRoot: string,
  skillRoots: readonly string[],
  pathArg: string | undefined,
): string {
  if (pathArg === undefined || pathArg === "") {
    if (isSandboxRestricted()) {
      return workspaceSandboxBase(workspaceRoot);
    }
    return process.cwd();
  }
  return resolveScopePath(workspaceRoot, skillRoots, pathArg);
}

/**
 * Lists directory entries as newline-separated names. Paths follow the same sandbox rules as
 * `file_editor` and `bash`.
 */
export function createListDirTool(
  workspaceRoot: string,
  skillRoots: readonly string[] = [],
) {
  return tool({
    description:
      "List the contents of a directory at the given path. If no path is provided, lists the " +
      "workspace root when the filesystem sandbox is on, or the current working directory when it is off.",
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .describe(
          "Directory path to list; relative to workspace when sandbox is on, or under a loaded skill directory.",
        ),
    }),
    execute: async ({ path: pathArg }): Promise<{ contents: string }> => {
      try {
        const dirPath = resolveListDirPath(workspaceRoot, skillRoots, pathArg);
        const names = await readdir(dirPath);
        return { contents: names.join("\n") };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { contents: `Error: ${msg}` };
      }
    },
  });
}
