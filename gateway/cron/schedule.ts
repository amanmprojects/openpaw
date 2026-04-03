/**
 * Parses `--at` values and computes next run times for cron expressions via croner.
 */
import { Cron } from "croner";
import type { CronJob, CronSchedule } from "./types";

const RELATIVE_AT = /^(\d+)\s*(ms|s|m|h|d)$/i;

/**
 * Parses a relative delay like `20m`, `2h`, `30s`, `1d` into a future Date from `from`.
 */
export function parseRelativeAt(input: string, from: Date): Date | null {
  const trimmed = input.trim();
  const m = RELATIVE_AT.exec(trimmed);
  if (!m || m[1] === undefined || m[2] === undefined) {
    return null;
  }
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  const unit = m[2].toLowerCase();
  const ms =
    unit === "ms"
      ? n
      : unit === "s"
        ? n * 1000
        : unit === "m"
          ? n * 60_000
          : unit === "h"
            ? n * 3_600_000
            : n * 86_400_000;
  return new Date(from.getTime() + ms);
}

/**
 * Resolves a one-shot schedule string: ISO 8601, or a relative delay (`20m`, `2h`, ...).
 */
export function parseAtInstant(input: string, from: Date): Date {
  const relative = parseRelativeAt(input, from);
  if (relative) {
    return relative;
  }
  const iso = input.trim();
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Invalid --at value "${input}". Use ISO 8601 (e.g. 2026-04-04T09:00:00) or relative like 20m, 2h, 1d.`,
    );
  }
  return new Date(parsed);
}

/**
 * Returns the next cron occurrence strictly after `reference`, or null if the expression is invalid.
 */
export function nextCronFireAfter(
  expr: string,
  timezone: string | undefined,
  reference: Date,
): Date | null {
  try {
    const opts = timezone ? { timezone } : {};
    const cron = new Cron(expr, opts);
    const next = cron.nextRun(reference);
    return next;
  } catch {
    return null;
  }
}

/**
 * Computes the initial `nextRunAt` ISO string when creating or updating a job.
 */
export function computeInitialNextRunIso(schedule: CronSchedule, from: Date): string | null {
  if (schedule.kind === "at") {
    const when = parseAtInstant(schedule.at, from);
    return when.toISOString();
  }
  const next = nextCronFireAfter(schedule.expr, schedule.timezone, from);
  return next ? next.toISOString() : null;
}

/**
 * After a recurring cron job runs at `completedAt`, returns the following fire time.
 */
export function nextCronRunAfterCompletion(
  schedule: Extract<CronSchedule, { kind: "cron" }>,
  completedAt: Date,
): Date | null {
  const millis = completedAt.getTime();
  const ref = new Date(millis + 1000);
  return nextCronFireAfter(schedule.expr, schedule.timezone, ref);
}

/**
 * Returns true when `nextRunAt` is due (inclusive) relative to `now`.
 */
export function isDue(nextRunAtIso: string | null, now: Date): boolean {
  if (nextRunAtIso === null) {
    return false;
  }
  const t = Date.parse(nextRunAtIso);
  if (Number.isNaN(t)) {
    return false;
  }
  return t <= now.getTime();
}

/**
 * Sort key for stable due ordering (earliest first).
 */
export function compareDueJobs(a: CronJob, b: CronJob): number {
  const ta = a.nextRunAt ? Date.parse(a.nextRunAt) : Infinity;
  const tb = b.nextRunAt ? Date.parse(b.nextRunAt) : Infinity;
  if (ta !== tb) {
    return ta - tb;
  }
  return a.id.localeCompare(b.id);
}
