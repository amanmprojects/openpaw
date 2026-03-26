import { createCliRenderer, TextAttributes } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useCallback, useState } from "react";
import { createGatewayContext } from "../gateway/bootstrap";
import { tuiSessionKey } from "../gateway/session-key";
import type { AgentRuntime } from "../agent/agent";

type ChatLine = { role: "user" | "assistant" | "system"; text: string };

function ChatApp({ runtime }: { runtime: AgentRuntime }) {
  const [lines, setLines] = useState<ChatLine[]>([
    {
      role: "system",
      text: "OpenPaw — Enter to send, Ctrl+C to quit.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useKeyboard((key) => {
    if (key.name === "c" && key.ctrl) {
      process.exit(0);
    }
  });

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
                next[next.length - 1] = { role: "assistant", text: assistantText };
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
      <text decoration="bold">openpaw tui</text>
      <scrollbox flexGrow={1} focused={false}>
        <box flexDirection="column" gap={0}>
          {lines.map((line, i) => (
            <text
              key={i}
              attributes={line.role === "system" ? TextAttributes.DIM : undefined}
            >
              {line.role === "user"
                ? `You: ${line.text}`
                : line.role === "assistant"
                  ? line.text.length > 0
                    ? `Assistant: ${line.text}`
                    : "Assistant: …"
                  : line.text}
            </text>
          ))}
        </box>
      </scrollbox>
      <input
        focused
        value={draft}
        onChange={setDraft}
        onSubmit={sendMessage}
        placeholder={busy ? "Waiting…" : "Message"}
      />
    </box>
  );
}

export async function runOpenPawTui(): Promise<void> {
  const ctx = await createGatewayContext();
  const renderer = await createCliRenderer();
  createRoot(renderer).render(<ChatApp runtime={ctx.runtime} />);
}
