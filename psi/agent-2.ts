import { ToolLoopAgent} from 'ai';
import type { ModelMessage } from 'ai';
import { wrappedLitellm } from './providers/litellm.ts';
import * as readline from 'node:readline/promises';
import { env, stdin as input, stdout as output } from 'node:process';
import { strReplaceEditorTool } from './tools/file-editor-str-replace-based.ts';
import { listDirTool } from './tools/list-dir.ts';
import { webSearch } from '@exalabs/ai-sdk';


export const agent = new ToolLoopAgent({
  model: wrappedLitellm('zai-org/glm-4.7-maas'),
  instructions: `You are a helpful coding agent that can view and edit files.

EDITING RULES:
1. ALWAYS use "view" before any edit to see the exact file content with line numbers.
2. For str_replace: copy old_str CHARACTER-FOR-CHARACTER from the view output. Even a single space difference will fail.
3. If old_str matches multiple locations, add more surrounding context to make it unique.
4. Prefer str_replace over insert/delete_lines for most edits — it's safer and more precise.

WORKFLOW:
- View the file first to understand context
- Copy the exact string you want to replace
- Make your edit
- View the file again to verify the change`,
  tools: {
    fileEditor: strReplaceEditorTool,
    listDir: listDirTool,
    webSearch: webSearch({ apiKey: env.EXA_API_KEY })
  },
});

// Persistent history that survives across turns
const messages: ModelMessage[] = [];



async function runWithPrompt(prompt: string) {
  messages.push({ role: 'user', content: prompt });
  const result = await agent.stream({ messages });

  let inReasoning = false;
  // State for streaming tool input
  let partialInput = '';
  let statusLineActive = false;  // tracks if we printed a ⟳ line we need to overwrite

  for await (const part of result.fullStream) {
    switch (part.type) {

      case 'tool-input-start': {
        // Reset accumulator for each new tool call
        partialInput = '';
        statusLineActive = false;
        // Show a generic placeholder until we know command + path
        process.stdout.write(`\n\x1b[33m⟳ ${part.toolName}...\x1b[0m`);
        statusLineActive = true;
        break;
      }

      case 'tool-input-delta': {
        partialInput += part.delta;
        // command and path appear early in the JSON — grab them as soon as possible
        const commandMatch = partialInput.match(/"command"\s*:\s*"([^"]+)"/);
        const pathMatch    = partialInput.match(/"path"\s*:\s*"([^"]+)"/);

        if (commandMatch && pathMatch) {
          const command = commandMatch[1];   // e.g. "create", "str_replace", "view"
          const filePath = pathMatch[1];

          const label: Record<string, string> = {
            view:         `\x1b[34m👁  Viewing\x1b[0m`,
            create:       `\x1b[32m✦  Creating\x1b[0m`,
            str_replace:  `\x1b[33m✎  Editing\x1b[0m`,
            insert:       `\x1b[33m✎  Inserting into\x1b[0m`,
            delete_lines: `\x1b[31m✂  Deleting lines in\x1b[0m`,
            delete:       `\x1b[31m🗑  Deleting\x1b[0m`,
          };

          // Overwrite the ⟳ placeholder line with the real status
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(`${label[command] ?? `⟳ ${command}`} \x1b[1m${filePath}\x1b[0m`);
        }
        break;
      }

      case 'tool-input-end': {
        // Move to next line after the status — tool is about to execute
        process.stdout.write('\n');
        statusLineActive = false;
        break;
      }

      case 'reasoning-delta':
        inReasoning = true;
        process.stdout.write('\x1b[90m' + part.text + '\x1b[0m');
        break;

      case 'text-delta':
        if (inReasoning) { inReasoning = false; process.stdout.write('\n'); }
        process.stdout.write(part.text);
        break;

      case 'tool-call':
        // Already handled above via tool-input-* events, no need to re-print
        break;

      case 'finish':
        console.log('\n─────────────────────────────────────────────');
        console.log('Finish reason:', part.finishReason);
        console.log('─────────────────────────────────────────────');
        break;
    }
  }
  
  const { messages: responseMessages } = await result.response;
  messages.push(...responseMessages);
}


const rl = readline.createInterface({ input, output });

console.log('\n─────────────────────────────────────────────');
console.log('Initial analysis complete. You can now ask follow-up questions.');
console.log('Type "exit" or "quit" to end the session.');
console.log('─────────────────────────────────────────────\n');

let running = true;

while (running) {
  try {
    const answer = await rl.question('You: ');

    if (answer.toLowerCase() === 'exit' || answer.toLowerCase() === 'quit') {
      console.log('Goodbye!');
      running = false;
    } else {
      await runWithPrompt(answer);
    }
  } catch (error) {
    console.error('\nError:', error);
    running = false;
  }
}

rl.close();
