/**
 * Runs one cron job: resolves session, calls the agent runtime, delivers to Telegram, persists run logs.
 */
import { randomUUID } from "node:crypto";
import type { Bot } from "grammy";
import { logError, logInfo } from "../../lib/log";
import type { OpenPawGatewayContext } from "../bootstrap";
import { deliverCronTurnToTelegram } from "../telegram/outbound-cron-reply";
import { getTelegramChatPreferences } from "../telegram/chat-preferences";
import { appendCronRunRecord, mutateCronJobs } from "./job-store";
import { nextCronRunAfterCompletion } from "./schedule";
import type { CronJob } from "./types";
import { resolveCronPersistenceSessionId } from "./session-resolve";

const DEFAULT_MAX_LOG_LINES = 5000;

/**
 * Prefixes cron payloads so the model treats them as scheduled injections.
 */
export function formatCronUserPayload(payload: string): string {
  const trimmed = payload.trim();
  if (trimmed.startsWith("[Cron]")) {
    return trimmed;
  }
  return `[Cron] ${trimmed}`;
}

function isTransientFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("socket") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("529") ||
    lower.includes("overload") ||
    lower.includes("temporar")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type CronExecutionResult = {
  ok: boolean;
  error?: string;
  summary?: string;
};

/**
 * Executes a single job (including transient retries) and updates `jobs.json` + run log.
 */
export async function executeCronJob(
  ctx: OpenPawGatewayContext,
  bot: Bot,
  job: CronJob,
  options?: { maxRunLogLines?: number },
): Promise<CronExecutionResult> {
  const maxRunLogLines = options?.maxRunLogLines ?? DEFAULT_MAX_LOG_LINES;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  if (job.target.kind !== "telegram") {
    return { ok: false, error: "Only telegram targets are supported" };
  }

  const chatId = job.target.chatId;
  const sessionId = await resolveCronPersistenceSessionId(job);
  const prefs = await getTelegramChatPreferences(chatId);
  const userText = formatCronUserPayload(job.payload);

  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = 2000 * 2 ** (attempt - 1);
        await sleep(backoff);
      }

      const { text } = await deliverCronTurnToTelegram(bot, chatId, prefs, (hooks) =>
        ctx.runtime.runTurn({
          sessionId,
          userText,
          surface: "telegram",
          sandboxRestricted: prefs.sandboxRestricted,
          safetyMode: prefs.safetyMode,
          onTextDelta: hooks.onTextDelta,
          onReasoningDelta: hooks.onReasoningDelta,
          onToolStatus: hooks.onToolStatus,
        }),
      );

      const finishedAt = new Date().toISOString();
      const summary = text.trim().slice(0, 500) || "(empty reply)";
      appendCronRunRecord(
        job.id,
        { runId, jobId: job.id, startedAt, finishedAt, status: "ok", summary },
        maxRunLogLines,
      );

      mutateCronJobs((file) => {
        const jobs = file.jobs.filter((j) => j.id !== job.id);
        const prev = file.jobs.find((j) => j.id === job.id);
        if (!prev) {
          return { result: undefined, next: file };
        }

        if (prev.schedule.kind === "at") {
          if (prev.deleteAfterSuccess) {
            return {
              result: undefined,
              next: { version: 1, jobs },
            };
          }
          const updated: CronJob = {
            ...prev,
            lastRunAt: finishedAt,
            nextRunAt: null,
            enabled: false,
          };
          return { result: undefined, next: { version: 1, jobs: [...jobs, updated] } };
        }

        const nextFire = nextCronRunAfterCompletion(prev.schedule, new Date(finishedAt));
        const updated: CronJob = {
          ...prev,
          lastRunAt: finishedAt,
          nextRunAt: nextFire ? nextFire.toISOString() : null,
          enabled: nextFire ? prev.enabled : false,
        };
        return { result: undefined, next: { version: 1, jobs: [...jobs, updated] } };
      });

      logInfo("cron.job.ok", { jobId: job.id, chatId, sessionId });
      return { ok: true, summary };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (!isTransientFailure(err) || attempt === 2) {
        break;
      }
      logInfo("cron.job.retry", { jobId: job.id, attempt: attempt + 1, error: lastErr });
    }
  }

  const finishedAt = new Date().toISOString();
  const err = lastErr ?? "Unknown error";
  appendCronRunRecord(
    job.id,
    { runId, jobId: job.id, startedAt, finishedAt, status: "error", error: err },
    maxRunLogLines,
  );

  mutateCronJobs((file) => {
    const nextJobs = file.jobs.map((j) => {
      if (j.id !== job.id) {
        return j;
      }
      if (j.schedule.kind === "at") {
        return {
          ...j,
          lastRunAt: finishedAt,
          nextRunAt: null,
          enabled: false,
        };
      }
      const nextFire = nextCronRunAfterCompletion(j.schedule, new Date(finishedAt));
      return {
        ...j,
        lastRunAt: finishedAt,
        nextRunAt: nextFire ? nextFire.toISOString() : null,
        enabled: nextFire ? j.enabled : false,
      };
    });
    return { result: undefined, next: { version: 1, jobs: nextJobs } };
  });

  logError("cron.job.failed", { jobId: job.id, chatId, error: err });
  return { ok: false, error: err };
}
