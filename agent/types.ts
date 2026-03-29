/**
 * Opaque session identifier, e.g. `telegram:12345`, `tui:main`, or `cli:main`.
 */
export type SessionId = string;

/** Chat surface — used for platform-specific system prompt hints. */
export type OpenPawSurface = "cli" | "telegram";

/** High-level prompt/runtime mode for a session. */
export type SessionMode = "general" | "coding" | "research";

/** Safety profile for tool execution. */
export type ToolSafetyMode = "workspace_only" | "full_access";

/** Risk buckets for current and future approval-aware tool execution. */
export type ToolRiskClass =
  | "safe_read"
  | "workspace_write"
  | "external_write"
  | "shell"
  | "sensitive";

/** Policy shape used to make tool execution decisions. */
export type ToolExecutionPolicy = {
  allowWorkspaceWrites: boolean;
  allowExternalWrites: boolean;
  allowShell: boolean;
  requireConfirmationFor?: ToolRiskClass[];
};

/**
 * High-signal tool lifecycle events from the UI message stream (for channels like Telegram).
 */
export type ToolStreamEvent =
  | { type: "tool_input"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_output"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool_error"; toolCallId: string; toolName: string; errorText: string }
  | { type: "tool_denied"; toolCallId: string; toolName: string };

export type RuntimeTurnEvent =
  | { type: "turn_started"; sessionId: string; surface: OpenPawSurface; startedAt: string }
  | { type: "tool_called"; sessionId: string; toolName: string; toolCallId: string }
  | {
      type: "tool_completed";
      sessionId: string;
      toolName: string;
      toolCallId: string;
      status: "ok" | "error" | "denied";
    }
  | { type: "turn_finished"; sessionId: string; completedAt: string; durationMs: number };

export type RunTurnParams = {
  sessionId: SessionId;
  userText: string;
  /**
   * Where the user is chatting from — affects formatting hints in the system prompt.
   * Defaults to `telegram` when `sessionId` starts with `telegram:`, otherwise `cli`.
   */
  surface?: OpenPawSurface;
  sandboxRestricted?: boolean;
  /** Preferred safety mode for this turn; defaults to `workspace_only`. */
  safetyMode?: ToolSafetyMode;
  /** Optional session mode override for this turn. */
  sessionMode?: SessionMode;
  /** Called for streamed assistant text tokens (optional). */
  onTextDelta?: (delta: string) => void;
  /** Called for streamed model reasoning tokens when the provider exposes them (optional). */
  onReasoningDelta?: (delta: string) => void;
  /** Tool status for live UI (optional). */
  onToolStatus?: (event: ToolStreamEvent) => void;
};
