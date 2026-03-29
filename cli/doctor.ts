import { existsSync } from "node:fs";
import { getConfigPath, getGatewayStateDir, getWorkspaceRoot, loadConfigResult } from "../config";
import { getGatewayDaemonStatus } from "../gateway/daemon-manager";

/**
 * Prints a compact diagnostic report for local support/debugging.
 */
export async function handleDoctor(): Promise<void> {
  const config = await loadConfigResult();
  const gateway = getGatewayDaemonStatus();
  const lines = [
    `config_path: ${getConfigPath()}`,
    `config_status: ${config.ok ? "valid" : `${config.reason} (${config.message})`}`,
    `workspace_path: ${getWorkspaceRoot()}`,
    `workspace_exists: ${existsSync(getWorkspaceRoot()) ? "yes" : "no"}`,
    `gateway_state_dir: ${getGatewayStateDir()}`,
    `gateway_status: ${gateway.state}`,
  ];
  if (config.ok) {
    lines.push(`provider_base_url: ${config.config.provider.baseUrl}`);
    lines.push(`provider_model: ${config.config.provider.model}`);
    lines.push(
      `telegram_configured: ${config.config.channels?.telegram?.botToken ? "yes" : "no"}`,
    );
  }
  console.log(lines.join("\n"));
}
