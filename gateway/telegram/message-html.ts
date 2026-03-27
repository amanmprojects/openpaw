/**
 * Builds Telegram Bot API HTML bodies (parse_mode: HTML) for reasoning and tool lines.
 * @see https://core.telegram.org/bots/api#html-style
 */

import { truncateJson } from "../../agent/tool-stream-format";
import type { ToolStreamEvent } from "../../agent/types";

const TELEGRAM_MAX = 4096;

/** Shown after the reasoning block while the model is still streaming. */
const STREAMING_CURSOR_PLAIN = " ▉";

/**
 * Escapes text for Telegram HTML mode (outside of tags you control).
 */
export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncateInner(s: string, reserve: number): string {
  const max = Math.max(0, TELEGRAM_MAX - reserve);
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max - 1)}…`;
}

function formatYamlScalar(v: unknown): string {
  if (typeof v === "string") {
    if (/[\n\r:#]/.test(v) || v.length > 160 || v.includes('"')) {
      return JSON.stringify(v);
    }
    return v;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function linesForObject(
  obj: Record<string, unknown>,
  indent: number,
): string[] {
  const pad = "  ".repeat(indent);
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(`${pad}${k}:`);
      out.push(...linesForObject(v as Record<string, unknown>, indent + 1));
    } else {
      out.push(`${pad}${k}: ${formatYamlScalar(v)}`);
    }
  }
  return out;
}

/**
 * Renders tool input as a compact YAML-style string for a pre/code block.
 */
export function toolInputToYamlLike(toolName: string, input: unknown): string {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const lines = [`${toolName}:`];
    lines.push(...linesForObject(input as Record<string, unknown>, 1));
    return lines.join("\n");
  }
  return `${toolName}: ${truncateJson(input, 800)}`;
}

/**
 * Full HTML message for a reasoning phase (expandable blockquote for visual separation).
 */
export function formatReasoningPhaseHtml(
  plain: string,
  showCursor: boolean,
): string {
  const trimmed = plain.trimEnd();
  if (!trimmed) {
    return "";
  }
  const inner = truncateInner(escapeTelegramHtml(trimmed), 200);
  const block = `<b>Reasoning</b>\n<blockquote expandable>${inner}</blockquote>`;
  return showCursor ? `${block}${STREAMING_CURSOR_PLAIN}` : block;
}

function formatToolInputBlock(toolName: string, input: unknown): string {
  const yaml = truncateInner(toolInputToYamlLike(toolName, input), 220);
  const body = escapeTelegramHtml(yaml);
  return `<b>Tool · ${escapeTelegramHtml(toolName)}</b>\n<pre><code class="language-yaml">${body}</code></pre>`;
}

function formatToolOutputBlock(toolName: string, output: unknown): string {
  const raw =
    typeof output === "string"
      ? output
      : truncateJson(output, TELEGRAM_MAX - 400);
  const inner = truncateInner(escapeTelegramHtml(raw), 220);
  return `<b>→ ${escapeTelegramHtml(toolName)}</b>\n<pre><code class="language-json">${inner}</code></pre>`;
}

/**
 * Single Telegram HTML message for a streamed tool event.
 */
export function formatToolStreamEventHtml(ev: ToolStreamEvent): string {
  switch (ev.type) {
    case "tool_input":
      return formatToolInputBlock(ev.toolName, ev.input);
    case "tool_output":
      return formatToolOutputBlock(ev.toolName, ev.output);
    case "tool_error":
      return `<b>⚠ ${escapeTelegramHtml(ev.toolName)}</b>\n<blockquote>${escapeTelegramHtml(truncateInner(ev.errorText, 120))}</blockquote>`;
    case "tool_denied":
      return `<b>⛔ ${escapeTelegramHtml(ev.toolName)}</b>\n<i>denied</i>`;
    default:
      return "";
  }
}
