/**
 * Terminal chat UI: streams assistant replies from AgentRuntime and shows
 * a bordered transcript with onboarding-aligned colors.
 */
import { TextareaRenderable } from "@opentui/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { SessionMode } from "../../../agent";
import { loadSessionMessages, loadSessionMetadata, updateSessionMetadata } from "../../../agent/session-store";
import { formatToolStreamEventForTui, extractToolHint } from "../../../agent/tool-stream-format";
import type { AgentRuntime } from "../../../agent/agent";
import type { SessionId, ToolStreamEvent } from "../../../agent/types";
import {
  firstCommandToken,
  RESERVED_SLASH_COMMANDS,
  restAfterCommand,
} from "../../../gateway/slash-command-tokens";
import {
  setActiveTuiSession,
  startNewTuiThread,
} from "../../../gateway/tui/tui-active-thread-store";
import { listTuiSessions } from "../../../gateway/tui/tui-session-discovery";
import { formatTuiSessionLabel } from "../../../gateway/tui/tui-session-label";
import { formatTuiSessionsListMessage } from "../../../gateway/tui/tui-sessions-list-message";
import { useRenderer } from "@opentui/react";
import type { AssistantSegment, ChatLine } from "../../lib/chat-transcript-types";
import { createOpenpawMarkdownRenderNode } from "../../lib/markdown-render-node";
import { createOnboardMarkdownSyntaxStyle } from "../../lib/onboard-markdown-syntax-style";
import { uiMessagesToChatLines } from "../../lib/ui-messages-to-chat-transcript";
import { ONBOARD } from "../theme";
import {
  LOCAL_TUI_COMMANDS,
  applyChosenSlashCommand,
  isSlashCommandLine,
  matchingSlashSuggestions,
  parseSessionMode,
} from "./slash-commands";
import {
  ChatTranscript,
  appendAssistantSegment,
  assistantLineIsEmpty,
  assistantSegmentsAreBlank,
  defaultWelcomeLines,
  replaceToolHint,
  transcriptMarkdownWidth,
} from "./transcript";

export type { AssistantSegment, ChatLine } from "../../lib/chat-transcript-types";

async function loadMode(
  runtime: AgentRuntime,
  sessionId: SessionId,
): Promise<SessionMode> {
  const metadata = await loadSessionMetadata(sessionId, runtime.agent.tools);
  return metadata?.mode ?? "general";
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
  initialLines?: ChatLine[];
  initialSessionId: SessionId;
}) {
  const [lines, setLines] = useState<ChatLine[]>(() =>
    initialLines.length > 0 ? initialLines : defaultWelcomeLines,
  );
  const [sessionId, setSessionId] = useState<SessionId>(initialSessionId);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [sandboxRestricted, setSandboxRestricted] = useState(true);
  const [sessionMode, setSessionMode] = useState<SessionMode>("general");

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

  const textareaRef = useRef<TextareaRenderable | null>(null);
  const renderer = useRenderer();

  /** Sync React draft and the OpenTUI buffer (Tab completion, external text). */
  const applyDraft = useCallback((next: string) => {
    setDraft(next);
    if (textareaRef.current) {
      textareaRef.current.setText(next);
      textareaRef.current.cursorOffset = next.length;
    }
  }, []);

  /** Clear composer state and the underlying textarea buffer after send or slash handling. */
  const clearComposer = useCallback(() => {
    setDraft("");
    textareaRef.current?.setText("");
  }, []);

  const suggestions = useMemo(
    () => (!busy ? matchingSlashSuggestions(draft) : []),
    [draft, busy],
  );

  useEffect(() => {
    void loadMode(runtime, initialSessionId).then(setSessionMode);
  }, [initialSessionId, runtime]);

  useEffect(() => {
    setSuggestionIndex(0);
  }, [draft]);

  const safeSuggestionIndex = Math.min(
    suggestionIndex,
    Math.max(0, suggestions.length - 1),
  );

  const applyTranscriptFromDisk = useCallback(
    async (sid: SessionId) => {
      const [messages, mode] = await Promise.all([
        loadSessionMessages(sid, runtime.agent.tools),
        loadMode(runtime, sid),
      ]);
      const next = uiMessagesToChatLines(messages);
      setLines(next.length > 0 ? next : defaultWelcomeLines);
      setSessionMode(mode);
    },
    [runtime],
  );

  const appendSystemLine = useCallback((text: string) => {
    setLines((prev) => [...prev, { role: "system", text }]);
  }, []);

  const handleReservedSlashCommand = useCallback(
    async (text: string): Promise<boolean> => {
      const token = firstCommandToken(text);
      if (!token || (!RESERVED_SLASH_COMMANDS.has(token) && !LOCAL_TUI_COMMANDS.has(token))) {
        return false;
      }

      if (token === "/pin" || token === "/unpin") {
        const pinned = token === "/pin";
        await updateSessionMetadata(sessionId, runtime.agent.tools, { pinned });
        appendSystemLine(pinned ? "Pinned the current session." : "Unpinned the current session.");
        return true;
      }

      if (token === "/title") {
        const title = restAfterCommand(text).trim();
        if (!title) {
          appendSystemLine("Usage: /title Your new session title");
          return true;
        }
        await updateSessionMetadata(sessionId, runtime.agent.tools, { title });
        appendSystemLine(`Updated session title to "${title}".`);
        return true;
      }

      if (token === "/mode") {
        const arg = restAfterCommand(text).trim().toLowerCase();
        if (!arg) {
          appendSystemLine(`Current mode: ${sessionMode}. Usage: /mode general|coding|research`);
          return true;
        }
        const nextMode = parseSessionMode(arg);
        if (!nextMode) {
          appendSystemLine("Usage: /mode general|coding|research");
          return true;
        }
        await updateSessionMetadata(sessionId, runtime.agent.tools, { mode: nextMode });
        setSessionMode(nextMode);
        appendSystemLine(`Session mode set to ${nextMode}.`);
        return true;
      }

      if (token === "/new") {
        try {
          const newId = await startNewTuiThread();
          setSessionId(newId);
          setSessionMode("general");
          setLines(defaultWelcomeLines);
          appendSystemLine("Started a new conversation.");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendSystemLine(`Error: ${msg}`);
        }
        return true;
      }

      if (token === "/sessions") {
        try {
          const entries = await listTuiSessions();
          const body = formatTuiSessionsListMessage(entries, sessionId);
          appendSystemLine(body);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendSystemLine(`Error: ${msg}`);
        }
        return true;
      }

      if (token === "/reasoning" || token === "/tool_calls") {
        appendSystemLine(
          `${token} is only available in the Telegram channel (same bot). Terminal chat always shows the full stream.`,
        );
        return true;
      }

      if (token === "/sandbox") {
        const arg = restAfterCommand(text).trim().toLowerCase();
        if (arg !== "on" && arg !== "off") {
          appendSystemLine("Usage: /sandbox on — or — /sandbox off");
          return true;
        }
        const restricted = arg === "on";
        setSandboxRestricted(restricted);
        appendSystemLine(
          restricted
            ? "Filesystem sandbox is on: file_editor and bash are limited to the workspace."
            : "Filesystem sandbox is off. The agent can read/write outside the workspace and run shell commands with cwd in your home directory. Use only if you trust this session.",
        );
        return true;
      }

      if (token === "/resume") {
        const arg = restAfterCommand(text);
        if (!/^\d+$/.test(arg)) {
          appendSystemLine("Usage: /resume 1 — use /sessions to see numbers.");
          return true;
        }
        const n = Number.parseInt(arg, 10);
        if (n < 1) {
          appendSystemLine("Usage: /resume 1 — use /sessions to see numbers.");
          return true;
        }
        try {
          const entries = await listTuiSessions();
          if (entries.length === 0) {
            appendSystemLine("No saved sessions yet.");
            return true;
          }
          if (n > entries.length) {
            appendSystemLine(`No session ${n}. Run /sessions (1–${entries.length}).`);
            return true;
          }
          const chosen = entries[n - 1]!;
          await setActiveTuiSession(chosen.sessionId);
          setSessionId(chosen.sessionId);
          await applyTranscriptFromDisk(chosen.sessionId);
          const label = formatTuiSessionLabel(chosen.sessionId, chosen.title);
          appendSystemLine(`Resumed session ${n} (${label}).`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          appendSystemLine(`Error: ${msg}`);
        }
        return true;
      }

      return false;
    },
    [appendSystemLine, applyTranscriptFromDisk, runtime, sessionId, sessionMode],
  );

  useKeyboard((key) => {
    if (key.ctrl && key.shift && key.name === "c") {
      const sel = renderer.getSelection();
      if (sel && !sel.isDragging) {
        const text = sel.getSelectedText();
        if (text && renderer.isOsc52Supported()) {
          renderer.copyToClipboardOSC52(text);
        }
      }
      return;
    }

    if (key.ctrl && !key.shift && key.name === "c") {
      renderer.destroy();
      return;
    }

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
    if (
      (pick.command === "/resume" || pick.command === "/sandbox" || pick.command === "/title" || pick.command === "/mode") &&
      !restAfterCommand(next)
    ) {
      next = `${next} `;
    }
    applyDraft(next);
  });

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) {
        return;
      }

      if (isSlashCommandLine(raw)) {
        const token = firstCommandToken(text);
        if ((token && RESERVED_SLASH_COMMANDS.has(token)) || (token && LOCAL_TUI_COMMANDS.has(token))) {
          if (await handleReservedSlashCommand(text)) {
            clearComposer();
            return;
          }
        }

        const matches = matchingSlashSuggestions(raw);
        if (matches.length === 0) {
          const firstSeg = text.trimStart().split(/\s+/)[0] ?? "";
          appendSystemLine(
            `Unknown command ${firstSeg}. Try /new, /sessions, /resume, /sandbox, /pin, /unpin, /title, or /mode.`,
          );
          clearComposer();
          return;
        }
        if (matches.length > 1) {
          appendSystemLine(
            "Ambiguous command; type more characters (e.g. /sess) or use ↑/↓ and Tab to pick.",
          );
          clearComposer();
          return;
        }
        const resolved = applyChosenSlashCommand(raw, matches[0]!);
        if (await handleReservedSlashCommand(resolved)) {
          clearComposer();
          return;
        }
        clearComposer();
        return;
      }

      setBusy(true);
      clearComposer();
      setLines((prev) => [...prev, { role: "user", text }]);

      let assistantSegments: AssistantSegment[] = [];
      const toolHintAccum = new Map<string, string>();

      setLines((prev) => [...prev, { role: "assistant", segments: [] }]);

      try {
        await runtime.runTurn({
          sessionId,
          userText: text,
          surface: "cli",
          sandboxRestricted,
          safetyMode: sandboxRestricted ? "workspace_only" : "full_access",
          sessionMode,
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
            if (ev.type === "tool_starting") {
              toolHintAccum.set(ev.toolCallId, "");
              const initialHint = extractToolHint(ev.toolName, "");
              assistantSegments = appendAssistantSegment(
                assistantSegments,
                "tool-hint",
                initialHint,
                ev.toolCallId,
              );
            } else if (ev.type === "tool_input_delta") {
              const prev = toolHintAccum.get(ev.toolCallId) ?? "";
              toolHintAccum.set(ev.toolCallId, prev + ev.delta);
              const hint = extractToolHint(ev.toolName, toolHintAccum.get(ev.toolCallId) ?? "");
              assistantSegments = replaceToolHint(assistantSegments, ev.toolCallId, hint);
            } else if (ev.type === "tool_input") {
              toolHintAccum.delete(ev.toolCallId);
              const line = formatToolStreamEventForTui(ev);
              if (!line) return;
              const hintIdx = assistantSegments.findIndex(
                (s) => s.kind === "tool-hint" && s.toolCallId === ev.toolCallId,
              );
              if (hintIdx !== -1) {
                assistantSegments = assistantSegments.map((s, i) =>
                  i === hintIdx ? { kind: "tool", text: line, toolCallId: undefined } : s,
                );
              } else {
                const lastSeg = assistantSegments[assistantSegments.length - 1];
                const prefix = lastSeg?.kind === "tool" ? "\n" : "";
                assistantSegments = appendAssistantSegment(assistantSegments, "tool", `${prefix}${line}`);
              }
            } else {
              const line = formatToolStreamEventForTui(ev);
              if (!line) return;
              const lastSeg = assistantSegments[assistantSegments.length - 1];
              const prefix = lastSeg?.kind === "tool" ? "\n" : "";
              assistantSegments = appendAssistantSegment(assistantSegments, "tool", `${prefix}${line}`);
            }
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

        if (assistantSegmentsAreBlank(assistantSegments)) {
          setLines((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next.pop();
            }
            next.push({
              role: "system",
              text:
                "Nothing was streamed to the chat this turn. For paths outside the workspace (e.g. Desktop), run `/sandbox off` first.",
            });
            return next;
          });
        }
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
    [
      appendSystemLine,
      busy,
      clearComposer,
      handleReservedSlashCommand,
      runtime,
      sandboxRestricted,
      sessionId,
      sessionMode,
    ],
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
        <text fg={ONBOARD.muted}>{`Terminal chat · mode ${sessionMode} · ${sandboxRestricted ? "workspace_only" : "full_access"}`}</text>
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
        <scrollbox flexGrow={1} focused={false} stickyScroll stickyStart="bottom">
          <ChatTranscript
            lines={lines}
            busy={busy}
            markdownWidth={markdownWidth}
            syntaxStyle={markdownSyntaxStyle}
            markdownRenderNode={markdownRenderNode}
          />
        </scrollbox>
      </box>

      <box
        flexShrink={0}
        width="100%"
        flexDirection="column"
        borderStyle="single"
        borderColor={ONBOARD.hint}
        paddingX={1}
        paddingY={0}
        gap={0}
      >
        {suggestions.length > 0 && (
          <box
            flexDirection="column"
            flexShrink={0}
            marginBottom={1}
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
        <textarea
          ref={textareaRef}
          focused
          wrapMode="word"
          width="100%"
          minHeight={2}
          placeholder={busy ? "Waiting for assistant…" : "Message"}
          textColor={ONBOARD.text}
          focusedTextColor={ONBOARD.text}
          cursorColor={ONBOARD.accent}
          backgroundColor="transparent"
          focusedBackgroundColor="transparent"
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
            { name: "j", ctrl: true, action: "newline" },
          ]}
          onContentChange={() => {
            setDraft(textareaRef.current?.plainText ?? "");
          }}
          onSubmit={() => {
            void sendMessage(textareaRef.current?.plainText ?? draft);
          }}
        />
      </box>

      <box flexDirection="column" gap={0} flexShrink={0} marginLeft={1}>
        <text fg={ONBOARD.hint}>
          Enter send · Shift+Enter or Ctrl+J newline · Tab complete · ↑/↓ · Ctrl+C quit · Ctrl+Shift+C copy
        </text>
      </box>
    </box>
  );
}
