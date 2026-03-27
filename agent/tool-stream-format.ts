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
  return `🔧 ${toolName}: ${truncateJson(input)}`;
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
 * Markdown tool status for the terminal chat: headings plus fenced YAML (same shape as Telegram).
 */
export function formatToolStreamEventForTui(ev: ToolStreamEvent): string {
  switch (ev.type) {
    case "tool_input": {
      const yaml = truncateTuiYamlBlock(
        toolInputToYamlLike(ev.toolName, ev.input),
        TUI_YAML_BLOCK_MAX,
      );
      return `🔧 **Tool · ${ev.toolName}**\n\n\`\`\`yaml\n${yaml}\n\`\`\``;
    }
    case "tool_output": {
      const yaml = truncateTuiYamlBlock(toolOutputToYamlLike(ev.output), TUI_YAML_BLOCK_MAX);
      return `→ **Result**\n\n\`\`\`yaml\n${yaml}\n\`\`\``;
    }
    case "tool_error":
      return `⚠ **${ev.toolName}**\n\n${ev.errorText}`;
    case "tool_denied":
      return `⛔ **${ev.toolName}** (denied)`;
    default:
      return "";
  }
}
