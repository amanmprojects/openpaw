/**
 * Opaque session identifier, e.g. `telegram:12345`, `tui:main`, or `cli:main`.
 */
export type SessionId = string;

/**
 * High-signal tool lifecycle events from the UI message stream (for channels like Telegram).
 */
export type ToolStreamEvent =
  | { type: "tool_input"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_output"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool_error"; toolCallId: string; toolName: string; errorText: string }
  | { type: "tool_denied"; toolCallId: string; toolName: string };

export type RunTurnParams = {
  sessionId: SessionId;
  userText: string;
  /**
   * When true (default), file_editor paths and bash cwd are workspace-scoped.
   * When false, file_editor may access the broader filesystem and bash uses $HOME as cwd.
   */
  sandboxRestricted?: boolean;
  /** Called for streamed assistant text tokens (optional). */
  onTextDelta?: (delta: string) => void;
  /** Called for streamed model reasoning tokens when the provider exposes them (optional). */
  onReasoningDelta?: (delta: string) => void;
  /** Tool status for live UI (optional). */
  onToolStatus?: (event: ToolStreamEvent) => void;
};
