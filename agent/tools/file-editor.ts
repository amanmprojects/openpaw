import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { popHistory, pushHistory } from "../file-editor-store";

type ToolSuccess = { success: true; output: string };
type ToolFailure = { success: false; error: string };

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
 * Reads a file and returns numbered lines, optionally limited to a 1-based inclusive range.
 * {@link viewRange} uses `[start_line, end_line]`; `end_line === -1` means through EOF.
 */
async function readFileWithLines(
  absPath: string,
  viewRange?: [number, number],
): Promise<string> {
  const raw = await readFile(absPath, "utf-8");
  const lines = raw.split("\n");

  if (!viewRange) {
    return lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
  }

  const [startLine, endLine] = viewRange;
  if (startLine < 1) {
    throw new Error(`view_range start_line must be >= 1, got ${startLine}`);
  }
  const startIdx = startLine - 1;
  const endExclusive = endLine === -1 ? lines.length : endLine;
  if (endLine !== -1 && endLine < startLine) {
    throw new Error(
      `view_range end_line must be >= start_line or -1, got [${startLine}, ${endLine}]`,
    );
  }
  if (startIdx > lines.length) {
    return "";
  }
  const slice = lines.slice(startIdx, Math.min(endExclusive, lines.length));
  return slice.map((line, i) => `${startIdx + i + 1}: ${line}`).join("\n");
}

/**
 * Lists directory entries with a simple file/directory marker per line.
 */
async function viewDirectory(absPath: string): Promise<string> {
  const entries = await readdir(absPath, { withFileTypes: true });
  return entries
    .map((e) => (e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`))
    .join("\n");
}

const FileEditorParams = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("view"),
    path: z.string().describe("File or directory path (relative to workspace root)"),
    view_range: z
      .tuple([z.number().int(), z.number().int()])
      .optional()
      .describe("Optional [start_line, end_line] (1-based, inclusive). Use -1 for end of file."),
  }),
  z.object({
    command: z.literal("str_replace"),
    path: z.string().describe("File path (relative to workspace root)"),
    old_str: z
      .string()
      .describe("Exact string to replace — must match including whitespace/indentation"),
    new_str: z
      .string()
      .describe("Replacement string. Can be empty to delete old_str."),
  }),
  z.object({
    command: z.literal("create"),
    path: z.string().describe("Path of the new file (relative to workspace root)"),
    file_text: z.string().describe("Full content of the file to create"),
  }),
  z.object({
    command: z.literal("insert"),
    path: z.string().describe("File path (relative to workspace root)"),
    insert_line: z
      .number()
      .int()
      .describe("Line number after which to insert. 0 = beginning of file."),
    insert_text: z.string().describe("Text to insert"),
  }),
  z.object({
    command: z.literal("undo_edit"),
    path: z.string().describe("File path whose last edit should be undone"),
  }),
]);

/**
 * Anthropic-style str_replace-based file editor: view, str_replace, create, insert, undo_edit.
 * Paths are confined under the workspace root (or `FILE_EDITOR_ROOT` when set).
 */
export function createFileEditorTool(workspaceRoot: string) {
  const allowedBase = resolve(process.env.FILE_EDITOR_ROOT ?? workspaceRoot);

  return tool({
    description: `A file editor (str_replace-based). Commands:
- view: read a file with line numbers, optional line range, or list a directory.
- str_replace: replace exactly one occurrence of old_str with new_str (exact match).
- create: create or overwrite a file (parent dirs created as needed).
- insert: insert lines after insert_line (0 = start of file).
- undo_edit: revert the last mutating change to that file.

Always view a file before str_replace. old_str must match exactly once (whitespace, newlines).`,
    inputSchema: FileEditorParams,
    execute: async (params): Promise<ToolSuccess | ToolFailure> => {
      try {
        switch (params.command) {
          case "view": {
            const abs = resolveSafe(allowedBase, params.path);
            const st = await stat(abs);
            if (st.isDirectory()) {
              const listing = await viewDirectory(abs);
              return { success: true, output: listing };
            }
            const content = await readFileWithLines(abs, params.view_range);
            return { success: true, output: content };
          }

          case "str_replace": {
            const abs = resolveSafe(allowedBase, params.path);
            const original = await readFile(abs, "utf-8");
            const occurrences = original.split(params.old_str).length - 1;
            if (occurrences === 0) {
              return {
                success: false,
                error:
                  `old_str not found in "${params.path}". ` +
                  `Verify exact whitespace/indentation by running view first.`,
              };
            }
            if (occurrences > 1) {
              return {
                success: false,
                error:
                  `old_str matched ${occurrences} locations — ` +
                  `it must match exactly once. Make old_str more specific.`,
              };
            }
            pushHistory(abs, original);
            const updated = original.replace(params.old_str, params.new_str);
            await writeFile(abs, updated, "utf-8");
            return {
              success: true,
              output: "Successfully replaced text at exactly one location.",
            };
          }

          case "create": {
            const abs = resolveSafe(allowedBase, params.path);
            await mkdir(dirname(abs), { recursive: true });
            try {
              const existing = await readFile(abs, "utf-8");
              pushHistory(abs, existing);
            } catch {
              /* new file */
            }
            await writeFile(abs, params.file_text, "utf-8");
            return {
              success: true,
              output: `File created successfully at "${params.path}".`,
            };
          }

          case "insert": {
            const abs = resolveSafe(allowedBase, params.path);
            const original = await readFile(abs, "utf-8");
            const lines = original.split("\n");
            const insertAfter = params.insert_line;
            if (insertAfter < 0 || insertAfter > lines.length) {
              return {
                success: false,
                error:
                  `insert_line ${insertAfter} is out of range ` +
                  `(file has ${lines.length} lines).`,
              };
            }
            pushHistory(abs, original);
            const newLines = [
              ...lines.slice(0, insertAfter),
              ...params.insert_text.split("\n"),
              ...lines.slice(insertAfter),
            ];
            await writeFile(abs, newLines.join("\n"), "utf-8");
            return {
              success: true,
              output:
                `Inserted ${params.insert_text.split("\n").length} ` +
                `line(s) after line ${insertAfter} in "${params.path}".`,
            };
          }

          case "undo_edit": {
            const abs = resolveSafe(allowedBase, params.path);
            const previous = popHistory(abs);
            if (previous === null) {
              return {
                success: false,
                error: `No edit history found for "${params.path}".`,
              };
            }
            await writeFile(abs, previous, "utf-8");
            return {
              success: true,
              output: `Reverted "${params.path}" to its previous state.`,
            };
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    },
  });
}
