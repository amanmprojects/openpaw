/**
 * Terminal chat UI: streams assistant replies from AgentRuntime and shows
 * a bordered transcript with onboarding-aligned colors.
 */
import { useCallback, useState } from "react";
import type { AgentRuntime } from "../../agent/agent";
import { tuiSessionKey } from "../../gateway/session-key";
import { ONBOARD } from "./theme";

export type ChatLine = {
  role: "user" | "assistant" | "system";
  text: string;
};

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
    const body =
      line.text.length > 0 ? line.text : "…";
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

/**
 * Root chat view: one session, streaming deltas into the last assistant message.
 */
export function ChatApp({ runtime }: { runtime: AgentRuntime }) {
  const [lines, setLines] = useState<ChatLine[]>([
    {
      role: "system",
      text: "Session ready. Ask anything below.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) {
        return;
      }

      setBusy(true);
      setDraft("");
      setLines((prev) => [...prev, { role: "user", text }]);

      const sessionId = tuiSessionKey();
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
    [busy, runtime],
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
        <scrollbox flexGrow={1} focused={false}>
          <box flexDirection="column" gap={0}>
            {lines.map((line, i) => (
              <ChatMessageBlock key={i} line={line} />
            ))}
          </box>
        </scrollbox>
      </box>

      <box flexDirection="column" gap={0} flexShrink={0}>
        <text fg={ONBOARD.hint}>Enter to send</text>
        <text fg={ONBOARD.hint}>Ctrl+C to quit</text>
      </box>

      <input
        focused
        value={draft}
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
