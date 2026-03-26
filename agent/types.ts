/**
 * Opaque session identifier, e.g. `telegram:12345`, `tui:main`, or `cli:main`.
 */
export type SessionId = string;

export type RunTurnParams = {
  sessionId: SessionId;
  userText: string;
  /** Called for streamed assistant text tokens (optional). */
  onTextDelta?: (delta: string) => void;
};
