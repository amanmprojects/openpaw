/**
 * Periodic gateway tick that executes due cron jobs via the shared per-chat Telegram queue.
 */
import type { Bot } from "grammy";
import { logInfo } from "../../lib/log";
import type { OpenPawGatewayContext } from "../bootstrap";
import { createTelegramMessageQueue } from "../telegram/message-queue";
import { executeCronJob } from "./executor";
import { getCronJob, loadCronJobsFile } from "./job-store";
import { compareDueJobs, isDue } from "./schedule";

let inFlight = 0;

/**
 * Starts a timer-driven cron loop when enabled (default) and `OPENPAW_SKIP_CRON` is unset.
 */
export function startCronSchedulerIfEnabled(
  ctx: OpenPawGatewayContext,
  bot: Bot,
  runSerialized: ReturnType<typeof createTelegramMessageQueue>,
): void {
  if (process.env.OPENPAW_SKIP_CRON === "1") {
    logInfo("cron.skipped", { reason: "OPENPAW_SKIP_CRON" });
    return;
  }

  const cronCfg = ctx.config.cron;
  if (cronCfg?.enabled === false) {
    logInfo("cron.skipped", { reason: "config.cron.enabled_false" });
    return;
  }

  const tickSec = cronCfg?.tickSeconds ?? 60;
  const tickMs = Math.min(Math.max(tickSec, 15), 3600) * 1000;
  const maxConcurrent = Math.min(Math.max(cronCfg?.maxConcurrentRuns ?? 2, 1), 32);
  const maxRunLogLines = cronCfg?.maxRunLogLines ?? 5000;

  logInfo("cron.scheduler_started", { tickMs, maxConcurrent });

  const tick = (): void => {
    const now = new Date();
    const file = loadCronJobsFile();
    const due = file.jobs
      .filter((j) => j.enabled && j.target.kind === "telegram" && isDue(j.nextRunAt, now))
      .sort(compareDueJobs);

    for (const job of due) {
      if (inFlight >= maxConcurrent) {
        break;
      }
      inFlight++;
      const key = `telegram:${job.target.chatId}`;
      void runSerialized(key, async () => {
        try {
          const fresh = getCronJob(job.id);
          const n = new Date();
          if (!fresh || !fresh.enabled || !isDue(fresh.nextRunAt, n)) {
            return;
          }
          await executeCronJob(ctx, bot, fresh, { maxRunLogLines });
        } finally {
          inFlight--;
        }
      }).catch(() => {
        inFlight--;
      });
    }
  };

  setInterval(tick, tickMs);
  tick();
}
