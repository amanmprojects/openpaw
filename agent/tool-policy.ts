import type { ToolExecutionPolicy, ToolRiskClass, ToolSafetyMode } from "./types";

/**
 * Builds the effective tool execution policy for a given safety mode.
 */
export function buildToolExecutionPolicy(safetyMode: ToolSafetyMode): ToolExecutionPolicy {
  if (safetyMode === "full_access") {
    return {
      allowWorkspaceWrites: true,
      allowExternalWrites: true,
      allowShell: true,
    };
  }
  return {
    allowWorkspaceWrites: true,
    allowExternalWrites: false,
    allowShell: true,
    requireConfirmationFor: ["external_write", "sensitive"],
  };
}

/**
 * Risk classifier for the current built-in tools.
 */
export function classifyToolRisk(toolName: string, sandboxRestricted: boolean): ToolRiskClass {
  if (toolName === "bash") {
    return "shell";
  }
  if (toolName === "list_dir") {
    return "safe_read";
  }
  if (toolName === "memory") {
    return "workspace_write";
  }
  if (toolName === "file_editor") {
    return sandboxRestricted ? "workspace_write" : "external_write";
  }
  return "sensitive";
}
