import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises';
import { join } from 'path';

/**
 * Get the session file path for a session.
 */
export function getSessionPath(workspacePath, channel, sessionId) {
  return join(workspacePath, 'sessions', channel, `${sessionId}.json`);
}

/**
 * Load a session from disk.
 */
export async function loadSession(workspacePath, sessionId, channel) {
  const path = getSessionPath(workspacePath, channel, sessionId);
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save a session to disk.
 */
export async function saveSession(workspacePath, session) {
  const path = getSessionPath(workspacePath, session.channel, session.id);
  const dir = join(workspacePath, 'sessions', session.channel);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * List all sessions for a channel.
 */
export async function listSessions(workspacePath, channel) {
  const dir = join(workspacePath, 'sessions', channel);
  try {
    const files = await readdir(dir);
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Delete a session file.
 */
export async function deleteSession(workspacePath, sessionId, channel) {
  const path = getSessionPath(workspacePath, channel, sessionId);
  try {
    const { unlink } = await import('fs/promises');
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}
