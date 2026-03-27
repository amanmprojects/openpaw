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

/**
 * HTML for the tool-invocation half only (before the result is appended).
 */
export function formatToolInputOnlyHtml(toolName: string, input: unknown): string {
  return formatToolInputBlock(toolName, input);
}

/**
 * YAML-style rendering for tool results (bash exit/stdout/stderr or generic objects).
 */
export function toolOutputToYamlLike(output: unknown): string {
  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    const o = output as Record<string, unknown>;
    if ("exitCode" in o && ("stdout" in o || "stderr" in o)) {
      const lines: string[] = [`exitCode: ${formatYamlScalar(o.exitCode)}`];
      const stdout = typeof o.stdout === "string" ? o.stdout : String(o.stdout ?? "");
      const stderr = typeof o.stderr === "string" ? o.stderr : String(o.stderr ?? "");
      if (stdout.includes("\n")) {
        lines.push("stdout: |");
        for (const line of stdout.split("\n")) {
          lines.push(`  ${line}`);
        }
      } else {
        lines.push(`stdout: ${formatYamlScalar(stdout)}`);
      }
      lines.push(`stderr: ${formatYamlScalar(stderr)}`);
      return lines.join("\n");
    }
    return linesForObject(o, 0).join("\n");
  }
  if (typeof output === "string") {
    return output;
  }
  return truncateJson(output, 2000);
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
