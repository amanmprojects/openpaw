import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises';
import { join, basename } from 'path';

/**
 * Read MEMORY.md from a workspace.
 */
export async function readMemory(workspacePath) {
  return tryReadFile(join(workspacePath, 'MEMORY.md'));
}

/**
 * Write to MEMORY.md (replaces content).
 */
export async function writeMemory(workspacePath, content) {
  await writeFile(join(workspacePath, 'MEMORY.md'), content, 'utf-8');
}

/**
 * Append to MEMORY.md.
 */
export async function appendMemory(workspacePath, content) {
  const memoryPath = join(workspacePath, 'MEMORY.md');
  const existing = await tryReadFile(memoryPath) || '';
  await writeFile(memoryPath, existing + '\n' + content + '\n', 'utf-8');
}

/**
 * Read a daily memory file.
 */
export async function readDailyMemory(workspacePath, date) {
  return tryReadFile(join(workspacePath, 'memory', `${date}.md`));
}

/**
 * Append to a daily memory file.
 */
export async function appendDailyMemory(workspacePath, content) {
  const today = new Date().toISOString().split('T')[0];
  const memoryDir = join(workspacePath, 'memory');
  await mkdir(memoryDir, { recursive: true });

  const dailyPath = join(memoryDir, `${today}.md`);
  const entry = `- ${new Date().toISOString()}: ${content}\n`;
  const { appendFile } = await import('fs/promises');
  await appendFile(dailyPath, entry, 'utf-8');
}

/**
 * List all daily memory files in a workspace.
 */
export async function listDailyMemories(workspacePath) {
  try {
    const memoryDir = join(workspacePath, 'memory');
    const files = await readdir(memoryDir);
    return files.filter(f => f.endsWith('.md')).sort().reverse();
  } catch {
    return [];
  }
}

async function tryReadFile(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}
