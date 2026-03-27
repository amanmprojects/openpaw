import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-turn flags for tool execution. Used with {@link runWithTurnContext} so concurrent
 * gateway chats do not share mutable sandbox state on a single AgentRuntime.
 */
export type OpenPawTurnContext = {
  /** When true (default), file_editor and bash are scoped to the workspace; when false, broader access. */
  sandboxRestricted: boolean;
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
  return getTurnContext()?.sandboxRestricted ?? true;
}
