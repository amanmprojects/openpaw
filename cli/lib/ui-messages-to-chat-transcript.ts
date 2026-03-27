/**
 * Maps persisted AI SDK UI messages into {@link ChatLine} rows for the terminal chat transcript.
 */
import type { DynamicToolUIPart, ToolUIPart, UIMessage, UITools } from "ai";
import {
  getToolName,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
} from "ai";
import {
  formatTuiToolDeniedMarkdown,
  formatTuiToolErrorMarkdown,
  formatTuiToolInputMarkdown,
  formatTuiToolOutputMarkdown,
  truncateJson,
} from "../../agent/tool-stream-format";
import type { AssistantSegment, ChatLine } from "./chat-transcript-types";

/**
 * Builds a short summary line for a tool part (plain transcript / non-markdown rows).
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
 * Same tool display as the live TUI stream: markdown headings + fenced YAML blocks.
 */
function formatToolPartForAssistantTui(part: ToolUIPart<UITools> | DynamicToolUIPart): string {
  const name = getToolName(part);
  switch (part.state) {
    case "input-streaming":
      return `🔧 **Tool · ${name}**\n\n_(input streaming…)_`;
    case "input-available":
      return formatTuiToolInputMarkdown(name, part.input);
    case "output-available":
      return `${formatTuiToolInputMarkdown(name, part.input)}\n\n${formatTuiToolOutputMarkdown(part.output)}`;
    case "output-error":
      return `${formatTuiToolInputMarkdown(name, part.input)}\n\n${formatTuiToolErrorMarkdown(name, part.errorText)}`;
    case "output-denied":
      return `${formatTuiToolInputMarkdown(name, part.input)}\n\n${formatTuiToolDeniedMarkdown(name)}`;
    case "approval-requested":
      return `🔧 **Tool · ${name}**\n\n_(approval requested)_`;
    case "approval-responded":
      return `🔧 **Tool · ${name}**\n\n_(approval ${part.approval.approved ? "granted" : "rejected"})_`;
    default:
      return `🔧 **Tool · ${name}**`;
  }
}

/**
 * Merges a new string into the tail segment when `kind` matches, else appends a segment.
 */
function mergeAssistantSegment(
  segments: AssistantSegment[],
  kind: AssistantSegment["kind"],
  text: string,
): AssistantSegment[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return segments;
  }
  const last = segments[segments.length - 1];
  if (last?.kind === kind) {
    return [...segments.slice(0, -1), { kind, text: `${last.text}\n\n${trimmed}` }];
  }
  return [...segments, { kind, text: trimmed }];
}

/**
 * Converts assistant message parts into ordered reasoning vs text segments for the TUI.
 */
function partsToAssistantSegments(parts: UIMessage["parts"]): AssistantSegment[] {
  let segments: AssistantSegment[] = [];
  for (const part of parts) {
    if (isTextUIPart(part) && part.text.trim()) {
      segments = mergeAssistantSegment(segments, "text", part.text);
    } else if (isReasoningUIPart(part) && part.text.trim()) {
      segments = mergeAssistantSegment(segments, "reasoning", part.text);
    } else if (isFileUIPart(part)) {
      segments = mergeAssistantSegment(
        segments,
        "text",
        `[file: ${part.filename ?? part.mediaType}]`,
      );
    } else if (isToolUIPart(part)) {
      segments = mergeAssistantSegment(segments, "tool", formatToolPartForAssistantTui(part));
    }
  }
  return segments;
}

/**
 * Joins user/system message parts into a single transcript string (no reasoning label).
 */
function partsToPlainTranscriptText(parts: UIMessage["parts"]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (isTextUIPart(part) && part.text.trim()) {
      chunks.push(part.text);
    } else if (isReasoningUIPart(part) && part.text.trim()) {
      chunks.push(part.text);
    } else if (isFileUIPart(part)) {
      chunks.push(`[file: ${part.filename ?? part.mediaType}]`);
    } else if (isToolUIPart(part)) {
      chunks.push(formatToolPartSummary(part));
    }
  }
  return chunks.join("\n\n").trim();
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
    if (msg.role === "assistant") {
      const segments = partsToAssistantSegments(msg.parts);
      if (segments.length === 0) {
        continue;
      }
      out.push({ role: "assistant", segments });
      continue;
    }
    const text = partsToPlainTranscriptText(msg.parts);
    if (!text) {
      continue;
    }
    out.push({ role: msg.role, text });
  }
  return out;
}
