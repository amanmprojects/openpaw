import type { Context } from "grammy";

const RESERVED_COMMANDS = new Set(["/new", "/sessions", "/resume"]);

export function firstCommandToken(text: string): string | undefined {
  return text.trim().split(/\s/)[0]?.split("@")[0]?.toLowerCase();
}

/**
 * True when this text message should be handled by the OpenPaw agent (not a reserved slash command).
 */
export function shouldForwardTextToAgent(ctx: Context): boolean {
  const text = ctx.message?.text;
  if (!text?.trim()) {
    return false;
  }
  const token = firstCommandToken(text);
  return token !== undefined && !RESERVED_COMMANDS.has(token);
}

/** Text after the first whitespace-separated token (bot command + args). */
export function restAfterCommand(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.slice(1).join(" ").trim();
}
