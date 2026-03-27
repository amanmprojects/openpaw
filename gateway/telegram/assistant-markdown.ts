/**
 * Wraps {@link https://www.npmjs.com/package/tg-markdown-converter tg-markdown-converter}
 * for assistant replies: CommonMark/GFM → Telegram MarkdownV2 (no post-processing).
 */
import { converter } from "tg-markdown-converter";

/** Options passed to {@link converter} (no `splitAt`: streaming layer chunks source markdown first). */
const TELEGRAM_MARKDOWN_CONVERTER_OPTIONS = {
  olSeparator: ")" as const,
  ulMarker: "-",
  imgMarker: "🎨",
  thematicBreak: "* * *",
  headingEmojis: {
    h1: '',
    h2: '',
    h3: '',
    h4: '',
    h5: '',
    h6: '',
  } as const,
};

/** Body to send and whether Telegram should parse it as MarkdownV2 (omit for plain text). */
export type AssistantTelegramPayload = {
  body: string;
  parseMode: "MarkdownV2" | undefined;
};

/**
 * Converts model markdown for the main assistant bubble (streaming edits and finalize).
 * On success returns MarkdownV2; on converter failure returns plain text with no parse_mode
 * so Telegram does not treat `_*[]()` as formatting.
 */
export function formatAssistantMarkdownForTelegram(markdown: string): AssistantTelegramPayload {
  if (!markdown) {
    return { body: markdown, parseMode: undefined };
  }
  try {
    const body = converter(markdown, TELEGRAM_MARKDOWN_CONVERTER_OPTIONS);
    return { body, parseMode: "MarkdownV2" };
  } catch (e) {
    console.warn(
      "OpenPaw Telegram: MarkdownV2 conversion failed (tg-markdown-converter), sending plain text",
      e,
    );
    return { body: markdown.slice(0, 4096), parseMode: undefined };
  }
}
