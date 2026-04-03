/**
 * Maps a cron job target + session mode to an OpenPaw persistence session id.
 */
import { getTelegramPersistenceSessionId } from "../telegram/active-thread-store";
import type { CronJob } from "./types";

/**
 * Resolves the session file id used for this job run (main thread vs isolated cron thread).
 */
export async function resolveCronPersistenceSessionId(job: CronJob): Promise<string> {
  if (job.target.kind !== "telegram") {
    throw new Error(`Unsupported cron target kind: ${(job.target as { kind: string }).kind}`);
  }
  if (job.sessionMode === "main") {
    return getTelegramPersistenceSessionId(job.target.chatId);
  }
  return `telegram:${job.target.chatId}:cron-${job.id}`;
}
