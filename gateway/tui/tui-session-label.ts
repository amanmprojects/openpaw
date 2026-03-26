/**
 * Human-readable label for a TUI session row in /sessions (legacy → "main", else thread suffix).
 */
export function formatTuiSessionLabel(sessionId: string): string {
  const legacy = "tui:main";
  if (sessionId === legacy) {
    return "main";
  }
  const prefix = `${legacy}:`;
  if (sessionId.startsWith(prefix)) {
    return sessionId.slice(prefix.length);
  }
  return sessionId;
}
