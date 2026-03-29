/**
 * Gateway bootstrap for loading config, workspace, and shared runtime state.
 */
import { createAgentRuntime, type AgentRuntime } from "../agent/agent";
import { ensureWorkspaceLayout } from "../agent/workspace-bootstrap";
import { getWorkspaceRoot } from "../config/paths";
import type { OpenPawConfig } from "../config/types";
import { loadConfigResult } from "../config/storage";

export type OpenPawGatewayContext = {
  config: OpenPawConfig;
  workspacePath: string;
  runtime: AgentRuntime;
};

/**
 * Load config, ensure workspace layout, and create the shared agent runtime used by all channels.
 */
export async function createGatewayContext(): Promise<OpenPawGatewayContext> {
  const configResult = await loadConfigResult();
  if (!configResult.ok) {
    throw new Error(
      configResult.reason === "missing"
        ? "Config not found. Run `openpaw onboard` first."
        : `Config is invalid: ${configResult.message}`,
    );
  }
  ensureWorkspaceLayout();
  const workspacePath = getWorkspaceRoot();
  const runtime = await createAgentRuntime(configResult.config, workspacePath);
  return { config: configResult.config, workspacePath, runtime };
}
