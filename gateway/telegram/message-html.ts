/**
 * Builds Telegram Bot API HTML bodies (parse_mode: HTML) for reasoning and tool lines.
 * @see https://core.telegram.org/bots/api#html-style
 */

import { truncateJson } from "../../agent/tool-stream-format";
import { toolInputToYamlLike, toolOutputToYamlLike } from "../../agent/tool-yaml-like";
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

/**
 * HTML for the tool-invocation half only (before the result is appended).
 */
export function formatToolInputOnlyHtml(toolName: string, input: unknown): string {
  return formatToolInputBlock(toolName, input);
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
 * Full tool bubble: input block plus a Result section (after execution).
 */
export function formatToolCallCompleteHtml(
  toolName: string,
  input: unknown,
  result: ToolStreamEvent,
): string {
  const head = formatToolInputBlock(toolName, input);
  let tail = "";
  switch (result.type) {
    case "tool_output": {
      const yaml = truncateInner(toolOutputToYamlLike(result.output), 600);
      tail = `<b>Result</b>\n<pre><code class="language-yaml">${escapeTelegramHtml(yaml)}</code></pre>`;
      break;
    }
    case "tool_error":
      tail = `<b>Result</b>\n<blockquote>${escapeTelegramHtml(truncateInner(result.errorText, 400))}</blockquote>`;
      break;
    case "tool_denied":
      tail = "<b>Result</b>\n<i>denied</i>";
      break;
    default:
      return head;
  }
  const combined = `${head}\n${tail}`;
  if (combined.length <= TELEGRAM_MAX) {
    return combined;
  }
  const reserve = tail.length + 80;
  const shrunkYaml = truncateInner(toolInputToYamlLike(toolName, input), reserve);
  const shrunkHead = `<b>Tool · ${escapeTelegramHtml(toolName)}</b>\n<pre><code class="language-yaml">${escapeTelegramHtml(shrunkYaml)}</code></pre>`;
  return `${shrunkHead}\n${tail}`.slice(0, TELEGRAM_MAX);
}

/**
 * When no matching tool_input message exists, send the result alone (HTML).
 */
export function formatStandaloneToolResultHtml(ev: ToolStreamEvent): string {
  switch (ev.type) {
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

/**
 * Single Telegram HTML message for a streamed tool event (input-only or legacy standalone).
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
