import type { Context } from "grammy";

/**
 * Per-chat serialization key for the Telegram gateway (message queue).
 * Persistence ids may add a thread suffix; see {@link getTelegramPersistenceSessionId} in `./active-thread-store.ts`.
 */
export function telegramSessionKey(ctx: Context): string {
  const id = ctx.chat?.id;
  if (id === undefined) {
    return "telegram:unknown";
  }
  return `telegram:${id}`;
}
