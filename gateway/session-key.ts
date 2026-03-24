import type { Context } from "grammy";

/**
 * One persisted chat session per Telegram chat.
 */
export function telegramSessionKey(ctx: Context): string {
  const id = ctx.chat?.id;
  if (id === undefined) {
    return "telegram:unknown";
  }
  return `telegram:${id}`;
}

export function cliSessionKey(id = "main"): string {
  return `cli:${id}`;
}
