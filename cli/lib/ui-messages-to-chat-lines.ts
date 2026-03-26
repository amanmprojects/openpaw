/**
 * Maps persisted AI SDK UI messages into the simple transcript lines used by the TUI.
 */
import type { DynamicToolUIPart, ToolUIPart, UIMessage, UITools } from "ai";
import {
  getToolName,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
} from "ai";
import type { ChatLine } from "../components/chat-app";

const MAX_JSON_LEN = 200;

/**
 * Serializes a value for one-line TUI display, capped in length.
 */
function truncateJson(value: unknown): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (s.length <= MAX_JSON_LEN) {
      return s;
    }
    return `${s.slice(0, MAX_JSON_LEN)}…`;
  } catch {
    return String(value);
  }
}

/**
 * Builds a short summary line for a tool invocation part (static or dynamic tool).
 */
function formatToolPartSummary(part: ToolUIPart<UITools> | DynamicToolUIPart): string {
  const name = getToolName(part);
  switch (part.state) {
    case "input-streaming":
      return `[Tool ${name}] …`;
    case "input-available":
      return `[Tool ${name}] ${truncateJson(part.input)}`;
    case "output-available":
      return `[Tool ${name}] → ${truncateJson(part.output)}`;
    case "output-error":
      return `[Tool ${name}] error: ${part.errorText}`;
    case "output-denied":
      return `[Tool ${name}] (denied)`;
    case "approval-requested":
      return `[Tool ${name}] (approval requested)`;
    case "approval-responded":
      return `[Tool ${name}] (approval ${part.approval.approved ? "ok" : "rejected"})`;
    default:
      return `[Tool ${name}]`;
  }
}

/**
 * Converts one UI message's parts into display chunks (joined later with blank lines).
 */
function partsToDisplayChunks(parts: UIMessage["parts"]): string[] {
  const chunks: string[] = [];
  for (const part of parts) {
    if (isTextUIPart(part) && part.text.trim()) {
      chunks.push(part.text);
    } else if (isReasoningUIPart(part) && part.text.trim()) {
      chunks.push(`(reasoning)\n${part.text}`);
    } else if (isFileUIPart(part)) {
      chunks.push(`[file: ${part.filename ?? part.mediaType}]`);
    } else if (isToolUIPart(part)) {
      chunks.push(formatToolPartSummary(part));
    }
  }
  return chunks;
}

/**
 * Maps validated session `UIMessage[]` into {@link ChatLine} rows for the terminal chat transcript.
 * Skips messages that have no displayable content after stripping empty parts.
 */
export function uiMessagesToChatLines(messages: UIMessage[]): ChatLine[] {
  const out: ChatLine[] = [];
  for (const msg of messages) {
    if (msg.role !== "user" && msg.role !== "assistant" && msg.role !== "system") {
      continue;
    }
    const chunks = partsToDisplayChunks(msg.parts);
    const text = chunks.join("\n\n").trim();
    if (!text) {
      continue;
    }
    out.push({ role: msg.role, text });
  }
  return out;
}
