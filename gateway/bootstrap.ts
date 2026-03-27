import { createAgentRuntime, type AgentRuntime } from "../agent/agent";
import { ensureWorkspaceLayout } from "../agent/workspace-bootstrap";
import { getWorkspaceRoot } from "../config/paths";
import type { OpenPawConfig } from "../config/types";
import { loadConfig } from "../config/storage";

export type OpenPawGatewayContext = {
  config: OpenPawConfig;
  workspacePath: string;
  runtime: AgentRuntime;
};

/**
 * Load config, ensure workspace layout, and create the shared agent runtime used by all channels.
 */
export async function createGatewayContext(): Promise<OpenPawGatewayContext> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("Config not found. Run `openpaw onboard` first.");
  }
  ensureWorkspaceLayout();
  const workspacePath = getWorkspaceRoot();
  const runtime = await createAgentRuntime(config, workspacePath);
  return { config, workspacePath, runtime };
}
