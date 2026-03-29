/**
 * Per-session turn record persistence for OpenPaw observability.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionTurnsDir } from "./session-store";
import type { OpenPawSurface } from "./types";

export type TurnRecord = {
  sessionId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  surface: OpenPawSurface;
  toolCalls: Array<{ toolName: string; status: "ok" | "error" | "denied" }>;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

/**
 * Persists one turn record under `workspace/sessions/<session-id>/turns`.
 */
export async function saveTurnRecord(record: TurnRecord): Promise<string> {
  const dir = getSessionTurnsDir(record.sessionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filename = `${record.completedAt.replace(/[:.]/g, "-")}-${record.sessionId.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`;
  const path = join(dir, filename);
  await Bun.write(path, JSON.stringify(record, null, 2));
  return path;
}
