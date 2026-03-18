// tools/strReplaceEditor.ts
// Simple str_replace-style file editor — mirrors Anthropic's text_editor_20250728
// but as a fully portable custom AI SDK tool for any OpenAI-compatible endpoint.

import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export const strReplaceEditorTool = tool({
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

    path: z
      .string()
      .describe('Relative or absolute path to the target file.'),

    // view
    view_range: z
      .array(z.number().int().positive())
      .length(2)
      .optional()
      .describe('Optional [start_line, end_line] to view a slice (1-indexed, inclusive).'),

    // create
    file_text: z
      .string()
      .optional()
      .describe('Full content for the new file (used with "create").'),

    // str_replace
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

    // insert
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

    // delete_lines
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
  }): Promise<string> => {
    try {
      const abs = path.resolve(filePath);

      switch (command) {
        case 'view': {
          const stat = fs.statSync(abs);
          if (stat.isDirectory()) {
            return `Directory: ${filePath}\n${fs.readdirSync(abs).join('\n')}`;
          }
          const lines = fs.readFileSync(abs, 'utf-8').split('\n');
          const start = view_range ? view_range[0] - 1 : 0;
          const end   = view_range ? view_range[1]     : lines.length;
          const width = String(lines.length).length;
          return lines
            .slice(start, end)
            .map((l, i) => `${String(start + i + 1).padStart(width)} | ${l}`)
            .join('\n');
        }

        case 'create': {
          if (file_text == null) return 'Error: file_text is required for create.';
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, file_text, 'utf-8');
          const lineCount = file_text.split('\n').length;
          return `Created ${filePath} (${lineCount} lines).`;
        }

        case 'delete': {
          fs.unlinkSync(abs);
          return `Deleted ${filePath}.`;
        }

        case 'str_replace': {
          if (old_str == null) return 'Error: old_str is required for str_replace.';
          const content = fs.readFileSync(abs, 'utf-8');

          // Warn on multiple matches — ambiguous replacement
          const occurrences = content.split(old_str).length - 1;
          if (occurrences === 0)
            return (
              `Error: old_str not found in ${filePath}.\n` +
              `Tip: Use "view" to copy the exact string including whitespace/indentation.`
            );
          if (occurrences > 1)
            return (
              `Error: old_str matches ${occurrences} locations in ${filePath}. ` +
              `Add more surrounding context to old_str to make it unique.`
            );

          fs.writeFileSync(abs, content.replace(old_str, new_str ?? ''), 'utf-8');
          return `str_replace applied successfully in ${filePath}.`;
        }

        case 'insert': {
          if (insert_line == null) return 'Error: insert_line is required for insert.';
          if (!insert_text)        return 'Error: insert_text is required for insert.';
          const lines = fs.readFileSync(abs, 'utf-8').split('\n');
          lines.splice(insert_line, 0, ...insert_text.split('\n'));
          fs.writeFileSync(abs, lines.join('\n'), 'utf-8');
          return `Inserted ${insert_text.split('\n').length} line(s) after line ${insert_line} in ${filePath}.`;
        }

        case 'delete_lines': {
          if (start_line == null) return 'Error: start_line is required for delete_lines.';
          if (end_line == null)   return 'Error: end_line is required for delete_lines.';
          const lines = fs.readFileSync(abs, 'utf-8').split('\n');
          lines.splice(start_line - 1, end_line - start_line + 1);
          fs.writeFileSync(abs, lines.join('\n'), 'utf-8');
          return `Deleted lines ${start_line}–${end_line} from ${filePath}.`;
        }

        default:
          return `Unknown command: ${command}`;
      }
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
});
