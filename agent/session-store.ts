/**
 * Session persistence and metadata helpers for OpenPaw chat history.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolSet, UIMessage } from "ai";
import { safeValidateUIMessages } from "ai";
import { getSessionsDir } from "../config/paths";
import type { OpenPawSurface, SessionId, SessionMode } from "./types";

const LEGACY_SESSION_FILE_VERSION = 1;
const SESSION_FILE_VERSION = 2;

export type SessionMetadata = {
  title: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  lastUserMessageAt: string | null;
  pinned: boolean;
  surface: OpenPawSurface;
  mode?: SessionMode;
};

export type SessionFileV1 = {
  version: typeof LEGACY_SESSION_FILE_VERSION;
  messages: UIMessage[];
};

export type SessionFileV2 = {
  version: typeof SESSION_FILE_VERSION;
  metadata: SessionMetadata;
  messages: UIMessage[];
};

export type SessionFile = SessionFileV1 | SessionFileV2;

export type SaveSessionOptions = {
  surface?: OpenPawSurface;
  metadataPatch?: Partial<SessionMetadata>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function inferSurfaceFromSessionId(sessionId: SessionId): OpenPawSurface {
  return sessionId.startsWith("telegram:") ? "telegram" : "cli";
}

function firstUserText(messages: UIMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const part = message.parts.find((candidate) => candidate.type === "text");
    if (part && "text" in part) {
      return part.text.trim() || null;
    }
  }
  return null;
}

/**
 * Derives a short session title from the first user message when no explicit title exists.
 */
export function deriveSessionTitle(messages: UIMessage[]): string | null {
  const text = firstUserText(messages);
  if (!text) {
    return null;
  }
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return null;
  }
  return singleLine.length <= 72 ? singleLine : `${singleLine.slice(0, 69)}...`;
}

function normalizeMetadata(
  sessionId: SessionId,
  messages: UIMessage[],
  metadata: Partial<SessionMetadata> | undefined,
  options: SaveSessionOptions | undefined,
): SessionMetadata {
  const currentTime = nowIso();
  const title = metadata?.title ?? deriveSessionTitle(messages);
  const base: SessionMetadata = {
    title: title ?? null,
    summary: metadata?.summary ?? null,
    createdAt: metadata?.createdAt ?? currentTime,
    updatedAt: currentTime,
    lastUserMessageAt: firstUserText(messages)
      ? currentTime
      : (metadata?.lastUserMessageAt ?? null),
    pinned: metadata?.pinned ?? false,
    surface: options?.surface ?? metadata?.surface ?? inferSurfaceFromSessionId(sessionId),
    mode: metadata?.mode ?? options?.metadataPatch?.mode ?? "general",
  };
  return {
    ...base,
    ...metadata,
    ...options?.metadataPatch,
    title: options?.metadataPatch?.title ?? title ?? null,
    updatedAt: currentTime,
  };
}

async function validateSessionMessages(messages: UIMessage[], tools: ToolSet): Promise<UIMessage[] | null> {
  const validated = await safeValidateUIMessages({
    messages,
    tools: tools as never,
  });
  return validated.success ? validated.data : null;
}

function parseSessionFile(raw: string): SessionFile | null {
  const parsed = JSON.parse(raw) as SessionFile | unknown;
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  if (!("messages" in parsed) || !Array.isArray((parsed as SessionFile).messages)) {
    return null;
  }
  const version = (parsed as { version?: unknown }).version;
  if (version === LEGACY_SESSION_FILE_VERSION || version === SESSION_FILE_VERSION) {
    return parsed as SessionFile;
  }
  return null;
}

function toSessionFileV2(
  sessionId: SessionId,
  parsed: SessionFile,
  options?: SaveSessionOptions,
): SessionFileV2 {
  if (parsed.version === SESSION_FILE_VERSION) {
    return {
      version: SESSION_FILE_VERSION,
      metadata: normalizeMetadata(sessionId, parsed.messages, parsed.metadata, options),
      messages: parsed.messages,
    };
  }
  return {
    version: SESSION_FILE_VERSION,
    metadata: normalizeMetadata(sessionId, parsed.messages, undefined, options),
    messages: parsed.messages,
  };
}

/**
 * Reads session metadata directly from a raw JSON file without validating messages.
 */
export function parseSessionMetadataFromContent(
  sessionId: SessionId,
  raw: string,
): SessionMetadata | null {
  try {
    const parsed = parseSessionFile(raw);
    if (!parsed) {
      return null;
    }
    return toSessionFileV2(sessionId, parsed).metadata;
  } catch {
    return null;
  }
}

/**
 * Maps a session id to a single filesystem-safe directory name (no path separators).
 */
export function sessionIdToDirname(sessionId: SessionId): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

/**
 * Legacy flat session file path used before per-session directories.
 */
export function getLegacySessionFilePath(sessionId: SessionId): string {
  return join(getSessionsDir(), `${sessionIdToDirname(sessionId)}.json`);
}

/**
 * Session root directory under `workspace/sessions/<session-id>/`.
 */
export function getSessionDirectoryPath(sessionId: SessionId): string {
  return join(getSessionsDir(), sessionIdToDirname(sessionId));
}

/**
 * Session manifest file path under `workspace/sessions/<session-id>/session.json`.
 */
export function getSessionFilePath(sessionId: SessionId): string {
  return join(getSessionDirectoryPath(sessionId), "session.json");
}

/**
 * Per-session turn records directory under `workspace/sessions/<session-id>/turns/`.
 */
export function getSessionTurnsDir(sessionId: SessionId): string {
  return join(getSessionDirectoryPath(sessionId), "turns");
}

function existingSessionFilePath(sessionId: SessionId): string | null {
  const nextPath = getSessionFilePath(sessionId);
  if (existsSync(nextPath)) {
    return nextPath;
  }
  const legacyPath = getLegacySessionFilePath(sessionId);
  return existsSync(legacyPath) ? legacyPath : null;
}

/**
 * Loads the full validated session file; returns null when missing or invalid.
 */
export async function loadSessionFile(
  sessionId: SessionId,
  tools: ToolSet,
): Promise<SessionFileV2 | null> {
  const path = existingSessionFilePath(sessionId);
  if (!path) {
    return null;
  }
  try {
    const raw = await Bun.file(path).text();
    const parsed = parseSessionFile(raw);
    if (!parsed) {
      return null;
    }
    const messages = await validateSessionMessages(parsed.messages, tools);
    if (!messages) {
      return null;
    }
    return toSessionFileV2(sessionId, { ...parsed, messages });
  } catch {
    return null;
  }
}

/**
 * Loads UI messages for a session; returns empty history if missing or invalid.
 */
export async function loadSessionMessages(
  sessionId: SessionId,
  tools: ToolSet,
): Promise<UIMessage[]> {
  const loaded = await loadSessionFile(sessionId, tools);
  return loaded?.messages ?? [];
}

/**
 * Loads session metadata without revalidating the message list.
 */
export async function loadSessionMetadata(
  sessionId: SessionId,
  tools: ToolSet,
): Promise<SessionMetadata | null> {
  const loaded = await loadSessionFile(sessionId, tools);
  return loaded?.metadata ?? null;
}

/**
 * Persists the full UI message list for a session.
 */
export async function saveSessionMessages(
  sessionId: SessionId,
  messages: UIMessage[],
  options?: SaveSessionOptions,
): Promise<void> {
  const dir = getSessionDirectoryPath(sessionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const existingPath = existingSessionFilePath(sessionId);
  const existingRaw = existingPath
    ? await Bun.file(existingPath).text()
    : null;
  const existing = existingRaw ? parseSessionFile(existingRaw) : null;
  const payload: SessionFileV2 = {
    version: SESSION_FILE_VERSION,
    metadata: normalizeMetadata(
      sessionId,
      messages,
      existing?.version === SESSION_FILE_VERSION ? existing.metadata : undefined,
      options,
    ),
    messages,
  };
  await Bun.write(getSessionFilePath(sessionId), JSON.stringify(payload, null, 2));
}

/**
 * Updates session metadata while preserving the existing messages.
 */
export async function updateSessionMetadata(
  sessionId: SessionId,
  tools: ToolSet,
  patch: Partial<SessionMetadata>,
): Promise<SessionMetadata | null> {
  const current = await loadSessionFile(sessionId, tools);
  if (!current) {
    return null;
  }
  await saveSessionMessages(sessionId, current.messages, {
    surface: current.metadata.surface,
    metadataPatch: patch,
  });
  return loadSessionMetadata(sessionId, tools);
}
