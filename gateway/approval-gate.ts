/**
 * Approval gate for sensitive agent actions.
 *
 * When the agent wants to run a destructive command or write a file, it calls
 * `requestApproval()` which resolves true (approved) or false (denied/timeout).
 * The gateway channel (e.g. Telegram) registers a `ApprovalResponder` to
 * present the question to the user and receive their answer.
 */

const APPROVAL_TIMEOUT_MS = 60_000; // 60 seconds to respond

export type ApprovalRequest = {
  id: string;
  tool: string;
  description: string;
  resolve: (approved: boolean) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

/**
 * In-memory registry of pending approval requests, keyed by request ID.
 * Multiple concurrent sessions are supported (each has its own key).
 */
const pendingApprovals = new Map<string, ApprovalRequest>();

let _nextId = 1;

/**
 * The channel adapter registers a responder function so it can send the
 * approval question to the user.  Only one responder is active at a time
 * (the latest registration wins, matching the single-bot-token model).
 */
let responder: ((req: ApprovalRequest) => void) | null = null;

/**
 * Called by the channel layer (e.g. Telegram adapter) to register the
 * function that will deliver the approval prompt to the user.
 */
export function registerApprovalResponder(fn: (req: ApprovalRequest) => void): void {
  responder = fn;
}

/**
 * Called by tool wrappers before executing a sensitive action.
 *
 * Returns a promise that resolves to `true` if the user approved or `false`
 * if they denied / the timeout fired first.
 *
 * If no responder is registered (e.g. TUI mode without Telegram), it
 * defaults to `true` (auto-approve) so local usage is unaffected.
 */
export function requestApproval(tool: string, description: string): Promise<boolean> {
  if (!responder) {
    // No interactive channel; auto-approve in non-interactive environments.
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const id = String(_nextId++);

    const timeoutHandle = setTimeout(() => {
      pendingApprovals.delete(id);
      resolve(false);
    }, APPROVAL_TIMEOUT_MS);

    const req: ApprovalRequest = { id, tool, description, resolve, timeoutHandle };
    pendingApprovals.set(id, req);
    responder!(req);
  });
}

/**
 * Called by the channel layer when the user taps Approve/Deny.
 * Returns `true` if the request ID was found and handled.
 */
export function resolveApproval(id: string, approved: boolean): boolean {
  const req = pendingApprovals.get(id);
  if (!req) {
    return false;
  }
  clearTimeout(req.timeoutHandle);
  pendingApprovals.delete(id);
  req.resolve(approved);
  return true;
}
