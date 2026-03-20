import { tool } from 'ai';
import { z } from 'zod';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { formatBytes } from './utils.js';

export function createListDirTool(workspacePath: string) {
  return tool({
    description: 'List directory contents with file information. Shows files and subdirectories with sizes.',
    inputSchema: z.object({
      path: z.string().optional().describe('Directory path relative to workspace root. Defaults to workspace root.'),
    }),
    execute: async ({ path }: { path?: string }) => {
      try {
        const targetPath = path ? join(workspacePath, path) : workspacePath;
        const entries = await readdir(targetPath, { withFileTypes: true });
        
        if (entries.length === 0) {
          return 'Directory is empty.';
        }

        const lines = await Promise.all(
          entries.map(async (entry) => {
            const fullPath = join(targetPath, entry.name);
            let size = '';
            let modified = '';
            
            try {
              const s = await stat(fullPath);
              if (entry.isDirectory()) {
                size = '<DIR>';
              } else {
                size = formatBytes(s.size);
              }
              modified = s.mtime?.toISOString().split('T')[0] || '?';
            } catch {
              size = '?';
            }
            
            const type = entry.isDirectory() ? 'd' : 'f';
            return `${type}  ${size.padEnd(12)} ${modified}  ${entry.name}`;
          })
        );

        return `Directory: ${path || '.'}\n\n${lines.join('\n')}`;
      } catch (err) {
        const error = err as Error;
        return `Error listing directory: ${error.message}`;
      }
    },
  });
}
