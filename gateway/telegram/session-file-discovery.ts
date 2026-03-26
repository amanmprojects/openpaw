import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { getSessionsDir } from "../../config/paths";
import { TELEGRAM_ACTIVE_THREADS_FILENAME } from "./constants";

export type TelegramSessionListEntry = {
  sessionId: string;
  mtimeMs: number;
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
  const names = await readdir(dir);
  const entries: TelegramSessionListEntry[] = [];
  for (const name of names) {
    const sessionId = parseTelegramSessionFilename(name, chatId);
    if (!sessionId) {
      continue;
    }
    const path = join(dir, name);
    try {
      const st = await stat(path);
      entries.push({ sessionId, mtimeMs: st.mtimeMs });
    } catch {
      continue;
    }
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries;
}
