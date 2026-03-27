/**
 * Short one-line formatting for tool I/O in Telegram, TUI, and stream callbacks.
 */

import type { ToolStreamEvent } from "./types";
import { toolInputToYamlLike, toolOutputToYamlLike } from "./tool-yaml-like";

const DEFAULT_MAX_JSON_LEN = 200;

/**
 * Serializes a value for one-line display, capped in length.
 */
export function truncateJson(value: unknown, maxLen: number = DEFAULT_MAX_JSON_LEN): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (s.length <= maxLen) {
      return s;
    }
    return `${s.slice(0, maxLen)}…`;
  } catch {
    return String(value);
  }
}

/**
 * One line for tool invocation (Telegram / TUI).
 */
export function formatToolInputLine(toolName: string, input: unknown): string {
  return `${toolName}: ${truncateJson(input)}`;
}

/**
 * One line for tool result (Telegram / TUI).
 */
export function formatToolOutputLine(output: unknown): string {
  return `→ ${truncateJson(output)}`;
}

/**
 * One line for tool failure.
 */
export function formatToolErrorLine(toolName: string, errorText: string): string {
  return `⚠ ${toolName}: ${errorText}`;
}

/**
 * One line when tool execution was denied.
 */
export function formatToolDeniedLine(toolName: string): string {
  return `⛔ ${toolName} (denied)`;
}

/**
 * Formats a streamed tool event for Telegram or TUI (one line).
 */
export function formatToolStreamEvent(ev: ToolStreamEvent): string {
  switch (ev.type) {
    case "tool_input":
      return formatToolInputLine(ev.toolName, ev.input);
    case "tool_output":
      return formatToolOutputLine(ev.output);
    case "tool_error":
      return formatToolErrorLine(ev.toolName, ev.errorText);
    case "tool_denied":
      return formatToolDeniedLine(ev.toolName);
    default:
      return "";
  }
}

const TUI_YAML_BLOCK_MAX = 3500;

function truncateTuiYamlBlock(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Markdown block for a tool invocation in the terminal chat (fenced YAML, same as live stream).
 */
export function formatTuiToolInputMarkdown(toolName: string, input: unknown): string {
  const yaml = truncateTuiYamlBlock(toolInputToYamlLike(toolName, input), TUI_YAML_BLOCK_MAX);
  return `**Tool · ${toolName}**\n\n\`\`\`yaml\n${yaml}\n\`\`\``;
}

/**
 * Markdown block for a tool result in the terminal chat.
 */
export function formatTuiToolOutputMarkdown(output: unknown): string {
  const yaml = truncateTuiYamlBlock(toolOutputToYamlLike(output), TUI_YAML_BLOCK_MAX);
  return `→ **Result**\n\n\`\`\`yaml\n${yaml}\n\`\`\``;
}

/**
 * Markdown block for a tool error in the terminal chat.
 */
export function formatTuiToolErrorMarkdown(toolName: string, errorText: string): string {
  return `⚠ **${toolName}**\n\n${errorText}`;
}

/**
 * Markdown line for a denied tool in the terminal chat.
 */
export function formatTuiToolDeniedMarkdown(toolName: string): string {
  return `⛔ **${toolName}** (denied)`;
}

/**
 * Markdown tool status for the terminal chat: headings plus fenced YAML (same shape as Telegram).
 */
export function formatToolStreamEventForTui(ev: ToolStreamEvent): string {
  switch (ev.type) {
    case "tool_input":
      return formatTuiToolInputMarkdown(ev.toolName, ev.input);
    case "tool_output":
      return formatTuiToolOutputMarkdown(ev.output);
    case "tool_error":
      return formatTuiToolErrorMarkdown(ev.toolName, ev.errorText);
    case "tool_denied":
      return formatTuiToolDeniedMarkdown(ev.toolName);
    default:
      return "";
  }
}
