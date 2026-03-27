import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../config/paths";
import type { SessionId } from "../../agent/types";
import { TUI_ACTIVE_THREAD_FILENAME } from "./constants";

const LEGACY_TUI_SESSION: SessionId = "tui:main";

type TuiActiveThreadState = {
  /** When set, active session is `tui:main:${threadUuid}`; otherwise legacy `tui:main`. */
  threadUuid?: string;
  /** Explicit non-TUI session id (for example `telegram:<chatId>[:threadUuid]`). */
  sessionId?: SessionId;
};

function activeThreadPath(): string {
  return join(getSessionsDir(), TUI_ACTIVE_THREAD_FILENAME);
}

async function readState(): Promise<TuiActiveThreadState> {
  const path = activeThreadPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = await Bun.file(path).text();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const sessionId = (parsed as TuiActiveThreadState).sessionId;
    if (typeof sessionId === "string" && sessionId.length > 0) {
      return { sessionId };
    }
    const threadUuid = (parsed as TuiActiveThreadState).threadUuid;
    if (typeof threadUuid === "string" && threadUuid.length > 0) {
      return { threadUuid };
    }
    return {};
  } catch {
    return {};
  }
}

async function writeState(state: TuiActiveThreadState): Promise<void> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const payload =
    state.sessionId && state.sessionId.length > 0
      ? { sessionId: state.sessionId }
      : state.threadUuid && state.threadUuid.length > 0
        ? { threadUuid: state.threadUuid }
        : {};
  await Bun.write(activeThreadPath(), JSON.stringify(payload, null, 2));
}

/**
 * OpenPaw persistence session id for the TUI (legacy `tui:main` or threaded `tui:main:uuid`).
 */
export async function getTuiPersistenceSessionId(): Promise<SessionId> {
  const state = await readState();
  if (state.sessionId) {
    return state.sessionId;
  }
  if (state.threadUuid) {
    return `tui:main:${state.threadUuid}`;
  }
  return LEGACY_TUI_SESSION;
}

/**
 * Starts a new TUI thread: new uuid in the active store. Returns the new persistence session id.
 */
export async function startNewTuiThread(): Promise<SessionId> {
  const uuid = crypto.randomUUID();
  await writeState({ threadUuid: uuid });
  return `tui:main:${uuid}`;
}

/**
 * Points the TUI at an existing persistence session (legacy or thread file).
 */
export async function setActiveTuiSession(persistenceSessionId: SessionId): Promise<void> {
  if (persistenceSessionId === LEGACY_TUI_SESSION) {
    await writeState({});
    return;
  }
  if (!persistenceSessionId.trim()) {
    throw new Error("Invalid session id");
  }
  const prefix = `${LEGACY_TUI_SESSION}:`;
  if (persistenceSessionId.startsWith(prefix)) {
    const uuid = persistenceSessionId.slice(prefix.length);
    if (!uuid) {
      throw new Error("Invalid thread id");
    }
    await writeState({ threadUuid: uuid });
    return;
  }
  await writeState({ sessionId: persistenceSessionId });
}
