import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { getSessionsDir } from "../../config/paths";
import type { SessionId } from "../../agent/types";
import { TUI_ACTIVE_THREAD_FILENAME } from "./constants";
import {
  TELEGRAM_ACTIVE_THREADS_FILENAME,
  TELEGRAM_CHAT_PREFERENCES_FILENAME,
} from "../telegram/constants";

export type TuiSessionListEntry = {
  sessionId: SessionId;
  mtimeMs: number;
};

function parseTuiSessionFilename(stem: string): SessionId | null {
  if (stem === "tui_main") {
    return "tui:main";
  }
  if (stem.startsWith("tui_main_")) {
    const suffix = stem.slice("tui_main_".length);
    if (!suffix) {
      return null;
    }
    return `tui:main:${suffix}`;
  }
  return null;
}

function parseTelegramSessionFilename(stem: string): SessionId | null {
  const match = /^telegram_(\d+)(?:_(.+))?$/.exec(stem);
  if (!match) {
    return null;
  }
  const chatId = match[1]!;
  const suffix = match[2];
  if (!suffix) {
    return `telegram:${chatId}`;
  }
  return `telegram:${chatId}:${suffix}`;
}

/**
 * Maps a sessions-dir filename stem back to a resumable TUI-visible session id.
 * TUI-native and Telegram sessions are supported.
 */
function parseResumableSessionFilename(filename: string): SessionId | null {
  if (
    !filename.endsWith(".json") ||
    filename === TUI_ACTIVE_THREAD_FILENAME ||
    filename === TELEGRAM_ACTIVE_THREADS_FILENAME ||
    filename === TELEGRAM_CHAT_PREFERENCES_FILENAME
  ) {
    return null;
  }
  const stem = filename.slice(0, -".json".length);
  const tui = parseTuiSessionFilename(stem);
  if (tui) {
    return tui;
  }
  const telegram = parseTelegramSessionFilename(stem);
  if (telegram) {
    return telegram;
  }
  return null;
}

/**
 * Lists on-disk sessions visible to TUI /sessions and /resume, newest first.
 */
export async function listTuiSessions(): Promise<TuiSessionListEntry[]> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    return [];
  }
  const names = await readdir(dir);
  const entries: TuiSessionListEntry[] = [];
  for (const name of names) {
    const sessionId = parseResumableSessionFilename(name);
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
