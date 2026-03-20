import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

export function createBashTool(workspacePath: string) {
  return tool({
    description: 'Execute a bash command in the workspace directory with configurable timeout.',
    inputSchema: z.object({
      command: z.string().describe('The bash command to execute'),
      timeout: z.number().optional().default(30000).describe('Timeout in milliseconds (default: 30000)'),
      cwd: z.string().optional().describe('Working directory relative to workspace root (default: workspace root)'),
    }),
    execute: async ({ command, timeout = 30000, cwd }: { command: string; timeout?: number; cwd?: string }) => {
      try {
        const workingDir = cwd ? join(workspacePath, cwd) : workspacePath;
        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          timeout,
          maxBuffer: 1024 * 1024 * 10,
        });

        const output: string[] = [];
        if (stdout.trim()) output.push(stdout.trim());
        if (stderr.trim()) output.push(`[stderr]\n${stderr.trim()}`);
        
        return output.join('\n') || '[No output]';
      } catch (err) {
        const error = err as Error & { stderr?: string; stdout?: string; code?: number };
        const output: string[] = [];
        
        if (error.stdout) output.push(error.stdout.trim());
        if (error.stderr) output.push(`[stderr]\n${error.stderr.trim()}`);
        if (error.code !== undefined) output.push(`[exit code ${error.code}]`);
        if (error.message && !error.stderr && !error.stdout) {
          output.push(`Error: ${error.message}`);
        }
        
        return output.join('\n') || '[No output]';
      }
    },
  });
}
