import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../config/paths";
import { TELEGRAM_CHAT_PREFERENCES_FILENAME } from "./constants";

/**
 * Per-chat Telegram display flags. Session persistence is unchanged; these only affect live delivery.
 */
export type TelegramChatPreferences = {
  /** When false, reasoning phases are not sent as separate Telegram messages. */
  showReasoning: boolean;
  /** When false, tool status lines are not sent as Telegram messages. */
  showToolCalls: boolean;
};

const DEFAULT_PREFS: TelegramChatPreferences = {
  showReasoning: true,
  showToolCalls: true,
};

type PrefsFile = Record<string, { showReasoning?: boolean; showToolCalls?: boolean }>;

function prefsPath(): string {
  return join(getSessionsDir(), TELEGRAM_CHAT_PREFERENCES_FILENAME);
}

async function readAllPrefs(): Promise<PrefsFile> {
  const path = prefsPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = await Bun.file(path).text();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    return parsed as PrefsFile;
  } catch {
    return {};
  }
}

async function writeAllPrefs(data: PrefsFile): Promise<void> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await Bun.write(prefsPath(), JSON.stringify(data, null, 2));
}

/**
 * Returns persisted preferences for a Telegram chat, merged with defaults.
 */
export async function getTelegramChatPreferences(chatId: number): Promise<TelegramChatPreferences> {
  const all = await readAllPrefs();
  const row = all[String(chatId)];
  return {
    showReasoning: row?.showReasoning ?? DEFAULT_PREFS.showReasoning,
    showToolCalls: row?.showToolCalls ?? DEFAULT_PREFS.showToolCalls,
  };
}

/**
 * Updates one or both flags for a chat and persists to disk.
 */
export async function setTelegramChatPreferences(
  chatId: number,
  patch: Partial<Pick<TelegramChatPreferences, "showReasoning" | "showToolCalls">>,
): Promise<TelegramChatPreferences> {
  const all = await readAllPrefs();
  const key = String(chatId);
  const prev = all[key] ?? {};
  const next: TelegramChatPreferences = {
    showReasoning: patch.showReasoning ?? prev.showReasoning ?? DEFAULT_PREFS.showReasoning,
    showToolCalls: patch.showToolCalls ?? prev.showToolCalls ?? DEFAULT_PREFS.showToolCalls,
  };
  all[key] = { showReasoning: next.showReasoning, showToolCalls: next.showToolCalls };
  await writeAllPrefs(all);
  return next;
}
