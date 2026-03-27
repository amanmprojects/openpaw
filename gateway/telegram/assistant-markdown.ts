/**
 * Wraps {@link https://www.npmjs.com/package/telegram-markdown-v2 telegram-markdown-v2}
 * for assistant replies: CommonMark/GFM → Telegram MarkdownV2.
 */
import { convert } from "telegram-markdown-v2";

/**
 * Replaces ATX heading lines that have no visible title (only `#`…`######` and whitespace).
 * remark turns those into empty emphasis (`**`), which breaks Telegram MarkdownV2 while streaming.
 * Escaping each `#` yields a plain paragraph line that displays as the original hashes.
 */
function neutralizeEmptyAtxHeadingLines(markdown: string): string {
  return markdown.replace(/^#{1,6}\s*$/gm, (line) => {
    const hashes = line.match(/^(#{1,6})/)?.[1] ?? "";
    return hashes.split("").map(() => "\\#").join("");
  });
}

/**
 * Converts model markdown to Telegram `parse_mode: MarkdownV2` text.
 * Uses `keep` so blockquotes stay as `>` lines; unsupported constructs are passed through per library.
 */
export function formatAssistantMarkdownToTelegramV2(markdown: string): string {
  if (!markdown) {
    return markdown;
  }
  try {
    return convert(neutralizeEmptyAtxHeadingLines(markdown), "escape");
  } catch (e) {
    console.warn("OpenPaw: telegram-markdown-v2 convert failed", e);
    return markdown.slice(0, 4096);
  }
}
