import { tool } from 'ai';
import { z } from 'zod';
import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';

export function createMemorySaveTool(workspacePath: string) {
  return tool({
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
  });
}
