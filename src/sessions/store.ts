import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import type { Session } from '../types/index.js';

export function getSessionPath(workspacePath: string, channel: string, sessionId: string): string {
  return join(workspacePath, 'sessions', channel, `${sessionId}.json`);
}

export async function loadSession(
  workspacePath: string,
  sessionId: string,
  channel: string
): Promise<Session | null> {
  const path = getSessionPath(workspacePath, channel, sessionId);
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(workspacePath: string, session: Session): Promise<void> {
  const path = getSessionPath(workspacePath, session.channel, session.id);
  const dir = join(workspacePath, 'sessions', session.channel);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), 'utf-8');
}

export async function listSessions(workspacePath: string, channel: string): Promise<string[]> {
  const dir = join(workspacePath, 'sessions', channel);
  try {
    const files = await readdir(dir);
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

export async function deleteSession(
  workspacePath: string,
  sessionId: string,
  channel: string
): Promise<boolean> {
  const path = getSessionPath(workspacePath, channel, sessionId);
  try {
    const { unlink } = await import('fs/promises');
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}
