import type { Context } from "grammy";
import { firstCommandToken, RESERVED_SLASH_COMMANDS } from "../slash-command-tokens";

export { firstCommandToken };

/**
 * True when this text message should be handled by the OpenPaw agent.
 * Messages whose first token looks like a Telegram slash command (`/…`) are never forwarded;
 * they are handled by {@link shouldReportUnknownOpenPawSlashCommand} or grammy `bot.command` handlers.
 */
export function shouldForwardTextToAgent(ctx: Context): boolean {
  const text = ctx.message?.text;
  if (!text?.trim()) {
    return false;
  }
  const token = firstCommandToken(text);
  return token !== undefined && !token.startsWith("/");
}

/**
 * True when the user sent a slash-prefixed first token that is not a known OpenPaw command
 * (e.g. `/start`, `/help`, or a typo). Reply instead of invoking the model.
 */
export function shouldReportUnknownOpenPawSlashCommand(ctx: Context): boolean {
  const text = ctx.message?.text;
  if (!text?.trim()) {
    return false;
  }
  const token = firstCommandToken(text);
  return (
    token !== undefined && token.startsWith("/") && !RESERVED_SLASH_COMMANDS.has(token)
  );
}
