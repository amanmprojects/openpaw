/**
 * Discovery of persisted sessions visible from the terminal UI.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { getSessionsDir } from "../../config/paths";
import { parseSessionMetadataFromContent } from "../../agent/session-store";
import type { SessionId } from "../../agent/types";
import { TUI_ACTIVE_THREAD_FILENAME } from "./constants";
import {
  TELEGRAM_ACTIVE_THREADS_FILENAME,
  TELEGRAM_CHAT_PREFERENCES_FILENAME,
} from "../telegram/constants";

export type TuiSessionListEntry = {
  sessionId: SessionId;
  mtimeMs: number;
  title: string | null;
  pinned: boolean;
  updatedAt: string | null;
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
function parseResumableSessionName(name: string): SessionId | null {
  const tui = parseTuiSessionFilename(name);
  if (tui) {
    return tui;
  }
  const telegram = parseTelegramSessionFilename(name);
  if (telegram) {
    return telegram;
  }
  return null;
}

function parseResumableSessionFilename(filename: string): SessionId | null {
  if (
    !filename.endsWith(".json") ||
    filename === TUI_ACTIVE_THREAD_FILENAME ||
    filename === TELEGRAM_ACTIVE_THREADS_FILENAME ||
    filename === TELEGRAM_CHAT_PREFERENCES_FILENAME
  ) {
    return null;
  }
  return parseResumableSessionName(filename.slice(0, -".json".length));
}

/**
 * Lists on-disk sessions visible to TUI /sessions and /resume, newest first.
 */
export async function listTuiSessions(): Promise<TuiSessionListEntry[]> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    return [];
  }
  const names = await readdir(dir, { withFileTypes: true });
  const entriesBySessionId = new Map<SessionId, TuiSessionListEntry>();
  for (const name of names) {
    const sessionId = name.isDirectory()
      ? parseResumableSessionName(name.name)
      : parseResumableSessionFilename(name.name);
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
