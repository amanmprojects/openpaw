/**
 * Shared parsing for OpenPaw slash commands across channels (Telegram, TUI).
 */

export const RESERVED_SLASH_COMMANDS = new Set(["/new", "/sessions", "/resume"]);

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
