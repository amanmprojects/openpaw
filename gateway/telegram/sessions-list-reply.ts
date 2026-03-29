/**
 * Telegram `/sessions` reply formatting and delivery.
 */
import type { Context } from "grammy";
import { getTelegramPersistenceSessionId } from "./active-thread-store";
import { listTelegramSessionsForChat } from "./session-file-discovery";
import { formatTelegramSessionLabel } from "./session-label";

const MAX_LINES = 20;
const MAX_CHARS = 3500;

/**
 * Sends the /sessions reply for one chat (numbered list, active marker, truncation).
 */
export async function replyWithSessionsList(ctx: Context, chatId: number): Promise<void> {
  const entries = await listTelegramSessionsForChat(chatId);
  const active = await getTelegramPersistenceSessionId(chatId);

  if (entries.length === 0) {
    await ctx.reply("No saved sessions yet.");
    return;
  }

  const lines: string[] = [];
  const shown = Math.min(entries.length, MAX_LINES);
  for (let i = 0; i < shown; i++) {
    const e = entries[i]!;
    const n = i + 1;
    const mark = e.sessionId === active ? " (active)" : "";
    const pin = e.pinned ? " [pinned]" : "";
    const label = formatTelegramSessionLabel(e.sessionId, chatId, e.title);
    const updated = e.updatedAt ? ` — ${new Date(e.updatedAt).toLocaleString()}` : "";
    lines.push(`${n}. ${label}${mark}${pin}${updated}`);
  }
  if (entries.length > MAX_LINES) {
    lines.push(`…and ${entries.length - MAX_LINES} more.`);
  }

  let body = "Saved sessions (newest first):\n" + lines.join("\n");
  if (body.length > MAX_CHARS) {
    body = `${body.slice(0, MAX_CHARS - 20)}\n…(truncated)`;
  }
  await ctx.reply(body);
}
