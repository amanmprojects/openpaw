import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import type { Session, SessionListItem } from '../types/index.js';

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
  session.updatedAt = new Date().toISOString();
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

export async function listSessionsWithMeta(
  workspacePath: string,
  channel: string,
  limit: number = 10
): Promise<SessionListItem[]> {
  const sessionIds = await listSessions(workspacePath, channel);
  const sessions: SessionListItem[] = [];

  for (const id of sessionIds) {
    try {
      const session = await loadSession(workspacePath, id, channel);
      if (session) {
        sessions.push({
          id: session.id,
          title: session.title || generateTitleFromMessages(session.messages),
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
        });
      }
    } catch {
      // Skip corrupted sessions
    }
  }

  sessions.sort((a, b) => {
    const dateA = a.updatedAt || a.createdAt;
    const dateB = b.updatedAt || b.createdAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return sessions.slice(0, limit);
}

function generateTitleFromMessages(messages: Session['messages']): string {
  if (!messages) return 'Untitled Chat';
  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      const lines = content.split('\n');
      const firstLine = lines[0]?.trim() || '';
      if (firstLine) {
        return firstLine.length > 40 ? firstLine.substring(0, 37) + '...' : firstLine;
      }
    }
  }
  return 'Untitled Chat';
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
