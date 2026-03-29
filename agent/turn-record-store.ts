import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getTurnsDir } from "../config/paths";
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
 * Persists one turn record under `workspace/turns`.
 */
export async function saveTurnRecord(record: TurnRecord): Promise<string> {
  const dir = getTurnsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filename = `${record.completedAt.replace(/[:.]/g, "-")}-${record.sessionId.replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`;
  const path = join(dir, filename);
  await Bun.write(path, JSON.stringify(record, null, 2));
  return path;
}
