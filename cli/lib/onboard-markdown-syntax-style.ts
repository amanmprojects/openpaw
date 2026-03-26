/**
 * Builds a {@link SyntaxStyle} for OpenTUI {@code <markdown>} using the same
 * palette as {@link ONBOARD} (Tokyo Night–aligned CLI theme).
 */
import { RGBA, SyntaxStyle } from "@opentui/core";
import { ONBOARD } from "../components/theme";

/**
 * Creates syntax + markup styles for markdown rendering (headings, lists, code, etc.).
 */
export function createOnboardMarkdownSyntaxStyle(): SyntaxStyle {
  const text = RGBA.fromHex(ONBOARD.text);
  const accent = RGBA.fromHex(ONBOARD.accent);
  const muted = RGBA.fromHex(ONBOARD.muted);
  const success = RGBA.fromHex(ONBOARD.success);
  const error = RGBA.fromHex(ONBOARD.error);

  return SyntaxStyle.fromStyles({
    default: { fg: text },
    /** Table header row styling inside {@code MarkdownRenderable} (uses this key, not h1–h6). */
    "markup.heading": { fg: accent, bold: true },
    "markup.heading.1": { fg: accent, bold: true },
    "markup.heading.2": { fg: accent, bold: true },
    "markup.heading.3": { fg: accent, bold: true },
    "markup.heading.4": { fg: muted, bold: true },
    "markup.heading.5": { fg: muted, bold: true },
    "markup.heading.6": { fg: muted, bold: true },
    "markup.list": { fg: success },
    "markup.list.checked": { fg: success },
    "markup.list.unchecked": { fg: muted },
    "markup.quote": { fg: muted, italic: true },
    "markup.raw": { fg: RGBA.fromHex("#89ddff") },
    "markup.raw.block": { fg: RGBA.fromHex("#89ddff") },
    /** Tree-sitter markdown_inline uses {@code markup.strong}; marked inline uses the same in OpenTUI. */
    "markup.strong": { fg: text, bold: true },
    "markup.bold": { fg: text, bold: true },
    "markup.italic": { fg: text, italic: true },
    "markup.strikethrough": { fg: muted, dim: true },
    "markup.link": { fg: accent },
    "markup.link.label": { fg: accent, underline: true },
    "markup.link.url": { fg: RGBA.fromHex("#7dcfff"), underline: true },
    "punctuation.special": { fg: muted },
    keyword: { fg: RGBA.fromHex("#bb9af7"), bold: true },
    string: { fg: RGBA.fromHex("#9ece6a") },
    comment: { fg: muted, italic: true },
    function: { fg: RGBA.fromHex("#7dcfff") },
    number: { fg: RGBA.fromHex("#e0af68") },
    operator: { fg: RGBA.fromHex("#bb9af7") },
    type: { fg: RGBA.fromHex("#2ac3de") },
    variable: { fg: text },
    property: { fg: RGBA.fromHex("#73daca") },
    punctuation: { fg: muted },
    regexp: { fg: error },
  });
}
