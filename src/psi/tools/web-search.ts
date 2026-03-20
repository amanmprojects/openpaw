import { tool } from 'ai';
import { z } from 'zod';

export function createWebSearchTool() {
  return tool({
    description: 'Search the web using Exa AI. Returns relevant web pages with content snippets.',
    inputSchema: z.object({
      query: z.string().describe('The search query'),
      numResults: z.number().optional().default(10).describe('Number of results to return (default: 10)'),
    }),
    execute: async ({ query, numResults = 10 }: { query: string; numResults?: number }) => {
      try {
        const apiKey = process.env.EXA_API_KEY;
        if (!apiKey) {
          return 'Error: EXA_API_KEY not set. Add it to your .env file.';
        }

        const response = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            query,
            type: 'auto',
            numResults,
            contents: {
              text: { maxCharacters: 3000 },
              livecrawl: 'fallback',
            },
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          return `Error: Exa API returned ${response.status}: ${text}`;
        }

        const data = await response.json() as { results?: Array<{ url?: string; title?: string; text?: string }> };
        
        if (!data.results || data.results.length === 0) {
          return 'No results found.';
        }

        return data.results
          .map((r, i) => `[${i + 1}] ${r.title || 'Untitled'}\n    ${r.url}\n    ${r.text?.slice(0, 500) || ''}...`)
          .join('\n\n');
      } catch (err) {
        const error = err as Error;
        return `Error: ${error.message}`;
      }
    },
  });
}
