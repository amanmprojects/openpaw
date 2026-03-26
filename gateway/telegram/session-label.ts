/**
 * Human-readable label for a session row in /sessions (legacy → "main", else full thread id suffix).
 */
export function formatTelegramSessionLabel(sessionId: string, chatId: number): string {
  const legacy = `telegram:${chatId}`;
  if (sessionId === legacy) {
    return "main";
  }
  const prefix = `${legacy}:`;
  if (sessionId.startsWith(prefix)) {
    return sessionId.slice(prefix.length);
  }
  return sessionId;
}
