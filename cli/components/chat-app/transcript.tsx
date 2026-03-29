/**
 * Transcript rendering helpers for the terminal chat UI.
 */
import { useEffect, useState } from "react";
import { TextAttributes, type SyntaxStyle } from "@opentui/core";
import type { AssistantSegment, ChatLine } from "../../lib/chat-transcript-types";
import { createOpenpawMarkdownRenderNode } from "../../lib/markdown-render-node";
import { ONBOARD } from "../theme";

/** Minimum width passed to the markdown renderable so wrapping stays stable in tiny terminals. */
const MIN_MARKDOWN_WIDTH = 20;

/** Braille animation frames for a compact loading indicator. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/**
 * Appends a stream delta to assistant segments, merging with the trailing segment when kinds match.
 */
export function appendAssistantSegment(
  segments: AssistantSegment[],
  kind: AssistantSegment["kind"],
  delta: string,
): AssistantSegment[] {
  const last = segments[segments.length - 1];
  if (last?.kind === kind) {
    return [...segments.slice(0, -1), { kind, text: last.text + delta }];
  }
  return [...segments, { kind, text: delta }];
}

/**
 * True when an in-progress assistant row has no visible characters yet.
 */
export function assistantLineIsEmpty(line: Extract<ChatLine, { role: "assistant" }>): boolean {
  return line.segments.length === 0 || line.segments.every((s) => s.text.length === 0);
}

function assistantHasVisibleText(line: Extract<ChatLine, { role: "assistant" }>): boolean {
  return line.segments.some((s) => s.kind === "text" && s.text.length > 0);
}

/**
 * True when a completed assistant turn has no visible text, reasoning, or tool output.
 */
export function assistantSegmentsAreBlank(segments: AssistantSegment[]): boolean {
  return !segments.some((s) => s.text.trim().length > 0);
}

/**
 * Shows a small spinner while the assistant is generating but no visible reply text exists yet.
 */
function BusySpinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <text fg={ONBOARD.accent} marginTop={1} selectable>
      {SPINNER_FRAMES[frame]} Thinking…
    </text>
  );
}

/**
 * Horizontal space for markdown wrapping: root padding, transcript border, and inner padding.
 */
export function transcriptMarkdownWidth(terminalWidth: number): number {
  return Math.max(MIN_MARKDOWN_WIDTH, terminalWidth - 6);
}

function ChatMessageBlock({
  line,
  lineIndex,
  linesLength,
  busy,
  markdownWidth,
  syntaxStyle,
  markdownRenderNode,
}: {
  line: ChatLine;
  lineIndex: number;
  linesLength: number;
  busy: boolean;
  markdownWidth: number;
  syntaxStyle: SyntaxStyle;
  markdownRenderNode: ReturnType<typeof createOpenpawMarkdownRenderNode>;
}) {
  const isLastLine = lineIndex === linesLength - 1;
  const isStreamingAssistant = busy && isLastLine && line.role === "assistant";

  if (line.role === "user") {
    return (
      <box flexDirection="column" gap={0} marginBottom={1}>
        <text fg={ONBOARD.roleLabel} attributes={TextAttributes.BOLD} selectable>
          <strong>You</strong>
        </text>
        <box flexDirection="column" paddingTop={1}>
          <text fg={ONBOARD.text} selectable wrapMode="word" width={markdownWidth}>
            {line.text}
          </text>
        </box>
      </box>
    );
  }

  if (line.role === "assistant") {
    const nonEmpty = line.segments.filter((s) => s.text.length > 0);
    let lastTextNonEmptyIndex = -1;
    for (let i = nonEmpty.length - 1; i >= 0; i--) {
      if (nonEmpty[i]!.kind === "text") {
        lastTextNonEmptyIndex = i;
        break;
      }
    }
    const showSpinnerForMissingText =
      isStreamingAssistant && !assistantHasVisibleText(line) && nonEmpty.length > 0;

    return (
      <box flexDirection="column" gap={0} marginBottom={1}>
        <text fg={ONBOARD.roleLabel} attributes={TextAttributes.BOLD} selectable marginBottom={1}>
          <strong>Assistant</strong>
        </text>
        {nonEmpty.length === 0 ? (
          isStreamingAssistant ? (
            <BusySpinner />
          ) : (
            <text fg={ONBOARD.muted} selectable>
              No reply
            </text>
          )
        ) : (
          <box flexDirection="column" gap={1} width="100%">
            {nonEmpty.map((s, i) =>
              s.kind === "reasoning" ? (
                <box key={i} flexDirection="column" paddingTop={1} paddingBottom={0}>
                  <text fg={ONBOARD.hint} selectable wrapMode="word" width={markdownWidth}>
                    {s.text}
                  </text>
                </box>
              ) : s.kind === "tool" ? (
                <box key={i} flexDirection="column" padding={0} gap={0}>
                  <markdown
                    content={s.text}
                    syntaxStyle={syntaxStyle}
                    width={markdownWidth}
                    streaming={false}
                    conceal={false}
                    renderNode={markdownRenderNode}
                    tableOptions={{
                      widthMode: "content",
                      borderStyle: "single",
                      borderColor: ONBOARD.hint,
                      cellPadding: 0,
                      selectable: true,
                    }}
                  />
                </box>
              ) : (
                <markdown
                  key={i}
                  content={s.text}
                  syntaxStyle={syntaxStyle}
                  width={markdownWidth}
                  streaming={isStreamingAssistant && i === lastTextNonEmptyIndex}
                  conceal
                  renderNode={markdownRenderNode}
                  tableOptions={{
                    widthMode: "content",
                    borderStyle: "single",
                    borderColor: ONBOARD.hint,
                    cellPadding: 0,
                    selectable: true,
                  }}
                />
              ),
            )}
            {showSpinnerForMissingText ? (
              <box paddingTop={1}>
                <BusySpinner />
              </box>
            ) : null}
          </box>
        )}
      </box>
    );
  }

  const isError = line.text.startsWith("Error:");
  return (
    <box flexDirection="column" gap={0} marginBottom={1}>
      <text fg={isError ? ONBOARD.error : ONBOARD.hint} selectable wrapMode="word" width={markdownWidth}>
        {line.text}
      </text>
    </box>
  );
}

export const defaultWelcomeLines: ChatLine[] = [
  {
    role: "system",
    text:
      "Session ready. Ask anything below. Commands: /new, /sessions, /resume N, /sandbox on|off, /pin, /unpin, /title, /mode",
  },
];

/**
 * Renders the transcript body for the current chat session.
 */
export function ChatTranscript({
  lines,
  busy,
  markdownWidth,
  syntaxStyle,
  markdownRenderNode,
}: {
  lines: ChatLine[];
  busy: boolean;
  markdownWidth: number;
  syntaxStyle: SyntaxStyle;
  markdownRenderNode: ReturnType<typeof createOpenpawMarkdownRenderNode>;
}) {
  return (
    <box flexDirection="column" gap={0}>
      {lines.map((line, i) => (
        <ChatMessageBlock
          key={i}
          line={line}
          lineIndex={i}
          linesLength={lines.length}
          busy={busy}
          markdownWidth={markdownWidth}
          syntaxStyle={syntaxStyle}
          markdownRenderNode={markdownRenderNode}
        />
      ))}
    </box>
  );
}
