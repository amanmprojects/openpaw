/**
 * Session id for CLI / non-Telegram entrypoints.
 */
export function cliSessionKey(id = "main"): string {
  return `cli:${id}`;
}

/**
 * Session id for the local OpenTUI chat (separate from Telegram and other channels).
 */
export function tuiSessionKey(id = "main"): string {
  return `tui:${id}`;
}
