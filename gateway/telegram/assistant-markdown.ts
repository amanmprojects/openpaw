/**
 * Wraps {@link https://www.npmjs.com/package/telegram-markdown-v2 telegram-markdown-v2}
 * for assistant replies: CommonMark/GFM → Telegram MarkdownV2.
 */
import { convert } from "telegram-markdown-v2";

/** Body to send and whether Telegram should parse it as MarkdownV2 (omit for plain text). */
export type AssistantTelegramPayload = {
  body: string;
  parseMode: "MarkdownV2" | undefined;
};

/**
 * Converts model markdown for the main assistant bubble.
 * On success returns MarkdownV2; on converter failure returns plain text with no parse_mode
 * so Telegram does not treat `_*[]()` as formatting.
 */
export function formatAssistantMarkdownForTelegram(markdown: string): AssistantTelegramPayload {
  if (!markdown) {
    return { body: markdown, parseMode: undefined };
  }
  try {
    return { body: convert(markdown, "escape"), parseMode: "MarkdownV2" };
  } catch (e) {
    console.warn("OpenPaw: telegram-markdown-v2 convert failed", e);
    return { body: markdown.slice(0, 4096), parseMode: undefined };
  }
}
