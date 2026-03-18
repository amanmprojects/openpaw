import { tool } from 'ai';
import * as fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const readFileTool = tool({
  description: 'Read the contents of the given file.',
  inputSchema: z.object({
    path: z.string().describe('The path to the file to read'),
  }),
  execute: async ({path}) => fs.readFileSync(path, 'utf8'),
});