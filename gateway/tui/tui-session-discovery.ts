import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { getSessionsDir } from "../../config/paths";
import type { SessionId } from "../../agent/types";
import { TUI_ACTIVE_THREAD_FILENAME } from "./constants";

export type TuiSessionListEntry = {
  sessionId: SessionId;
  mtimeMs: number;
};

/**
 * Maps a sessions-dir filename stem back to a TUI persistence session id, or null if not a TUI session file.
 */
function parseTuiSessionFilename(filename: string): SessionId | null {
  if (!filename.endsWith(".json") || filename === TUI_ACTIVE_THREAD_FILENAME) {
    return null;
  }
  const stem = filename.slice(0, -".json".length);
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

/**
 * Lists on-disk TUI session files, newest first.
 */
export async function listTuiSessions(): Promise<TuiSessionListEntry[]> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    return [];
  }
  const names = await readdir(dir);
  const entries: TuiSessionListEntry[] = [];
  for (const name of names) {
    const sessionId = parseTuiSessionFilename(name);
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
