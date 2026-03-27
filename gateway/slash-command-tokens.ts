/**
 * Shared parsing for OpenPaw slash commands across channels (Telegram, TUI).
 */

/** Registered bot commands and reserved slash tokens, in menu order. */
export const OPENPAW_SLASH_COMMAND_NAMES = [
  "new",
  "sessions",
  "resume",
  "reasoning",
  "tool_calls",
  "sandbox",
] as const;

export const RESERVED_SLASH_COMMANDS = new Set(
  OPENPAW_SLASH_COMMAND_NAMES.map((name) => `/${name}`),
);

/**
 * Comma-separated list of supported slash commands for user-facing error text.
 */
export function formatAvailableOpenPawSlashCommandsForUser(): string {
  return OPENPAW_SLASH_COMMAND_NAMES.map((n) => `/${n}`).join(", ");
}

/**
 * First whitespace-separated token of the message, lowercased; strips optional `@botname` suffix.
 */
export function firstCommandToken(text: string): string | undefined {
  return text.trim().split(/\s/)[0]?.split("@")[0]?.toLowerCase();
}

/**
 * Text after the first whitespace-separated token (command + args).
 */
export function restAfterCommand(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.slice(1).join(" ").trim();
}
