import { tool } from 'ai';
import * as fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const listDirTool = tool({
  description: 'List the contents of the given path. If no path is provided, list the contents of the current working directory.',
  inputSchema: z.object({
    path: z.optional(z.string()).describe('The path to list'),
  }),
  execute: async ({path = process.cwd()}) => {
    return { 
      contents: fs.readdirSync(path).join('\n')
    };
  },
});