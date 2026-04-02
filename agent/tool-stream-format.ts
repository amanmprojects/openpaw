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

/**
 * Labels for file_editor sub-commands.
 */
const FILE_EDITOR_LABELS: Record<string, string> = {
  view: "Viewing",
  create: "Creating",
  str_replace: "Editing",
  insert: "Inserting into",
  delete_lines: "Editing",
  delete: "Deleting",
  undo_edit: "Undoing edit on",
};

/** Fallback labels for tool names when we have no input data yet. */
const TOOL_FALLBACK_LABELS: Record<string, string> = {
  file_editor: "Editing",
  bash: "Running",
  list_dir: "Listing",
  load_skill: "Loading skill",
  memory: "Updating memory",
};

/**
 * Regex that matches a JSON key:value pair where the value is a complete quoted string.
 */
const RE_COMPLETE = (key: string) => new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);

/**
 * Regex that matches a JSON key:value pair where the value is still streaming
 * (opening quote present, closing quote may be missing).
 */
const RE_PARTIAL = (key: string) => new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*(?:\\\\)?)$`);

/**
 * Tries a complete match first, then falls back to a partial match.
 */
function grab(json: string, key: string): string | null {
  return RE_COMPLETE(key).exec(json)?.[1] ?? RE_PARTIAL(key).exec(json)?.[1] ?? null;
}

/**
 * Extracts a human-readable hint from partial tool-input JSON.
 * Always returns a string — falls back to a friendly tool label when no input has streamed yet.
 */
export function extractToolHint(toolName: string, accumulatedDelta: string): string {
  if (toolName === "file_editor") {
    const cmd = grab(accumulatedDelta, "command");
    const path = grab(accumulatedDelta, "path");
    const label = cmd ? (FILE_EDITOR_LABELS[cmd] ?? cmd) : "Editing";
    if (path) {
      return `${label} ${shortenPath(path)}`;
    }
    return label;
  }

  if (toolName === "bash") {
    const raw = grab(accumulatedDelta, "command");
    if (raw) {
      const cmd = raw.length > 50 ? `${raw.slice(0, 47)}…` : raw;
      return `Running \`${cmd}\``;
    }
    return "Running command";
  }

  if (toolName === "list_dir") {
    const path = grab(accumulatedDelta, "path");
    if (path) {
      return `Listing ${shortenPath(path)}`;
    }
    return "Listing directory";
  }

  if (toolName === "memory") {
    const action = grab(accumulatedDelta, "action");
    if (action) {
      const labels: Record<string, string> = { add: "Saving to", replace: "Updating", remove: "Removing from" };
      const target = grab(accumulatedDelta, "target");
      const tgt = target === "user" ? "user profile" : "memory";
      return `${labels[action] ?? action} ${tgt}`;
    }
    return "Updating memory";
  }

  if (toolName === "load_skill") {
    const name = grab(accumulatedDelta, "name");
    if (name) {
      return `Loading skill ${name}`;
    }
    return "Loading skill";
  }

  return TOOL_FALLBACK_LABELS[toolName] ?? toolName;
}

/**
 * Shortens a home-directory path to ~/
 */
function shortenPath(p: string): string {
  const home = process.env.HOME;
  if (home && p.startsWith(`${home}/`)) {
    return `~/${p.slice(home.length + 1)}`;
  }
  return p;
}
