import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolSet, UIMessage } from "ai";
import { safeValidateUIMessages } from "ai";
import { getSessionsDir } from "../config/paths";
import type { SessionId } from "./types";

const SESSION_FILE_VERSION = 1;

export type SessionFileV1 = {
  version: typeof SESSION_FILE_VERSION;
  messages: UIMessage[];
};

/**
 * Maps a session id to a single filesystem-safe filename (no path separators).
 */
export function sessionIdToFilename(sessionId: SessionId): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${safe}.json`;
}

export function getSessionFilePath(sessionId: SessionId): string {
  return join(getSessionsDir(), sessionIdToFilename(sessionId));
}

/**
 * Loads UI messages for a session; returns empty history if missing or invalid.
 */
export async function loadSessionMessages(
  sessionId: SessionId,
  tools: ToolSet,
): Promise<UIMessage[]> {
  const path = getSessionFilePath(sessionId);
  if (!existsSync(path)) {
    return [];
  }
  try {
    const raw = await Bun.file(path).text();
    const parsed = JSON.parse(raw) as SessionFileV1 | unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("messages" in parsed) ||
      !Array.isArray((parsed as SessionFileV1).messages)
    ) {
      return [];
    }
    const messages = (parsed as SessionFileV1).messages as UIMessage[];
    const validated = await safeValidateUIMessages({
      messages,
      tools: tools as never,
    });
    if (!validated.success) {
      return [];
    }
    return validated.data;
  } catch {
    return [];
  }
}

/**
 * Persists the full UI message list for a session.
 */
export async function saveSessionMessages(
  sessionId: SessionId,
  messages: UIMessage[],
): Promise<void> {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const payload: SessionFileV1 = {
    version: SESSION_FILE_VERSION,
    messages,
  };
  await Bun.write(getSessionFilePath(sessionId), JSON.stringify(payload, null, 2));
}
