import { tool } from 'ai';
import { z } from 'zod';
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join, dirname } from 'path';

export function createFileEditorTool(workspacePath: string) {
  return tool({
    description: `
A file editor tool for viewing and editing files.

COMMANDS:
- view         → Read a file with line numbers. Always do this before editing.
- create       → Create a new file with given content.
- delete       → Delete a file.
- str_replace  → Replace an exact string with new text. The old_str must match exactly
                 including all whitespace and indentation. Use "view" first to copy it precisely.
- insert       → Insert new lines after a given line number.
- delete_lines → Delete a range of lines.

IMPORTANT: For str_replace, copy old_str character-for-character from the view output.
Even a single space difference will cause the edit to fail.
`.trim(),
    inputSchema: z.object({
      command: z
        .enum(['view', 'create', 'delete', 'str_replace', 'insert', 'delete_lines'])
        .describe(
          '"view" to read a file, "create" to write a new file, ' +
          '"delete" to delete a file, ' +
          '"str_replace" to replace an exact string match, ' +
          '"insert" to add lines after a line number, ' +
          '"delete_lines" to remove a line range.'
        ),
      path: z.string().describe('File path relative to workspace root.'),
      view_range: z
        .array(z.number().int().positive())
        .length(2)
        .optional()
        .describe('Optional [start_line, end_line] to view a slice (1-indexed, inclusive).'),
      file_text: z
        .string()
        .optional()
        .describe('Full content for the new file (used with "create").'),
      old_str: z
        .string()
        .optional()
        .describe(
          'The exact string to find and replace. Must match whitespace and indentation perfectly. ' +
          'Copy it verbatim from the "view" output.'
        ),
      new_str: z
        .string()
        .optional()
        .describe('The string to replace old_str with. Can be empty to effectively delete old_str.'),
      insert_line: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Insert insert_text AFTER this line number. Use 0 to insert at the top of the file.'),
      insert_text: z
        .string()
        .optional()
        .describe('Text to insert. Can be multiple lines.'),
      start_line: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('First line to delete (1-indexed, inclusive).'),
      end_line: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Last line to delete (1-indexed, inclusive).'),
    }),
    execute: async ({
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
    }) => {
      try {
        const abs = join(workspacePath, filePath);

        switch (command) {
          case 'view': {
            const s = await stat(abs);
            if (s.isDirectory()) {
              const entries = await readdir(abs);
              return `Directory: ${filePath}\n${entries.join('\n')}`;
            }
            const content = await readFile(abs, 'utf-8');
            const lines = content.split('\n');
            const start = view_range ? (view_range[0] ?? 1) - 1 : 0;
            const end = view_range ? view_range[1] ?? lines.length : lines.length;
            const width = String(lines.length).length;
            return lines
              .slice(start, end)
              .map((l, i) => `${String(start + i + 1).padStart(width)} | ${l}`)
              .join('\n');
          }

          case 'create': {
            if (file_text == null) return 'Error: file_text is required for create.';
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, file_text, 'utf-8');
            const lineCount = file_text.split('\n').length;
            return `Created ${filePath} (${lineCount} lines).`;
          }

          case 'delete': {
            await unlink(abs);
            return `Deleted ${filePath}.`;
          }

          case 'str_replace': {
            if (old_str == null) return 'Error: old_str is required for str_replace.';
            const content = await readFile(abs, 'utf-8');

            const occurrences = content.split(old_str).length - 1;
            if (occurrences === 0) {
              return (
                `Error: old_str not found in ${filePath}.\n` +
                `Tip: Use "view" to copy the exact string including whitespace/indentation.`
              );
            }
            if (occurrences > 1) {
              return (
                `Error: old_str matches ${occurrences} locations in ${filePath}. ` +
                `Add more surrounding context to old_str to make it unique.`
              );
            }

            await writeFile(abs, content.replace(old_str, new_str ?? ''), 'utf-8');
            return `str_replace applied successfully in ${filePath}.`;
          }

          case 'insert': {
            if (insert_line == null) return 'Error: insert_line is required for insert.';
            if (!insert_text) return 'Error: insert_text is required for insert.';
            const content = await readFile(abs, 'utf-8');
            const lines = content.split('\n');
            lines.splice(insert_line, 0, ...insert_text.split('\n'));
            await writeFile(abs, lines.join('\n'), 'utf-8');
            return `Inserted ${insert_text.split('\n').length} line(s) after line ${insert_line} in ${filePath}.`;
          }

          case 'delete_lines': {
            if (start_line == null) return 'Error: start_line is required for delete_lines.';
            if (end_line == null) return 'Error: end_line is required for delete_lines.';
            const content = await readFile(abs, 'utf-8');
            const lines = content.split('\n');
            lines.splice(start_line - 1, end_line - start_line + 1);
            await writeFile(abs, lines.join('\n'), 'utf-8');
            return `Deleted lines ${start_line}–${end_line} from ${filePath}.`;
          }

          default:
            return `Unknown command: ${command}`;
        }
      } catch (err) {
        const error = err as Error;
        return `Error: ${error.message}`;
      }
    },
  });
}
