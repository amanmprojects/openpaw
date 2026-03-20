import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';

export function getTools(workspacePath: string) {
  return {
    bash: tool({
      description: 'Execute a bash command in the workspace directory',
      inputSchema: z.object({
        command: z.string().describe('The bash command to execute'),
      }),
      execute: async ({ command }: { command: string }) => {
        return new Promise((resolve) => {
          exec(command, {
            cwd: workspacePath,
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          }, (error, stdout, stderr) => {
            const output: string[] = [];
            if (stdout) output.push(stdout);
            if (stderr) output.push(`[stderr]\n${stderr}`);
            if (error) output.push(`[exit code ${error.code}]`);
            resolve(output.join('\n').trim() || '[No output]');
          });
        });
      },
    }),

    read_file: tool({
      description: 'Read the contents of a file from the workspace',
      inputSchema: z.object({
        path: z.string().describe('File path relative to workspace root'),
      }),
      execute: async ({ path }: { path: string }) => {
        try {
          const fullPath = join(workspacePath, path);
          const content = await readFile(fullPath, 'utf-8');
          return content;
        } catch (err) {
          const error = err as Error;
          return `Error reading file: ${error.message}`;
        }
      },
    }),

    write_file: tool({
      description: 'Write or create a file in the workspace',
      inputSchema: z.object({
        path: z.string().describe('File path relative to workspace root'),
        content: z.string().describe('File content to write'),
      }),
      execute: async ({ path, content }: { path: string; content: string }) => {
        try {
          const fullPath = join(workspacePath, path);
          await writeFile(fullPath, content, 'utf-8');
          return `File written: ${path}`;
        } catch (err) {
          const error = err as Error;
          return `Error writing file: ${error.message}`;
        }
      },
    }),

    memory_save: tool({
      description: 'Save a memory note. Appends to MEMORY.md for long-term memories or to the daily memory file.',
      inputSchema: z.object({
        content: z.string().describe('The memory content to save'),
        type: z.enum(['long-term', 'daily']).default('long-term').describe('Type of memory'),
      }),
      execute: async ({ content, type }: { content: string; type: string }) => {
        try {
          const today = new Date().toISOString().split('T')[0];
          if (type === 'daily') {
            const dailyPath = join(workspacePath, 'memory', `${today}.md`);
            const entry = `\n- ${new Date().toISOString()}: ${content}\n`;
            await mkdir(join(workspacePath, 'memory'), { recursive: true });
            await appendFile(dailyPath, entry, 'utf-8');
            return `Saved to daily memory: memory/${today}.md`;
          } else {
            const memoryPath = join(workspacePath, 'MEMORY.md');
            await appendFile(memoryPath, `\n${content}\n`, 'utf-8');
            return 'Saved to MEMORY.md';
          }
        } catch (err) {
          const error = err as Error;
          return `Error saving memory: ${error.message}`;
        }
      },
    }),
  };
}
