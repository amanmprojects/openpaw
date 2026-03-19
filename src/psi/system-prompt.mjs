import { readFile } from 'fs/promises';
import { join } from 'path';

export async function buildSystemPrompt(workspacePath, isMainSession = true) {
  const files = [
    { file: 'AGENTS.md', required: false },
    { file: 'IDENTITY.md', required: false },
    { file: 'SOUL.md', required: false },
    { file: 'USER.md', required: false },
    { file: 'TOOLS.md', required: false },
  ];

  const parts = [];

  for (const { file } of files) {
    const content = await tryReadFile(join(workspacePath, file));
    if (content) {
      parts.push(content);
    }
  }

  // Load today's and yesterday's daily memory
  const today = new Date().toISOString().split('T')[0];
  const yesterday = getYesterday();

  const dailyToday = await tryReadFile(join(workspacePath, 'memory', `${today}.md`));
  if (dailyToday) parts.push(`## Today's Memory (${today})\n\n${dailyToday}`);

  const dailyYesterday = await tryReadFile(join(workspacePath, 'memory', `${yesterday}.md`));
  if (dailyYesterday) parts.push(`## Yesterday's Memory (${yesterday})\n\n${dailyYesterday}`);

  // MEMORY.md only for main sessions
  if (isMainSession) {
    const longTerm = await tryReadFile(join(workspacePath, 'MEMORY.md'));
    if (longTerm) parts.push(longTerm);
  }

  return parts.join('\n\n---\n\n');
}

async function tryReadFile(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
