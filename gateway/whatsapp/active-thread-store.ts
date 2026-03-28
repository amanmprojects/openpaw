/**
 * Manages the active WhatsApp conversation thread per phone number (JID).
 * Persists a mapping of JID → thread UUID under the sessions directory,
 * mirroring the Telegram active-thread-store pattern.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../config/paths";
import type { SessionId } from "../../agent/types";
import { WHATSAPP_ACTIVE_THREADS_FILENAME } from "./constants";

/**
 * Normalises a WhatsApp JID to a stable identifier for use in session keys.
 * Strips the `@s.whatsapp.net` / `@g.us` suffix and any device suffix.
 */
export function normaliseJid(jid: string): string {
  return jid.split("@")[0]?.split(":")[0] ?? jid;
}

type ThreadMap = Record<string, string | undefined>;

function activeThreadsPath(): string {
  return join(getSessionsDir(), WHATSAPP_ACTIVE_THREADS_FILENAME);
}

async function readMap(): Promise<ThreadMap> {
  const path = activeThreadsPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = await Bun.file(path).text();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ThreadMap;
    }
    return {};
  } catch {
    return {};
  }
}

async function writeMap(map: ThreadMap): Promise<void> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await Bun.write(activeThreadsPath(), JSON.stringify(map, null, 2));
}

/**
 * Returns the persistence session ID for a WhatsApp JID.
 * Legacy format: `wa:<normalised>`, threaded: `wa:<normalised>:<uuid>`.
 */
export async function getWhatsAppPersistenceSessionId(jid: string): Promise<SessionId> {
  const key = normaliseJid(jid);
  const map = await readMap();
  const uuid = map[key];
  if (uuid && uuid.length > 0) {
    return `wa:${key}:${uuid}`;
  }
  return `wa:${key}`;
}

/**
 * Creates a new conversation thread for the given JID. Returns the new session ID.
 */
export async function startNewWhatsAppThread(jid: string): Promise<SessionId> {
  const key = normaliseJid(jid);
  const uuid = crypto.randomUUID();
  const map = await readMap();
  map[key] = uuid;
  await writeMap(map);
  return `wa:${key}:${uuid}`;
}

/**
 * Points the active session for a JID at an existing persistence session ID.
 */
export async function setActiveWhatsAppSession(
  jid: string,
  persistenceSessionId: SessionId,
): Promise<void> {
  const key = normaliseJid(jid);
  const legacy = `wa:${key}`;

  if (persistenceSessionId === legacy) {
    const map = await readMap();
    delete map[key];
    await writeMap(map);
    return;
  }

  const prefix = `${legacy}:`;
  if (!persistenceSessionId.startsWith(prefix)) {
    throw new Error("Session does not belong to this WhatsApp chat");
  }
  const uuid = persistenceSessionId.slice(prefix.length);
  if (!uuid) {
    throw new Error("Invalid thread id");
  }
  const map = await readMap();
  map[key] = uuid;
  await writeMap(map);
}
