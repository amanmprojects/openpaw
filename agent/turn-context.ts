/**
 * Async-local turn context for prompt and tool execution settings.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { OpenPawSurface, SessionMode, ToolExecutionPolicy, ToolSafetyMode } from "./types";

/**
 * Per-turn flags for tool execution. Used with {@link runWithTurnContext} so concurrent
 * gateway chats do not share mutable sandbox state on a single AgentRuntime.
 */
export type OpenPawTurnContext = {
  /** Chat surface for platform hints in the system prompt. */
  surface: OpenPawSurface;
  /** Safety mode requested for the turn. */
  safetyMode: ToolSafetyMode;
  /** Prompt mode for the active session. */
  sessionMode: SessionMode;
  /** Concrete execution policy derived from the safety mode. */
  toolPolicy: ToolExecutionPolicy;
};

const turnStorage = new AsyncLocalStorage<OpenPawTurnContext>();

/**
 * Runs {@link fn} with turn context stored for the current async execution chain.
 */
export function runWithTurnContext<T>(
  ctx: OpenPawTurnContext,
  fn: () => Promise<T>,
): Promise<T> {
  return turnStorage.run(ctx, fn);
}

/**
 * Returns the current turn context, or undefined if not inside {@link runWithTurnContext}.
 */
export function getTurnContext(): OpenPawTurnContext | undefined {
  return turnStorage.getStore();
}

/**
 * Whether the filesystem/shell sandbox is restricted for this turn. Defaults to true when unset.
 */
export function isSandboxRestricted(): boolean {
  return (getTurnContext()?.safetyMode ?? "workspace_only") === "workspace_only";
}

/**
 * Current chat surface for system prompt hints. Defaults to `cli` when not in a turn.
 */
export function getTurnSurface(): OpenPawSurface {
  return getTurnContext()?.surface ?? "cli";
}

/**
 * Returns the current turn's prompt mode, defaulting to `general`.
 */
export function getTurnSessionMode(): SessionMode {
  return getTurnContext()?.sessionMode ?? "general";
}

/**
 * Returns the active tool execution policy for this turn.
 */
export function getTurnToolPolicy(): ToolExecutionPolicy {
  return (
    getTurnContext()?.toolPolicy ?? {
      allowWorkspaceWrites: true,
      allowExternalWrites: false,
      allowShell: true,
    }
  );
}
