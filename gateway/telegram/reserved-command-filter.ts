import type { Context } from "grammy";
import {
  firstCommandToken,
  RESERVED_SLASH_COMMANDS,
  restAfterCommand,
} from "../slash-command-tokens";

export { firstCommandToken, restAfterCommand };

/**
 * True when this text message should be handled by the OpenPaw agent (not a reserved slash command).
 */
export function shouldForwardTextToAgent(ctx: Context): boolean {
  const text = ctx.message?.text;
  if (!text?.trim()) {
    return false;
  }
  const token = firstCommandToken(text);
  return token !== undefined && !RESERVED_SLASH_COMMANDS.has(token);
}
