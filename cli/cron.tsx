/**
 * CLI for managing cron jobs under `~/.openpaw/cron` (manifest and run logs).
 */
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { Bot } from "grammy";
import { createGatewayContext } from "../gateway/bootstrap";
import {
  computeInitialNextRunIso,
  type CronJob,
  deleteCronJob,
  executeCronJob,
  getCronJob,
  listCronJobs,
  mutateCronJobs,
  parseAtInstant,
  readCronRunRecords,
  upsertCronJob,
} from "../gateway/cron";
import { ensureWorkspaceLayout } from "../agent/workspace-bootstrap";

function requireTelegramChatId(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid Telegram chat id: ${raw}`);
  }
  return n;
}

export function registerCronCommands(program: Command): void {
  const cron = program.command("cron").description("Gateway cron jobs (requires a running openpaw gateway for schedules to fire)");

  cron
    .command("add")
    .description("Add a cron job")
    .option("--at <instant>", "One-shot: ISO 8601 or relative (e.g. 20m, 2h)")
    .option("--cron <expr>", "Recurring cron expression (e.g. 0 7 * * 1-5)")
    .option("--timezone <iana>", "IANA timezone for recurring cron (optional)")
    .requiredOption("--telegram-chat <id>", "Numeric Telegram chat id")
    .requiredOption("--payload <text>", "Message / instruction for the agent")
    .option("--session <mode>", "main | isolated", "main")
    .option(
      "--keep-after-run",
      "For one-shot jobs, keep the job row after a successful run (default removes after success)",
    )
    .option("--label <text>", "Optional label")
    .action(
      async (opts: {
        at?: string;
        cron?: string;
        timezone?: string;
        telegramChat: string;
        payload: string;
        session?: string;
        keepAfterRun?: boolean;
        label?: string;
      }) => {
        try {
          ensureWorkspaceLayout();
          const at = opts.at?.trim();
          const expr = opts.cron?.trim();
          if (Boolean(at) === Boolean(expr)) {
            throw new Error("Exactly one of --at or --cron is required.");
          }
          const now = new Date();
          const schedule = at
            ? ({ kind: "at" as const, at: parseAtInstant(at, now).toISOString() } )
            : ({ kind: "cron" as const, expr: expr!, timezone: opts.timezone?.trim() || undefined });

          const nextRunAt = computeInitialNextRunIso(schedule, now);
          if (!nextRunAt) {
            throw new Error("Could not compute next run time. Check your cron expression and timezone.");
          }

          const sessionRaw = (opts.session ?? "main").trim().toLowerCase();
          if (sessionRaw !== "main" && sessionRaw !== "isolated") {
            throw new Error('--session must be "main" or "isolated"');
          }

          const job: CronJob = {
            id: randomUUID(),
            enabled: true,
            schedule,
            payload: opts.payload,
            target: { kind: "telegram", chatId: requireTelegramChatId(opts.telegramChat) },
            sessionMode: sessionRaw === "isolated" ? "isolated" : "main",
            deleteAfterSuccess: schedule.kind === "at" ? !opts.keepAfterRun : false,
            nextRunAt,
            lastRunAt: null,
            createdAt: now.toISOString(),
            label: opts.label?.trim() || null,
          };

          upsertCronJob(job);
          console.log(`Added cron job ${job.id} (next run ${job.nextRunAt}).`);
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exitCode = 1;
        }
      },
    );

  cron
    .command("list")
    .description("List all cron jobs")
    .option("--json", "Print JSON")
    .action((opts: { json?: boolean }) => {
      try {
        ensureWorkspaceLayout();
        const jobs = listCronJobs().sort((a, b) => (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""));
        if (opts.json) {
          console.log(JSON.stringify(jobs, null, 2));
          return;
        }
        if (jobs.length === 0) {
          console.log("No cron jobs.");
          return;
        }
        for (const j of jobs) {
          const label = j.label ? ` ${j.label}` : "";
          const next = j.nextRunAt ?? "(none)";
          console.log(`${j.id}${label} enabled=${j.enabled} next=${next} ${JSON.stringify(j.schedule)}`);
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
    });

  cron
    .command("rm")
    .description("Remove a cron job")
    .argument("<jobId>", "Job id (uuid)")
    .action((jobId: string) => {
      try {
        ensureWorkspaceLayout();
        const removed = deleteCronJob(jobId.trim());
        console.log(removed ? `Removed ${jobId}.` : `No job with id ${jobId}.`);
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
    });

  cron
    .command("enable")
    .description("Enable a cron job")
    .argument("<jobId>", "Job id")
    .action((jobId: string) => {
      try {
        ensureWorkspaceLayout();
        const id = jobId.trim();
        mutateCronJobs((file) => {
          let found = false;
          const now = new Date();
          const jobs = file.jobs.map((j) => {
            if (j.id !== id) {
              return j;
            }
            found = true;
            const next = j.nextRunAt ?? computeInitialNextRunIso(j.schedule, now);
            if (!next) {
              throw new Error("Cannot enable job: invalid or exhausted schedule.");
            }
            return { ...j, enabled: true, nextRunAt: next };
          });
          if (!found) {
            throw new Error(`No job with id ${id}`);
          }
          return { result: undefined, next: { version: 1, jobs } };
        });
        console.log(`Enabled ${id}.`);
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
    });

  cron
    .command("disable")
    .description("Disable a cron job")
    .argument("<jobId>", "Job id")
    .action((jobId: string) => {
      try {
        ensureWorkspaceLayout();
        const id = jobId.trim();
        mutateCronJobs((file) => {
          let found = false;
          const jobs = file.jobs.map((j) => {
            if (j.id !== id) {
              return j;
            }
            found = true;
            return { ...j, enabled: false };
          });
          if (!found) {
            throw new Error(`No job with id ${id}`);
          }
          return { result: undefined, next: { version: 1, jobs } };
        });
        console.log(`Disabled ${id}.`);
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
    });

  cron
    .command("run")
    .description("Run a job now (loads config and Telegram; does not require the gateway daemon)")
    .argument("<jobId>", "Job id")
    .action(async (jobId: string) => {
      try {
        ensureWorkspaceLayout();
        const id = jobId.trim();
        const job = getCronJob(id);
        if (!job) {
          throw new Error(`No job with id ${id}`);
        }
        const ctx = await createGatewayContext();
        const token = ctx.config.channels?.telegram?.botToken;
        if (!token) {
          throw new Error("Telegram bot token missing from config; cannot push replies to chat.");
        }
        const bot = new Bot(token);
        const result = await executeCronJob(ctx, bot, job);
        if (!result.ok) {
          console.error(result.error ?? "failed");
          process.exitCode = 1;
          return;
        }
        console.log("Run completed ok.");
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
    });

  cron
    .command("logs")
    .description("Show recent run log lines for a job")
    .argument("<jobId>", "Job id")
    .option("-n, --lines <count>", "Max lines", "30")
    .action((jobId: string, opts: { lines?: string }) => {
      try {
        ensureWorkspaceLayout();
        const parsed = Number.parseInt(opts.lines ?? "30", 10);
        const n = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
        const rows = readCronRunRecords(jobId.trim(), n);
        if (rows.length === 0) {
          console.log("No log entries.");
          return;
        }
        for (const r of rows) {
          console.log(JSON.stringify(r));
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
    });
}
