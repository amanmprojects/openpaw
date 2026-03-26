/**
 * Entry for the `openpaw tui` subcommand: full-screen terminal chat against
 * the local agent runtime (separate from the gateway process).
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { loadSessionMessages } from "../agent/session-store";
import { createGatewayContext } from "../gateway/bootstrap";
import { tuiSessionKey } from "../gateway/session-key";
import { ChatApp } from "./components/chat-app";
import { uiMessagesToChatLines } from "./lib/ui-messages-to-chat-lines";

/**
 * Bootstraps config and workspace, then runs the OpenTUI chat until the user exits.
 */
export async function runOpenPawTui(): Promise<void> {
  const ctx = await createGatewayContext();
  const stored = await loadSessionMessages(tuiSessionKey(), ctx.runtime.agent.tools);
  const initialLines = uiMessagesToChatLines(stored);
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });
  createRoot(renderer).render(
    <ChatApp initialLines={initialLines} runtime={ctx.runtime} />,
  );
}
