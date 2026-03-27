/**
 * Terminal chat UI: streams assistant replies from AgentRuntime and shows
 * a bordered transcript with onboarding-aligned colors.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { TextAttributes, type SyntaxStyle } from "@opentui/core";
import { useAutoCopySelection } from "../lib/use-auto-copy-selection";
import type { AgentRuntime } from "../../agent/agent";
import { loadSessionMessages } from "../../agent/session-store";
import { formatToolStreamEvent } from "../../agent/tool-stream-format";
import type { SessionId, ToolStreamEvent } from "../../agent/types";
import {
  firstCommandToken,
  RESERVED_SLASH_COMMANDS,
  restAfterCommand,
} from "../../gateway/slash-command-tokens";
import {
  setActiveTuiSession,
  startNewTuiThread,
} from "../../gateway/tui/tui-active-thread-store";
import { listTuiSessions } from "../../gateway/tui/tui-session-discovery";
import { formatTuiSessionLabel } from "../../gateway/tui/tui-session-label";
import { formatTuiSessionsListMessage } from "../../gateway/tui/tui-sessions-list-message";
import type { AssistantSegment, ChatLine } from "../lib/chat-transcript-types";
import { createOpenpawMarkdownRenderNode } from "../lib/markdown-render-node";
import { createOnboardMarkdownSyntaxStyle } from "../lib/onboard-markdown-syntax-style";
import { uiMessagesToChatLines } from "../lib/ui-messages-to-chat-transcript";
import { ONBOARD } from "./theme";

export type { AssistantSegment, ChatLine } from "../lib/chat-transcript-types";

/**
 * Appends a stream delta to assistant segments, merging with the trailing segment when kinds match.
 */
function appendAssistantSegment(
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
function assistantLineIsEmpty(line: Extract<ChatLine, { role: "assistant" }>): boolean {
  return line.segments.length === 0 || line.segments.every((s) => s.text.length === 0);
}

const SLASH_SUGGESTIONS: { command: string; description: string }[] = [
  { command: "/new", description: "Start a new conversation thread" },
  { command: "/sessions", description: "List saved sessions" },
  { command: "/resume", description: "Resume session by number (see /sessions)" },
];

function assistantHasVisibleText(line: Extract<ChatLine, { role: "assistant" }>): boolean {
  return line.segments.some((s) => s.kind === "text" && s.text.length > 0);
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
          <text fg={ONBOARD.text} selectable>
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
        <text fg={ONBOARD.roleLabel} attributes={TextAttributes.BOLD} selectable>
          <strong>Assistant</strong>
        </text>
        {nonEmpty.length === 0 ? (
          isStreamingAssistant ? (
            <BusySpinner />
          ) : (
            <text fg={ONBOARD.muted} selectable>
              …
            </text>
          )
        ) : (
          <>
            {nonEmpty.map((s, i) =>
              s.kind === "reasoning" || s.kind === "tool" ? (
                <box key={i} flexDirection="column" paddingTop={1} paddingBottom={1}>
                  <text fg={ONBOARD.hint} selectable>
                    {s.text}
                  </text>
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
          </>
        )}
      </box>
    );
  }

  const isError = line.text.startsWith("Error:");
  return (
    <box flexDirection="column" gap={0} marginBottom={1}>
      <text fg={isError ? ONBOARD.error : ONBOARD.hint} selectable>
        {line.text}
      </text>
    </box>
  );
}

const defaultWelcomeLines: ChatLine[] = [
  {
    role: "system",
    text: "Session ready. Ask anything below. Commands: /new, /sessions, /resume N",
  },
];

/**
 * True when the message is a slash command at the start (leading spaces allowed),
 * not a `/path` in the middle of a sentence.
 */
function isSlashCommandLine(draft: string): boolean {
  return draft.trimStart().startsWith("/");
}

/** Minimum width passed to the markdown renderable so wrapping stays stable in tiny terminals. */
const MIN_MARKDOWN_WIDTH = 20;

/** Braille animation frames for a compact loading indicator (OpenTUI dev skill pattern). */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

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
function transcriptMarkdownWidth(terminalWidth: number): number {
  return Math.max(MIN_MARKDOWN_WIDTH, terminalWidth - 6);
}

/**
 * Returns slash commands whose name prefix matches the first segment after `/`.
 */
function matchingSlashSuggestions(draft: string): { command: string; description: string }[] {
  if (!isSlashCommandLine(draft)) {
    return [];
  }
  const lead = draft.trimStart();
  const firstSeg = lead.split(/\s+/)[0] ?? "";
  const namePrefix = firstSeg.slice(1).toLowerCase();
  return SLASH_SUGGESTIONS.filter((s) => {
    const name = s.command.slice(1).toLowerCase();
    return namePrefix === "" || name.startsWith(namePrefix);
  });
}

/**
 * Builds the text to send to handlers from draft + chosen command (keeps args after first token).
 */
function applyChosenSlashCommand(
  draft: string,
  chosen: { command: string },
): string {
  const lead = draft.trimStart();
  const parts = lead.split(/\s+/).filter(Boolean);
  const tail = parts.slice(1).join(" ").trim();
  return tail.length > 0 ? `${chosen.command} ${tail}` : chosen.command;
}

/**
 * Root chat view: one session, streaming deltas into the last assistant message.
 */
export function ChatApp({
  runtime,
  initialLines = [],
  initialSessionId,
}: {
  runtime: AgentRuntime;
  /** Prior transcript for the active TUI session when non-empty; otherwise welcome lines are shown. */
  initialLines?: ChatLine[];
  /** Active persistence session id from {@link getTuiPersistenceSessionId}. */
  initialSessionId: SessionId;
}) {
  const [lines, setLines] = useState<ChatLine[]>(() =>
    initialLines.length > 0 ? initialLines : defaultWelcomeLines,
  );
  const [sessionId, setSessionId] = useState<SessionId>(initialSessionId);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const { width: terminalWidth } = useTerminalDimensions();
  const markdownWidth = transcriptMarkdownWidth(terminalWidth);
  const markdownSyntaxStyle = useMemo(() => createOnboardMarkdownSyntaxStyle(), []);
  const markdownPalette = useMemo(
    () =>
      ({
        accent: ONBOARD.accent,
        text: ONBOARD.text,
        muted: ONBOARD.muted,
        hint: ONBOARD.hint,
        success: ONBOARD.success,
        code: "#89ddff",
        linkUrl: "#7dcfff",
      }) as const,
    [],
  );
  const markdownRenderNode = useMemo(
    () => createOpenpawMarkdownRenderNode(markdownPalette),
    [markdownPalette],
  );

  useAutoCopySelection();

  const suggestions = useMemo(
    () => (!busy ? matchingSlashSuggestions(draft) : []),
    [draft, busy],
  );

  useEffect(() => {
    setSuggestionIndex(0);
  }, [draft]);

  const safeSuggestionIndex = Math.min(
    suggestionIndex,
    Math.max(0, suggestions.length - 1),
  );

  const applyTranscriptFromDisk = useCallback(
    async (sid: SessionId) => {
      const messages = await loadSessionMessages(sid, runtime.agent.tools);
      const next = uiMessagesToChatLines(messages);
      setLines(next.length > 0 ? next : defaultWelcomeLines);
    },
    [runtime.agent.tools],
  );

  const handleReservedSlashCommand = useCallback(
    async (text: string): Promise<boolean> => {
      const token = firstCommandToken(text);
      if (!token || !RESERVED_SLASH_COMMANDS.has(token)) {
        return false;
      }

      if (token === "/new") {
        try {
          const newId = await startNewTuiThread();
          setSessionId(newId);
          await applyTranscriptFromDisk(newId);
          setLines((prev) => [
            ...prev,
            { role: "system", text: "Started a new conversation." },
          ]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setLines((prev) => [...prev, { role: "system", text: `Error: ${msg}` }]);
        }
        return true;
      }

      if (token === "/sessions") {
        try {
          const entries = await listTuiSessions();
          const body = formatTuiSessionsListMessage(entries, sessionId);
          setLines((prev) => [...prev, { role: "system", text: body }]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setLines((prev) => [...prev, { role: "system", text: `Error: ${msg}` }]);
        }
        return true;
      }

      if (token === "/reasoning" || token === "/tool_calls") {
        setLines((prev) => [
          ...prev,
          {
            role: "system",
            text: `${token} is only available in the Telegram channel (same bot). Terminal chat always shows the full stream.`,
          },
        ]);
        return true;
      }

      if (token === "/resume") {
        const arg = restAfterCommand(text);
        if (!/^\d+$/.test(arg)) {
          setLines((prev) => [
            ...prev,
            {
              role: "system",
              text: "Usage: /resume 1 — use /sessions to see numbers.",
            },
          ]);
          return true;
        }
        const n = Number.parseInt(arg, 10);
        if (n < 1) {
          setLines((prev) => [
            ...prev,
            {
              role: "system",
              text: "Usage: /resume 1 — use /sessions to see numbers.",
            },
          ]);
          return true;
        }
        try {
          const entries = await listTuiSessions();
          if (entries.length === 0) {
            setLines((prev) => [...prev, { role: "system", text: "No saved sessions yet." }]);
            return true;
          }
          if (n > entries.length) {
            setLines((prev) => [
              ...prev,
              {
                role: "system",
                text: `No session ${n}. Run /sessions (1–${entries.length}).`,
              },
            ]);
            return true;
          }
          const chosen = entries[n - 1]!;
          await setActiveTuiSession(chosen.sessionId);
          setSessionId(chosen.sessionId);
          await applyTranscriptFromDisk(chosen.sessionId);
          const label = formatTuiSessionLabel(chosen.sessionId);
          setLines((prev) => [
            ...prev,
            { role: "system", text: `Resumed session ${n} (${label}).` },
          ]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setLines((prev) => [...prev, { role: "system", text: `Error: ${msg}` }]);
        }
        return true;
      }

      return false;
    },
    [applyTranscriptFromDisk, sessionId],
  );

  useKeyboard((key) => {
    if (busy || suggestions.length === 0) {
      return;
    }
    if (key.name === "up") {
      setSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (key.name === "down") {
      setSuggestionIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (key.name !== "tab") {
      return;
    }
    const pick =
      suggestions[Math.min(suggestionIndex, suggestions.length - 1)] ??
      suggestions[0]!;
    let next = applyChosenSlashCommand(draft, pick);
    if (pick.command === "/resume" && !restAfterCommand(next)) {
      next = `${next} `;
    }
    setDraft(next);
  });

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) {
        return;
      }

      if (isSlashCommandLine(raw)) {
        const token = firstCommandToken(text);
        if (token && RESERVED_SLASH_COMMANDS.has(token)) {
          if (await handleReservedSlashCommand(text)) {
            setDraft("");
            return;
          }
        }

        const matches = matchingSlashSuggestions(raw);
        if (matches.length === 0) {
          const firstSeg = text.trimStart().split(/\s+/)[0] ?? "";
          setLines((prev) => [
            ...prev,
            {
              role: "system",
              text: `Unknown command ${firstSeg}. Try /new, /sessions, /resume, /reasoning, or /tool_calls.`,
            },
          ]);
          setDraft("");
          return;
        }
        if (matches.length > 1) {
          setLines((prev) => [
            ...prev,
            {
              role: "system",
              text:
                "Ambiguous command; type more characters (e.g. /sess) or use ↑/↓ and Tab to pick.",
            },
          ]);
          setDraft("");
          return;
        }
        const resolved = applyChosenSlashCommand(raw, matches[0]!);
        if (await handleReservedSlashCommand(resolved)) {
          setDraft("");
          return;
        }
        setDraft("");
        return;
      }

      setBusy(true);
      setDraft("");
      setLines((prev) => [...prev, { role: "user", text }]);

      let assistantSegments: AssistantSegment[] = [];

      setLines((prev) => [...prev, { role: "assistant", segments: [] }]);

      try {
        await runtime.runTurn({
          sessionId,
          userText: text,
          onReasoningDelta: (delta) => {
            assistantSegments = appendAssistantSegment(assistantSegments, "reasoning", delta);
            const snapshot = assistantSegments;
            setLines((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { role: "assistant", segments: snapshot };
              }
              return next;
            });
          },
          onTextDelta: (delta) => {
            assistantSegments = appendAssistantSegment(assistantSegments, "text", delta);
            const snapshot = assistantSegments;
            setLines((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { role: "assistant", segments: snapshot };
              }
              return next;
            });
          },
          onToolStatus: (ev: ToolStreamEvent) => {
            const line = formatToolStreamEvent(ev);
            if (!line) {
              return;
            }
            const lastSeg = assistantSegments[assistantSegments.length - 1];
            const prefix = lastSeg?.kind === "tool" ? "\n" : "";
            assistantSegments = appendAssistantSegment(
              assistantSegments,
              "tool",
              `${prefix}${line}`,
            );
            const snapshot = assistantSegments;
            setLines((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { role: "assistant", segments: snapshot };
              }
              return next;
            });
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLines((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && assistantLineIsEmpty(last)) {
            next.pop();
          }
          return [...next, { role: "system", text: `Error: ${msg}` }];
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, handleReservedSlashCommand, runtime, sessionId],
  );

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      paddingTop={1}
      paddingX={1}
      paddingBottom={0}
      gap={0}
    >
      <box flexDirection="row" alignItems="flex-end" gap={2} flexShrink={0} marginBottom={1}>
        <ascii-font font="tiny" text="OpenPaw" color={ONBOARD.accent} marginLeft={1} />
        <text fg={ONBOARD.muted}>Terminal chat</text>
      </box>

      <box
        flexGrow={1}
        flexDirection="column"
        borderStyle="single"
        borderColor={ONBOARD.hint}
        paddingX={1}
        paddingTop={0}
        paddingBottom={0}
        minHeight={4}
      >
        <scrollbox
          flexGrow={1}
          focused={false}
          stickyScroll
          stickyStart="bottom"
        >
          <box flexDirection="column" gap={0}>
            {lines.map((line, i) => (
              <ChatMessageBlock
                key={i}
                line={line}
                lineIndex={i}
                linesLength={lines.length}
                busy={busy}
                markdownWidth={markdownWidth}
                syntaxStyle={markdownSyntaxStyle}
                markdownRenderNode={markdownRenderNode}
              />
            ))}
          </box>
        </scrollbox>
      </box>

      <box
        flexShrink={0}
        width="100%"
        borderStyle="single"
        borderColor={ONBOARD.hint}
        paddingX={1}
        paddingY={0}
      >
        <box position="relative" width="100%">
          {suggestions.length > 0 && (
            <box
              position="absolute"
              left={0}
              right={0}
              bottom="100%"
              marginBottom={0}
              zIndex={10}
              flexDirection="column"
              paddingLeft={1}
              paddingRight={1}
              paddingTop={1}
              paddingBottom={1}
              gap={0}
              backgroundColor="#1e2030"
            >
              {suggestions.map((s, i) => {
                const active = i === safeSuggestionIndex;
                return (
                  <box key={s.command} flexDirection="row" gap={0}>
                    <text fg={active ? ONBOARD.accent : ONBOARD.muted} selectable>
                      <strong>{active ? "› " : "  "}</strong>
                      <strong>{s.command}</strong>
                    </text>
                    <text fg={ONBOARD.muted} selectable>{` — ${s.description}`}</text>
                  </box>
                );
              })}
            </box>
          )}
          <input
            focused
            value={draft}
            onInput={setDraft}
            onChange={setDraft}
            onSubmit={(payload) => {
              const raw = typeof payload === "string" ? payload : draft;
              void sendMessage(raw);
            }}
            placeholder={busy ? "Waiting for assistant…" : "Message"}
            textColor={ONBOARD.text}
            cursorColor={ONBOARD.accent}
          />
        </box>
      </box>

      <box flexDirection="column" gap={0} flexShrink={0} marginLeft={1}>
        <text fg={ONBOARD.hint}>
          Enter send · Tab complete · ↑/↓ highlight · Ctrl+C quit
        </text>
      </box>
    </box>
  );
}
