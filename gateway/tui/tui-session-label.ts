/**
 * Human-readable label for a TUI /sessions row.
 */
export function formatTuiSessionLabel(sessionId: string, title?: string | null): string {
  if (title?.trim()) {
    return title.trim();
  }
  const tuiLegacy = "tui:main";
  if (sessionId === tuiLegacy) {
    return "main";
  }
  const tuiPrefix = `${tuiLegacy}:`;
  if (sessionId.startsWith(tuiPrefix)) {
    return sessionId.slice(tuiPrefix.length);
  }

  const telegramMatch = /^telegram:(\d+)(?::(.+))?$/.exec(sessionId);
  if (telegramMatch) {
    const chatId = telegramMatch[1]!;
    const suffix = telegramMatch[2];
    return suffix ? `telegram ${chatId} / ${suffix}` : `telegram ${chatId} / main`;
  }

  return sessionId;
}
