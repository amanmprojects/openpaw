/**
 * Terminal chat UI: streams assistant replies from AgentRuntime and shows
 * a bordered transcript with onboarding-aligned colors.
 */
import { useCallback, useMemo, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { AgentRuntime } from "../../agent/agent";
import { loadSessionMessages } from "../../agent/session-store";
import type { SessionId } from "../../agent/types";
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
import { uiMessagesToChatLines } from "../lib/ui-messages-to-chat-transcript";
import { ONBOARD } from "./theme";

export type ChatLine = {
  role: "user" | "assistant" | "system";
  text: string;
};

const SLASH_SUGGESTIONS: { command: string; description: string }[] = [
  { command: "/new", description: "Start a new conversation thread" },
  { command: "/sessions", description: "List saved sessions" },
  { command: "/resume", description: "Resume session by number (see /sessions)" },
];

function ChatMessageBlock({ line }: { line: ChatLine }) {
  if (line.role === "user") {
    return (
      <box flexDirection="column" gap={0} marginBottom={1}>
        <text fg={ONBOARD.accent}>
          <strong>You</strong>
        </text>
        <text fg={ONBOARD.text}>{line.text}</text>
      </box>
    );
  }

  if (line.role === "assistant") {
    const body = line.text.length > 0 ? line.text : "…";
    return (
      <box flexDirection="column" gap={0} marginBottom={1}>
        <text fg={ONBOARD.accent}>
          <strong>Assistant</strong>
        </text>
        <text fg={ONBOARD.muted}>{body}</text>
      </box>
    );
  }

  const isError = line.text.startsWith("Error:");
  return (
    <box flexDirection="column" gap={0} marginBottom={1}>
      <text fg={isError ? ONBOARD.error : ONBOARD.hint}>{line.text}</text>
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
 * Returns slash commands whose name prefix matches the first segment after `/`.
 */
function matchingSlashSuggestions(draft: string): { command: string; description: string }[] {
  const firstSeg = draft.trim().split(/\s+/)[0] ?? "";
  if (!firstSeg.startsWith("/")) {
    return [];
  }
  const namePrefix = firstSeg.slice(1).toLowerCase();
  return SLASH_SUGGESTIONS.filter((s) => {
    const name = s.command.slice(1).toLowerCase();
    return namePrefix === "" || name.startsWith(namePrefix);
  });
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

  const suggestions = useMemo(
    () => (!busy ? matchingSlashSuggestions(draft) : []),
    [draft, busy],
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
    if (key.name !== "tab" || suggestions.length === 0 || busy) {
      return;
    }
    const pick = suggestions[0]!;
    const trimmed = draft.trimStart();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const tail = parts.slice(1).join(" ").trim();
    const spacer = pick.command === "/resume" && !tail ? " " : "";
    setDraft(
      tail.length > 0 ? `${pick.command} ${tail}` : `${pick.command}${spacer}`,
    );
  });

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) {
        return;
      }

      if (await handleReservedSlashCommand(text)) {
        setDraft("");
        return;
      }

      setBusy(true);
      setDraft("");
      setLines((prev) => [...prev, { role: "user", text }]);

      let assistantText = "";

      setLines((prev) => [...prev, { role: "assistant", text: "" }]);

      try {
        await runtime.runTurn({
          sessionId,
          userText: text,
          onTextDelta: (delta) => {
            assistantText += delta;
            setLines((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  role: "assistant",
                  text: assistantText,
                };
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
          if (last?.role === "assistant" && last.text === "") {
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
    <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
      <box flexDirection="row" alignItems="flex-end" gap={2} flexShrink={0}>
        <ascii-font font="tiny" text="OpenPaw" color={ONBOARD.accent} />
        <text fg={ONBOARD.muted}>Terminal chat</text>
      </box>

      <box
        flexGrow={1}
        flexDirection="column"
        borderStyle="single"
        borderColor={ONBOARD.hint}
        padding={1}
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
              <ChatMessageBlock key={i} line={line} />
            ))}
          </box>
        </scrollbox>
      </box>

      <box flexDirection="column" gap={0} flexShrink={0}>
        <text fg={ONBOARD.hint}>Enter to send · Tab completes slash commands</text>
        <text fg={ONBOARD.hint}>Ctrl+C to quit</text>
      </box>

      {suggestions.length > 0 && (
        <box
          flexDirection="column"
          flexShrink={0}
          borderStyle="single"
          borderColor={ONBOARD.hint}
          padding={1}
          gap={0}
        >
          {suggestions.map((s) => (
            <box key={s.command} flexDirection="row" gap={0}>
              <text fg={ONBOARD.accent}>
                <strong>{s.command}</strong>
              </text>
              <text fg={ONBOARD.muted}>{` — ${s.description}`}</text>
            </box>
          ))}
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
  );
}
