/**
 * Tests for gateway cron scheduling, job persistence, and session resolution.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCronJobsPath, getSessionsDir } from "../config/paths";
import {
  computeInitialNextRunIso,
  computeUpdatedJobAfterRun,
  loadCronJobsFile,
  nextCronFireAfter,
  nextCronRunAfterCompletion,
  parseAtInstant,
  parseCronRunRecord,
  parseRelativeAt,
  resolveCronPersistenceSessionId,
  saveCronJobsFile,
  isDue,
} from "../gateway/cron";
import type { CronJob } from "../gateway/cron/types";
import { TELEGRAM_ACTIVE_THREADS_FILENAME } from "../gateway/telegram/constants";
import { withTempOpenPawHome } from "./helpers";

describe("cron schedule parsing", () => {
  test("parseRelativeAt minutes and hours", () => {
    const from = new Date("2026-04-03T12:00:00.000Z");
    const m = parseRelativeAt("20m", from);
    expect(m?.toISOString()).toBe("2026-04-03T12:20:00.000Z");
    const h = parseRelativeAt("2h", from);
    expect(h?.toISOString()).toBe("2026-04-03T14:00:00.000Z");
  });

  test("parseAtInstant accepts ISO", () => {
    const from = new Date();
    const d = parseAtInstant("2027-01-15T09:30:00.000Z", from);
    expect(d.toISOString()).toBe("2027-01-15T09:30:00.000Z");
  });

  test("parseAtInstant combines with relative", () => {
    const from = new Date("2026-04-03T10:00:00.000Z");
    const d = parseAtInstant("30s", from);
    expect(d.toISOString()).toBe("2026-04-03T10:00:30.000Z");
  });

  test("nextCronFireAfter returns upcoming minute", () => {
    const ref = new Date("2026-04-03T12:34:56.000Z");
    const next = nextCronFireAfter("* * * * *", undefined, ref);
    expect(next).not.toBeNull();
    expect(next!.getUTCMinutes()).toBe(35);
  });

  test("nextCronRunAfterCompletion steps forward", () => {
    const done = new Date("2026-04-03T08:00:00.000Z");
    const schedule = { kind: "cron" as const, expr: "0 8 * * *" };
    const next = nextCronRunAfterCompletion(schedule, done);
    expect(next).not.toBeNull();
    expect(next!.getUTCDate()).toBe(4);
  });

  test("computeInitialNextRunIso for cron", () => {
    const from = new Date("2026-04-03T10:00:00.000Z");
    const iso = computeInitialNextRunIso({ kind: "cron", expr: "0 7 * * *" }, from);
    expect(iso).not.toBeNull();
    expect(iso!.startsWith("2026-04-")).toBe(true);
  });

  test("isDue respects nextRunAt", () => {
    const now = new Date("2026-04-03T12:00:00.000Z");
    expect(isDue("2026-04-03T11:59:00.000Z", now)).toBe(true);
    expect(isDue("2026-04-03T12:01:00.000Z", now)).toBe(false);
    expect(isDue(null, now)).toBe(false);
  });

  test("parseCronRunRecord rejects invalid shapes", () => {
    expect(parseCronRunRecord({})).toBeNull();
    expect(
      parseCronRunRecord({
        runId: "550e8400-e29b-41d4-a716-446655440000",
        jobId: "550e8400-e29b-41d4-a716-446655440001",
        startedAt: "a",
        finishedAt: "b",
        status: "ok",
      }),
    ).not.toBeNull();
  });

  test("computeUpdatedJobAfterRun removes one-shot on success when configured", () => {
    const job: CronJob = {
      id: "550e8400-e29b-41d4-a716-446655440010",
      enabled: true,
      schedule: { kind: "at", at: "2026-04-04T09:00:00.000Z" },
      payload: "x",
      target: { kind: "telegram", chatId: 1 },
      sessionMode: "main",
      deleteAfterSuccess: true,
      nextRunAt: "2026-04-04T09:00:00.000Z",
      lastRunAt: null,
      createdAt: "2026-04-03T00:00:00.000Z",
    };
    expect(computeUpdatedJobAfterRun(job, "2026-04-04T09:01:00.000Z", "ok")).toBeNull();
    expect(
      computeUpdatedJobAfterRun(
        { ...job, deleteAfterSuccess: false },
        "2026-04-04T09:01:00.000Z",
        "ok",
      )?.enabled,
    ).toBe(false);
  });
});

describe("cron job store", () => {
  test("round-trip jobs.json", () => {
    const tmp = withTempOpenPawHome();
    try {
      const job: CronJob = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        enabled: true,
        schedule: { kind: "at", at: "2026-04-04T09:00:00.000Z" },
        payload: "hello",
        target: { kind: "telegram", chatId: -100123 },
        sessionMode: "main",
        deleteAfterSuccess: true,
        nextRunAt: "2026-04-04T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
        label: "test",
      };
      saveCronJobsFile({ version: 1, jobs: [job] });
      const path = getCronJobsPath();
      expect(path.startsWith(tmp.home)).toBe(true);
      const loaded = loadCronJobsFile();
      expect(loaded.jobs).toHaveLength(1);
      expect(loaded.jobs[0]!.payload).toBe("hello");
    } finally {
      tmp.dispose();
    }
  });
});

describe("cron session resolution", () => {
  test("main uses legacy id when no active thread", async () => {
    const tmp = withTempOpenPawHome();
    try {
      mkdirSync(getSessionsDir(), { recursive: true });
      const job: CronJob = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        enabled: true,
        schedule: { kind: "at", at: "2026-04-04T09:00:00.000Z" },
        payload: "x",
        target: { kind: "telegram", chatId: 42 },
        sessionMode: "main",
        deleteAfterSuccess: true,
        nextRunAt: "2026-04-04T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      };
      const sid = await resolveCronPersistenceSessionId(job);
      expect(sid).toBe("telegram:42");
    } finally {
      tmp.dispose();
    }
  });

  test("main uses threaded id from store", async () => {
    const tmp = withTempOpenPawHome();
    try {
      const sessions = getSessionsDir();
      mkdirSync(sessions, { recursive: true });
      const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      writeFileSync(
        join(sessions, TELEGRAM_ACTIVE_THREADS_FILENAME),
        JSON.stringify({ "99": uuid }),
        "utf8",
      );
      const job: CronJob = {
        id: "550e8400-e29b-41d4-a716-446655440002",
        enabled: true,
        schedule: { kind: "at", at: "2026-04-04T09:00:00.000Z" },
        payload: "x",
        target: { kind: "telegram", chatId: 99 },
        sessionMode: "main",
        deleteAfterSuccess: true,
        nextRunAt: "2026-04-04T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      };
      const sid = await resolveCronPersistenceSessionId(job);
      expect(sid).toBe(`telegram:99:${uuid}`);
    } finally {
      tmp.dispose();
    }
  });

  test("isolated uses cron-prefixed thread id", async () => {
    const tmp = withTempOpenPawHome();
    try {
      mkdirSync(getSessionsDir(), { recursive: true });
      const jid = "650e8400-e29b-41d4-a716-446655440099";
      const job: CronJob = {
        id: jid,
        enabled: true,
        schedule: { kind: "cron", expr: "0 8 * * *" },
        payload: "x",
        target: { kind: "telegram", chatId: 7 },
        sessionMode: "isolated",
        deleteAfterSuccess: false,
        nextRunAt: "2026-04-04T08:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      };
      const sid = await resolveCronPersistenceSessionId(job);
      expect(sid).toBe(`telegram:7:cron-${jid}`);
    } finally {
      tmp.dispose();
    }
  });
});
