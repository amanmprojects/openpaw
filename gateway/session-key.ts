/**
 * Session id for CLI / non-Telegram entrypoints.
 */
export function cliSessionKey(id = "main"): string {
  return `cli:${id}`;
}
