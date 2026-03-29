/**
 * Discovery of persisted Telegram sessions for one chat.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { getSessionsDir } from "../../config/paths";
import { parseSessionMetadataFromContent } from "../../agent/session-store";
import { TELEGRAM_ACTIVE_THREADS_FILENAME } from "./constants";

export type TelegramSessionListEntry = {
  sessionId: string;
  mtimeMs: number;
  title: string | null;
  pinned: boolean;
  updatedAt: string | null;
};

function parseTelegramSessionFilename(
  filename: string,
  chatId: number,
): string | null {
  if (!filename.endsWith(".json") || filename === TELEGRAM_ACTIVE_THREADS_FILENAME) {
    return null;
  }
  const stem = filename.slice(0, -".json".length);
  const idStr = String(chatId);
  const prefix = `telegram_${idStr}`;
  if (stem === prefix) {
    return `telegram:${chatId}`;
  }
  if (stem.startsWith(`${prefix}_`)) {
    const suffix = stem.slice(prefix.length + 1);
    if (!suffix) {
      return null;
    }
    return `telegram:${chatId}:${suffix}`;
  }
  return null;
}

function parseTelegramSessionDirectory(dirname: string, chatId: number): string | null {
  const idStr = String(chatId);
  const prefix = `telegram_${idStr}`;
  if (dirname === prefix) {
    return `telegram:${chatId}`;
  }
  if (dirname.startsWith(`${prefix}_`)) {
    const suffix = dirname.slice(prefix.length + 1);
    if (!suffix) {
      return null;
    }
    return `telegram:${chatId}:${suffix}`;
  }
  return null;
}

/**
 * Lists on-disk session files for this Telegram chat, newest first.
 */
export async function listTelegramSessionsForChat(
  chatId: number,
): Promise<TelegramSessionListEntry[]> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    return [];
  }
  const names = await readdir(dir, { withFileTypes: true });
  const entriesBySessionId = new Map<string, TelegramSessionListEntry>();
  for (const name of names) {
    const sessionId = name.isDirectory()
      ? parseTelegramSessionDirectory(name.name, chatId)
      : parseTelegramSessionFilename(name.name, chatId);
    if (!sessionId) {
      continue;
    }
    const path = name.isDirectory() ? join(dir, name.name, "session.json") : join(dir, name.name);
    if (!existsSync(path)) {
      continue;
    }
    try {
      const st = await stat(path);
      const raw = await Bun.file(path).text();
      const metadata = parseSessionMetadataFromContent(sessionId, raw);
      const nextEntry = {
        sessionId,
        mtimeMs: st.mtimeMs,
        title: metadata?.title ?? null,
        pinned: metadata?.pinned ?? false,
        updatedAt: metadata?.updatedAt ?? null,
      };
      const prior = entriesBySessionId.get(sessionId);
      if (!prior || nextEntry.mtimeMs > prior.mtimeMs) {
        entriesBySessionId.set(sessionId, nextEntry);
      }
    } catch {
      continue;
    }
  }
  const entries = [...entriesBySessionId.values()];
  entries.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.mtimeMs - a.mtimeMs;
  });
  return entries;
}
