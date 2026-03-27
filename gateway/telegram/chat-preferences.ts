import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../config/paths";
import { TELEGRAM_CHAT_PREFERENCES_FILENAME } from "./constants";

/**
 * Per-chat Telegram display flags and tool sandbox. Session persistence is unchanged;
 * display flags only affect live delivery; sandbox affects file_editor and bash per turn.
 */
export type TelegramChatPreferences = {
  /** When false, reasoning phases are not sent as separate Telegram messages. */
  showReasoning: boolean;
  /** When false, tool status lines are not sent as Telegram messages. */
  showToolCalls: boolean;
  /**
   * When true (default), file_editor and bash are scoped to the workspace; when false,
   * file_editor may access the broader filesystem and bash uses $HOME as cwd.
   */
  sandboxRestricted: boolean;
};

const DEFAULT_PREFS: TelegramChatPreferences = {
  showReasoning: true,
  showToolCalls: true,
  sandboxRestricted: true,
};

type PrefsFile = Record<
  string,
  { showReasoning?: boolean; showToolCalls?: boolean; sandboxRestricted?: boolean }
>;

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
    sandboxRestricted: row?.sandboxRestricted ?? DEFAULT_PREFS.sandboxRestricted,
  };
}

/**
 * Updates one or both flags for a chat and persists to disk.
 */
export async function setTelegramChatPreferences(
  chatId: number,
  patch: Partial<
    Pick<TelegramChatPreferences, "showReasoning" | "showToolCalls" | "sandboxRestricted">
  >,
): Promise<TelegramChatPreferences> {
  const all = await readAllPrefs();
  const key = String(chatId);
  const prev = all[key] ?? {};
  const next: TelegramChatPreferences = {
    showReasoning: patch.showReasoning ?? prev.showReasoning ?? DEFAULT_PREFS.showReasoning,
    showToolCalls: patch.showToolCalls ?? prev.showToolCalls ?? DEFAULT_PREFS.showToolCalls,
    sandboxRestricted:
      patch.sandboxRestricted ?? prev.sandboxRestricted ?? DEFAULT_PREFS.sandboxRestricted,
  };
  all[key] = {
    showReasoning: next.showReasoning,
    showToolCalls: next.showToolCalls,
    sandboxRestricted: next.sandboxRestricted,
  };
  await writeAllPrefs(all);
  return next;
}
