/**
 * Entry for the `openpaw tui` subcommand: full-screen terminal chat against
 * the local agent runtime (separate from the gateway process).
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createGatewayContext } from "../gateway/bootstrap";
import { ChatApp } from "./components/chat-app";

/**
 * Bootstraps config and workspace, then runs the OpenTUI chat until the user exits.
 */
export async function runOpenPawTui(): Promise<void> {
  const ctx = await createGatewayContext();
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });
  createRoot(renderer).render(<ChatApp runtime={ctx.runtime} />);
}
