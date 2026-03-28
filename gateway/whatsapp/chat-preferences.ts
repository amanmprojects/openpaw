/**
 * Per-JID UI preferences for WhatsApp chats (show reasoning, show tool calls).
 * Persisted as a JSON file under the sessions directory.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../config/paths";
import { WHATSAPP_CHAT_PREFERENCES_FILENAME } from "./constants";
import { normaliseJid } from "./active-thread-store";

export type WhatsAppChatPreferences = {
  showReasoning?: boolean;
  showToolCalls?: boolean;
};

type PrefsMap = Record<string, WhatsAppChatPreferences | undefined>;

function prefsPath(): string {
  return join(getSessionsDir(), WHATSAPP_CHAT_PREFERENCES_FILENAME);
}

async function readPrefs(): Promise<PrefsMap> {
  const path = prefsPath();
  if (!existsSync(path)) return {};
  try {
    const raw = await Bun.file(path).text();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as PrefsMap;
    }
    return {};
  } catch {
    return {};
  }
}

async function writePrefs(map: PrefsMap): Promise<void> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await Bun.write(prefsPath(), JSON.stringify(map, null, 2));
}

/**
 * Returns the current chat preferences for a WhatsApp JID.
 */
export async function getWhatsAppChatPreferences(jid: string): Promise<WhatsAppChatPreferences> {
  const key = normaliseJid(jid);
  const map = await readPrefs();
  return map[key] ?? {};
}

/**
 * Merges partial preferences for a WhatsApp JID and persists the result.
 */
export async function setWhatsAppChatPreferences(
  jid: string,
  partial: Partial<WhatsAppChatPreferences>,
): Promise<void> {
  const key = normaliseJid(jid);
  const map = await readPrefs();
  const existing = map[key] ?? {};
  map[key] = { ...existing, ...partial };
  await writePrefs(map);
}
