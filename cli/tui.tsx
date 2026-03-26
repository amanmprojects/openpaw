/**
 * Entry for the `openpaw tui` subcommand: full-screen terminal chat against
 * the local agent runtime (separate from the gateway process).
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { loadSessionMessages } from "../agent/session-store";
import { createGatewayContext } from "../gateway/bootstrap";
import { getTuiPersistenceSessionId } from "../gateway/tui/tui-active-thread-store";
import { ChatApp } from "./components/chat-app";
import { uiMessagesToChatLines } from "./lib/ui-messages-to-chat-transcript";

/**
 * Bootstraps config and workspace, then runs the OpenTUI chat until the user exits.
 */
export async function runOpenPawTui(): Promise<void> {
  const ctx = await createGatewayContext();
  const sessionId = await getTuiPersistenceSessionId();
  const stored = await loadSessionMessages(sessionId, ctx.runtime.agent.tools);
  const initialLines = uiMessagesToChatLines(stored);
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });
  createRoot(renderer).render(
    <ChatApp
      initialSessionId={sessionId}
      initialLines={initialLines}
      runtime={ctx.runtime}
    />,
  );
}
