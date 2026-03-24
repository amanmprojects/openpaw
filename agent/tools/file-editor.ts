import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tool } from "ai";
import { z } from "zod";

function assertUnderWorkspace(workspaceRoot: string, userPath: string): string {
  const root = resolve(workspaceRoot);
  const full = resolve(workspaceRoot, userPath);
  if (full !== root && !full.startsWith(root + "/")) {
    throw new Error("Path escapes workspace");
  }
  return full;
}

/**
 * Minimal file operations confined to the workspace (replace with a richer implementation later).
 */
export function createFileEditorTool(workspaceRoot: string) {
  return tool({
    description:
      "Read, write, or search-replace a text file under the workspace. Paths are relative to the workspace root.",
    inputSchema: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("read"),
        path: z.string().describe("Relative path under workspace"),
      }),
      z.object({
        action: z.literal("write"),
        path: z.string().describe("Relative path under workspace"),
        content: z.string(),
      }),
      z.object({
        action: z.literal("str_replace"),
        path: z.string().describe("Relative path under workspace"),
        old_string: z.string(),
        new_string: z.string(),
      }),
    ]),
    execute: async (input) => {
      const abs = assertUnderWorkspace(workspaceRoot, input.path);
      if (input.action === "read") {
        if (!existsSync(abs)) {
          return { ok: false as const, error: "File not found" };
        }
        const content = readFileSync(abs, "utf8");
        return { ok: true as const, content };
      }
      if (input.action === "write") {
        writeFileSync(abs, input.content, "utf8");
        return { ok: true as const, wrote: abs };
      }
      if (!existsSync(abs)) {
        return { ok: false as const, error: "File not found" };
      }
      const before = readFileSync(abs, "utf8");
      if (!before.includes(input.old_string)) {
        return {
          ok: false as const,
          error: "old_string not found (exact match required)",
        };
      }
      const after = before.split(input.old_string).join(input.new_string);
      writeFileSync(abs, after, "utf8");
      return { ok: true as const, wrote: abs };
    },
  });
}
