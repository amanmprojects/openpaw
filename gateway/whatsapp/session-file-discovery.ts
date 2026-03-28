/**
 * Discovers WhatsApp session files on disk, parsing filenames to session IDs
 * and listing sessions for a given JID sorted by modification time.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { getSessionsDir } from "../../config/paths";
import type { SessionId } from "../../agent/types";
import { WHATSAPP_ACTIVE_THREADS_FILENAME, WHATSAPP_CHAT_PREFERENCES_FILENAME } from "./constants";
import { normaliseJid } from "./active-thread-store";

export type WhatsAppSessionListEntry = {
  sessionId: SessionId;
  mtimeMs: number;
};

const SKIP_FILES = new Set([
  WHATSAPP_ACTIVE_THREADS_FILENAME,
  WHATSAPP_CHAT_PREFERENCES_FILENAME,
]);

/**
 * Maps a sessions-dir filename stem back to a WhatsApp persistence session ID,
 * or null if not a WhatsApp session file for the given JID.
 */
function parseWhatsAppSessionFilename(filename: string, normalisedJid: string): SessionId | null {
  if (!filename.endsWith(".json") || SKIP_FILES.has(filename)) {
    return null;
  }
  const stem = filename.slice(0, -".json".length);
  const legacyStem = `wa_${normalisedJid}`;

  if (stem === legacyStem) {
    return `wa:${normalisedJid}`;
  }
  if (stem.startsWith(`${legacyStem}_`)) {
    const suffix = stem.slice(legacyStem.length + 1);
    if (!suffix) return null;
    return `wa:${normalisedJid}:${suffix}`;
  }
  return null;
}

/**
 * Lists on-disk WhatsApp session files for a given JID, newest first.
 */
export async function listWhatsAppSessionsForJid(jid: string): Promise<WhatsAppSessionListEntry[]> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    return [];
  }
  const normJid = normaliseJid(jid);
  const names = await readdir(dir);
  const entries: WhatsAppSessionListEntry[] = [];

  for (const name of names) {
    const sessionId = parseWhatsAppSessionFilename(name, normJid);
    if (!sessionId) continue;
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
