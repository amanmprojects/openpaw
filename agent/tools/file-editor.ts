import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { requestApproval } from "../../gateway/approval-gate";

function assertUnderWorkspace(workspaceRoot: string, userPath: string): string {
  const root = resolve(workspaceRoot);
  const full = resolve(workspaceRoot, userPath);
  if (full !== root && !full.startsWith(root + "/")) {
    throw new Error("Path escapes workspace");
  }
  return full;
}

/**
 * Minimal file operations confined to the workspace root.
 * Write and str_replace actions require user approval before modifying files,
 * preventing the agent from silently overwriting important content.
 */
export function createFileEditorTool(workspaceRoot: string) {
  return tool({
    description:
      "Read, write, or search-replace a text file under the workspace. Paths are relative to the workspace root. Write/str_replace operations ask for user approval.",
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
        const preview =
          input.content.length > 200
            ? input.content.slice(0, 200) + "…"
            : input.content;
        const approved = await requestApproval(
          "file_editor",
          `Write to \`${input.path}\`:\n\`\`\`\n${preview}\n\`\`\``,
        );
        if (!approved) {
          return {
            ok: false as const,
            error: "[openpaw] File write denied by user.",
          };
        }
        // Ensure parent directories exist before writing.
        const dir = dirname(abs);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(abs, input.content, "utf8");
        return { ok: true as const, wrote: abs };
      }

      // str_replace
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
      const approved = await requestApproval(
        "file_editor",
        `Replace in \`${input.path}\`:\n― old: \`${input.old_string.slice(0, 100)}\`\n+ new: \`${input.new_string.slice(0, 100)}\``,
      );
      if (!approved) {
        return {
          ok: false as const,
          error: "[openpaw] File edit denied by user.",
        };
      }
      const after = before.split(input.old_string).join(input.new_string);
      writeFileSync(abs, after, "utf8");
      return { ok: true as const, wrote: abs };
    },
  });
}
