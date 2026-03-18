import { ToolLoopAgent } from 'ai';
import { listDirTool } from './tools/list-dir.ts';
import { wrappedLitellm } from './providers/litellm.ts';
import { readFileTool } from './tools/read-file.ts';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { strReplaceEditorTool } from './tools/file-editor-str-replace-based.ts';

export const agent = new ToolLoopAgent({
  model: wrappedLitellm('zai-org/glm-4.7-maas'),
  instructions: 'You are a helpful assistant that analyzes the current directory and provides a summary of the files and directories.',
  tools: {
    listDir: listDirTool,
    readFile: readFileTool,
  },
});

async function runWithPrompt(prompt: string) {
  const result = await agent.stream({ prompt });

  let inReasoning = false;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'reasoning-delta':
        inReasoning = true;
        process.stdout.write('\x1b[90m' + part.text + '\x1b[0m');
        break;
      case 'text-delta':
        if (inReasoning) {
          inReasoning = false;
          process.stdout.write('\n');
        }
        process.stdout.write(part.text);
        break;
      case 'tool-call':
        console.log('\n─────────────────────────────────────────────');
        console.log('Tool called:', part.toolName);
        const inputStr = JSON.stringify(part.input, null, 2) ?? 'undefined';
        console.log('Input:', inputStr.replace(/\n/g, '\n '));
        console.log('─────────────────────────────────────────────');
        break;
      case 'finish':
        console.log('\n─────────────────────────────────────────────');
        console.log('Finish reason:', part.finishReason);
        console.log('─────────────────────────────────────────────');
        break;
    }
  }
}

await runWithPrompt('Analyze the codebase in the current directory and provide a summary of the files and directories.');

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