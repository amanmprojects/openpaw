import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, parse, resolve, sep } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { popHistory, pushHistory } from "../file-editor-store";
import { isSandboxRestricted } from "../turn-context";

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
 * Reads a file and returns numbered lines in Anthropic text-editor style: padded index, ` | `, content.
 * Optional {@link viewRange} is `[start_line, end_line]` (1-based, inclusive); the slice uses the same
 * rules as the classic str_replace editor (end is passed directly to {@link String#slice}’s end index).
 */
async function readFileWithLines(
  absPath: string,
  viewRange?: [number, number],
): Promise<string> {
  const raw = await readFile(absPath, "utf-8");
  const lines = raw.split("\n");
  const start = viewRange ? viewRange[0] - 1 : 0;
  const end = viewRange ? viewRange[1] : lines.length;
  const width = String(lines.length).length;
  return lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(width)} | ${l}`)
    .join("\n");
}

/**
 * str_replace-style file editor (Anthropic `text_editor_20250728`-like), scoped by sandbox.
 * Single flat input object so models can pass one JSON shape per call.
 */
const FileEditorInputSchema = z.object({
  command: z
    .enum([
      "view",
      "create",
      "delete",
      "str_replace",
      "insert",
      "delete_lines",
      "undo_edit",
    ])
    .describe(
      '"view" to read a file or list a directory, "create" to write a new file, ' +
        '"delete" to remove a file, "str_replace" for an exact substring replace, ' +
        '"insert" to add lines after a line number, "delete_lines" to remove a line range, ' +
        '"undo_edit" to revert the last mutating change to that path.',
    ),

  path: z.string().describe("Relative or absolute path (sandbox still applies)."),

  view_range: z
    .array(z.number().int().positive())
    .length(2)
    .optional()
    .describe("Optional [start_line, end_line] to view a slice (1-indexed, inclusive)."),

  file_text: z.string().optional().describe('Full content for "create".'),

  old_str: z
    .string()
    .optional()
    .describe(
      "Exact string to find for str_replace — must match whitespace/indentation; copy from view output.",
    ),

  new_str: z
    .string()
    .optional()
    .describe("Replacement for str_replace; may be empty to delete old_str."),

  insert_line: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Insert insert_text AFTER this line; 0 inserts at the top."),

  insert_text: z.string().optional().describe("Text to insert (may be multiple lines)."),

  start_line: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("First line to delete (1-based, inclusive) for delete_lines."),

  end_line: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Last line to delete (1-based, inclusive) for delete_lines."),
});

type FileEditorInput = z.infer<typeof FileEditorInputSchema>;

/**
 * Resolves the root directory for file_editor paths: workspace (or `FILE_EDITOR_ROOT`) when
 * sandbox is on, or the OS filesystem root when sandbox is off.
 */
function allowedBaseFor(workspaceRoot: string): string {
  if (isSandboxRestricted()) {
    return resolve(process.env.FILE_EDITOR_ROOT ?? workspaceRoot);
  }
  return parse(process.cwd()).root;
}

/**
 * Portable str_replace-style file editor: view, create, delete, str_replace, insert, delete_lines,
 * undo_edit. Paths are confined under the workspace root (or `FILE_EDITOR_ROOT` when set), unless
 * the sandbox is off for this turn.
 */
export function createFileEditorTool(workspaceRoot: string) {
  return tool({
    description: `
A file editor for viewing and editing files.

COMMANDS:
- view         → Read a file with line numbers (pipe-separated). Always do this before editing.
- create       → Create a new file with given content.
- delete       → Delete a file.
- str_replace  → Replace an exact string with new text. old_str must match exactly, including
                 whitespace and indentation. Use "view" first to copy it precisely.
- insert       → Insert new lines after a given line number (0 = top).
- delete_lines → Delete a range of lines (1-based, inclusive).
- undo_edit    → Revert the last mutating change to that file (OpenPaw extension).

IMPORTANT: For str_replace, copy old_str character-for-character from the view output.
Even a single space difference will cause the edit to fail.
`.trim(),
    inputSchema: FileEditorInputSchema,
    execute: async (params: FileEditorInput): Promise<ToolSuccess | ToolFailure> => {
      const allowedBase = allowedBaseFor(workspaceRoot);
      const {
        command,
        path: filePath,
        view_range,
        file_text,
        old_str,
        new_str,
        insert_line,
        insert_text,
        start_line,
        end_line,
      } = params;

      try {
        switch (command) {
          case "view": {
            const abs = resolveSafe(allowedBase, filePath);
            const st = await stat(abs);
            if (st.isDirectory()) {
              const names = await readdir(abs);
              return {
                success: true,
                output: `Directory: ${filePath}\n${names.join("\n")}`,
              };
            }
            const rangeTuple =
              view_range !== undefined
                ? ([view_range[0], view_range[1]] as [number, number])
                : undefined;
            const content = await readFileWithLines(abs, rangeTuple);
            return { success: true, output: content };
          }

          case "create": {
            if (file_text == null) {
              return { success: false, error: "file_text is required for create." };
            }
            const abs = resolveSafe(allowedBase, filePath);
            await mkdir(dirname(abs), { recursive: true });
            try {
              const existing = await readFile(abs, "utf-8");
              pushHistory(abs, existing);
            } catch {
              /* new file */
            }
            await writeFile(abs, file_text, "utf-8");
            const lineCount = file_text.split("\n").length;
            return {
              success: true,
              output: `Created ${filePath} (${lineCount} lines).`,
            };
          }

          case "delete": {
            const abs = resolveSafe(allowedBase, filePath);
            const previous = await readFile(abs, "utf-8");
            pushHistory(abs, previous);
            await unlink(abs);
            return { success: true, output: `Deleted ${filePath}.` };
          }

          case "str_replace": {
            if (old_str == null) {
              return { success: false, error: "old_str is required for str_replace." };
            }
            const abs = resolveSafe(allowedBase, filePath);
            const content = await readFile(abs, "utf-8");
            const occurrences = content.split(old_str).length - 1;
            if (occurrences === 0) {
              return {
                success: false,
                error:
                  `old_str not found in ${filePath}. ` +
                  `Tip: Use "view" to copy the exact string including whitespace/indentation.`,
              };
            }
            if (occurrences > 1) {
              return {
                success: false,
                error:
                  `old_str matches ${occurrences} locations in ${filePath}. ` +
                  `Add more surrounding context to old_str to make it unique.`,
              };
            }
            pushHistory(abs, content);
            await writeFile(abs, content.replace(old_str, new_str ?? ""), "utf-8");
            return {
              success: true,
              output: `str_replace applied successfully in ${filePath}.`,
            };
          }

          case "insert": {
            if (insert_line == null) {
              return { success: false, error: "insert_line is required for insert." };
            }
            if (insert_text == null || insert_text === "") {
              return { success: false, error: "insert_text is required for insert." };
            }
            const abs = resolveSafe(allowedBase, filePath);
            const original = await readFile(abs, "utf-8");
            const lines = original.split("\n");
            pushHistory(abs, original);
            lines.splice(insert_line, 0, ...insert_text.split("\n"));
            await writeFile(abs, lines.join("\n"), "utf-8");
            return {
              success: true,
              output: `Inserted ${insert_text.split("\n").length} line(s) after line ${insert_line} in ${filePath}.`,
            };
          }

          case "delete_lines": {
            if (start_line == null) {
              return { success: false, error: "start_line is required for delete_lines." };
            }
            if (end_line == null) {
              return { success: false, error: "end_line is required for delete_lines." };
            }
            const abs = resolveSafe(allowedBase, filePath);
            const original = await readFile(abs, "utf-8");
            const lines = original.split("\n");
            pushHistory(abs, original);
            lines.splice(start_line - 1, end_line - start_line + 1);
            await writeFile(abs, lines.join("\n"), "utf-8");
            return {
              success: true,
              output: `Deleted lines ${start_line}–${end_line} from ${filePath}.`,
            };
          }

          case "undo_edit": {
            const abs = resolveSafe(allowedBase, filePath);
            const previous = popHistory(abs);
            if (previous === null) {
              return {
                success: false,
                error: `No edit history found for "${filePath}".`,
              };
            }
            try {
              await stat(abs);
              await writeFile(abs, previous, "utf-8");
            } catch {
              await mkdir(dirname(abs), { recursive: true });
              await writeFile(abs, previous, "utf-8");
            }
            return {
              success: true,
              output: `Reverted "${filePath}" to its previous state.`,
            };
          }

          default: {
            const _exhaustive: never = command;
            return { success: false, error: `Unknown command: ${_exhaustive}` };
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
      }
    },
  });
}
