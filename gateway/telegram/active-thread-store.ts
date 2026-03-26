import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../config/paths";
import { TELEGRAM_ACTIVE_THREADS_FILENAME } from "./constants";

type ActiveThreadsState = Record<string, string>;

function activeThreadsPath(): string {
  return join(getSessionsDir(), TELEGRAM_ACTIVE_THREADS_FILENAME);
}

async function readActiveThreads(): Promise<ActiveThreadsState> {
  const path = activeThreadsPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = await Bun.file(path).text();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const out: ActiveThreadsState = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.length > 0) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeActiveThreads(state: ActiveThreadsState): Promise<void> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await Bun.write(activeThreadsPath(), JSON.stringify(state, null, 2));
}

/**
 * OpenPaw persistence session id for this Telegram chat (legacy or threaded).
 */
export async function getTelegramPersistenceSessionId(chatId: number): Promise<string> {
  const state = await readActiveThreads();
  const uuid = state[String(chatId)];
  if (uuid) {
    return `telegram:${chatId}:${uuid}`;
  }
  return `telegram:${chatId}`;
}

/**
 * Starts a new thread: new uuid in the active map. Returns the new persistence session id.
 */
export async function startNewTelegramThread(chatId: number): Promise<string> {
  const uuid = crypto.randomUUID();
  const state = await readActiveThreads();
  state[String(chatId)] = uuid;
  await writeActiveThreads(state);
  return `telegram:${chatId}:${uuid}`;
}

/**
 * Points the chat at an existing persistence session (legacy or thread file).
 */
export async function setActiveTelegramSession(
  chatId: number,
  persistenceSessionId: string,
): Promise<void> {
  const legacy = `telegram:${chatId}`;
  const state = await readActiveThreads();
  if (persistenceSessionId === legacy) {
    delete state[String(chatId)];
  } else {
    const prefix = `${legacy}:`;
    if (!persistenceSessionId.startsWith(prefix)) {
      throw new Error("Session does not belong to this chat");
    }
    const uuid = persistenceSessionId.slice(prefix.length);
    if (!uuid) {
      throw new Error("Invalid thread id");
    }
    state[String(chatId)] = uuid;
  }
  await writeActiveThreads(state);
}
