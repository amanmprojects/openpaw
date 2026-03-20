import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';

export async function readMemory(workspacePath: string): Promise<string | null> {
  return tryReadFile(join(workspacePath, 'MEMORY.md'));
}

export async function writeMemory(workspacePath: string, content: string): Promise<void> {
  await writeFile(join(workspacePath, 'MEMORY.md'), content, 'utf-8');
}

export async function appendMemory(workspacePath: string, content: string): Promise<void> {
  const memoryPath = join(workspacePath, 'MEMORY.md');
  const existing = await tryReadFile(memoryPath) || '';
  await writeFile(memoryPath, existing + '\n' + content + '\n', 'utf-8');
}

export async function readDailyMemory(workspacePath: string, date: string): Promise<string | null> {
  return tryReadFile(join(workspacePath, 'memory', `${date}.md`));
}

export async function appendDailyMemory(workspacePath: string, content: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const memoryDir = join(workspacePath, 'memory');
  await mkdir(memoryDir, { recursive: true });

  const dailyPath = join(memoryDir, `${today}.md`);
  const entry = `- ${new Date().toISOString()}: ${content}\n`;
  const { appendFile } = await import('fs/promises');
  await appendFile(dailyPath, entry, 'utf-8');
}

export async function listDailyMemories(workspacePath: string): Promise<string[]> {
  try {
    const memoryDir = join(workspacePath, 'memory');
    const files = await readdir(memoryDir);
    return files.filter(f => f.endsWith('.md')).sort().reverse();
  } catch {
    return [];
  }
}

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}
