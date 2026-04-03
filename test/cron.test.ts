/**
 * Tests for gateway cron scheduling, job persistence, and session resolution.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCronDir, getCronJobsPath, getCronRunsDir, ensureCronDirectories, getSessionsDir } from "../config/paths";
import {
  compareDueJobs,
  computeInitialNextRunIso,
  deleteCronJob,
  formatCronUserPayload,
  getCronJob,
  isDue,
  listCronJobs,
  loadCronJobsFile,
  mutateCronJobs,
  nextCronFireAfter,
  nextCronRunAfterCompletion,
  appendCronRunRecord,
  readCronRunRecords,
  parseAtInstant,
  parseRelativeAt,
  resolveCronPersistenceSessionId,
  saveCronJobsFile,
  upsertCronJob,
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

  test("parseRelativeAt seconds", () => {
    const from = new Date("2026-04-03T12:00:00.000Z");
    const s = parseRelativeAt("45s", from);
    expect(s?.toISOString()).toBe("2026-04-03T12:00:45.000Z");
  });

  test("parseRelativeAt days", () => {
    const from = new Date("2026-04-03T12:00:00.000Z");
    const d = parseRelativeAt("1d", from);
    expect(d?.toISOString()).toBe("2026-04-04T12:00:00.000Z");
  });

  test("parseRelativeAt milliseconds", () => {
    const from = new Date("2026-04-03T12:00:00.000Z");
    const ms = parseRelativeAt("500ms", from);
    expect(ms?.getTime()).toBe(from.getTime() + 500);
  });

  test("parseRelativeAt is case-insensitive", () => {
    const from = new Date("2026-04-03T12:00:00.000Z");
    expect(parseRelativeAt("10M", from)?.toISOString()).toBe("2026-04-03T12:10:00.000Z");
    expect(parseRelativeAt("1H", from)?.toISOString()).toBe("2026-04-03T13:00:00.000Z");
    expect(parseRelativeAt("1D", from)?.toISOString()).toBe("2026-04-04T12:00:00.000Z");
  });

  test("parseRelativeAt returns null for invalid input", () => {
    const from = new Date();
    expect(parseRelativeAt("", from)).toBeNull();
    expect(parseRelativeAt("abc", from)).toBeNull();
    expect(parseRelativeAt("10x", from)).toBeNull();
    expect(parseRelativeAt("hello world", from)).toBeNull();
  });

  test("parseRelativeAt handles zero", () => {
    const from = new Date("2026-04-03T12:00:00.000Z");
    const result = parseRelativeAt("0m", from);
    expect(result?.toISOString()).toBe("2026-04-03T12:00:00.000Z");
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

  test("parseAtInstant throws on invalid input", () => {
    const from = new Date();
    expect(() => parseAtInstant("not-a-date", from)).toThrow();
    expect(() => parseAtInstant("", from)).toThrow();
  });

  test("nextCronFireAfter returns upcoming minute", () => {
    const ref = new Date("2026-04-03T12:34:56.000Z");
    const next = nextCronFireAfter("* * * * *", undefined, ref);
    expect(next).not.toBeNull();
    expect(next!.getUTCMinutes()).toBe(35);
  });

  test("nextCronFireAfter returns null for invalid expression", () => {
    const ref = new Date("2026-04-03T12:00:00.000Z");
    const result = nextCronFireAfter("not a cron expression at all !!!", undefined, ref);
    expect(result).toBeNull();
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

  test("computeInitialNextRunIso for at schedule returns ISO", () => {
    const from = new Date("2026-04-03T10:00:00.000Z");
    const iso = computeInitialNextRunIso({ kind: "at", at: "2026-05-01T08:00:00.000Z" }, from);
    expect(iso).toBe("2026-05-01T08:00:00.000Z");
  });

  test("computeInitialNextRunIso returns null for invalid cron expr", () => {
    const from = new Date("2026-04-03T10:00:00.000Z");
    const iso = computeInitialNextRunIso({ kind: "cron", expr: "not-valid-cron-expr!!!" }, from);
    expect(iso).toBeNull();
  });

  test("isDue respects nextRunAt", () => {
    const now = new Date("2026-04-03T12:00:00.000Z");
    expect(isDue("2026-04-03T11:59:00.000Z", now)).toBe(true);
    expect(isDue("2026-04-03T12:01:00.000Z", now)).toBe(false);
    expect(isDue(null, now)).toBe(false);
  });

  test("isDue is inclusive of exact match", () => {
    const now = new Date("2026-04-03T12:00:00.000Z");
    expect(isDue("2026-04-03T12:00:00.000Z", now)).toBe(true);
  });

  test("isDue returns false for invalid ISO string", () => {
    const now = new Date("2026-04-03T12:00:00.000Z");
    expect(isDue("not-a-valid-date", now)).toBe(false);
  });

  test("compareDueJobs sorts earlier nextRunAt first", () => {
    const jobA: CronJob = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      enabled: true,
      schedule: { kind: "at", at: "2026-04-04T08:00:00.000Z" },
      payload: "a",
      target: { kind: "telegram", chatId: 1 },
      sessionMode: "main",
      deleteAfterSuccess: false,
      nextRunAt: "2026-04-04T08:00:00.000Z",
      lastRunAt: null,
      createdAt: "2026-04-03T00:00:00.000Z",
    };
    const jobB: CronJob = {
      ...jobA,
      id: "bbbbbbbb-0000-0000-0000-000000000001",
      nextRunAt: "2026-04-04T09:00:00.000Z",
    };
    expect(compareDueJobs(jobA, jobB)).toBeLessThan(0);
    expect(compareDueJobs(jobB, jobA)).toBeGreaterThan(0);
  });

  test("compareDueJobs puts null nextRunAt last", () => {
    const base: CronJob = {
      id: "aaaaaaaa-0000-0000-0000-000000000002",
      enabled: true,
      schedule: { kind: "at", at: "2026-04-04T08:00:00.000Z" },
      payload: "a",
      target: { kind: "telegram", chatId: 1 },
      sessionMode: "main",
      deleteAfterSuccess: false,
      nextRunAt: "2026-04-04T08:00:00.000Z",
      lastRunAt: null,
      createdAt: "2026-04-03T00:00:00.000Z",
    };
    const jobNull: CronJob = { ...base, id: "cccccccc-0000-0000-0000-000000000002", nextRunAt: null };
    expect(compareDueJobs(base, jobNull)).toBeLessThan(0);
    expect(compareDueJobs(jobNull, base)).toBeGreaterThan(0);
  });

  test("compareDueJobs tiebreaks by id", () => {
    const shared: CronJob = {
      id: "aaaaaaaa-0000-0000-0000-000000000003",
      enabled: true,
      schedule: { kind: "at", at: "2026-04-04T08:00:00.000Z" },
      payload: "a",
      target: { kind: "telegram", chatId: 1 },
      sessionMode: "main",
      deleteAfterSuccess: false,
      nextRunAt: "2026-04-04T08:00:00.000Z",
      lastRunAt: null,
      createdAt: "2026-04-03T00:00:00.000Z",
    };
    const jobZ: CronJob = { ...shared, id: "zzzzzzzz-0000-0000-0000-000000000003" };
    expect(compareDueJobs(shared, jobZ)).toBeLessThan(0);
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

  test("loadCronJobsFile returns empty when file is absent", () => {
    const tmp = withTempOpenPawHome();
    try {
      const loaded = loadCronJobsFile();
      expect(loaded.version).toBe(1);
      expect(loaded.jobs).toHaveLength(0);
    } finally {
      tmp.dispose();
    }
  });

  test("loadCronJobsFile returns empty when file contains corrupt JSON", () => {
    const tmp = withTempOpenPawHome();
    try {
      // Write the cron directory and a corrupt jobs.json
      mkdirSync(join(tmp.home, "cron"), { recursive: true });
      writeFileSync(join(tmp.home, "cron", "jobs.json"), "{ not valid json [[[", "utf8");
      const loaded = loadCronJobsFile();
      expect(loaded.jobs).toHaveLength(0);
    } finally {
      tmp.dispose();
    }
  });

  test("loadCronJobsFile returns empty when schema is invalid", () => {
    const tmp = withTempOpenPawHome();
    try {
      mkdirSync(join(tmp.home, "cron"), { recursive: true });
      writeFileSync(
        join(tmp.home, "cron", "jobs.json"),
        JSON.stringify({ version: 2, jobs: [] }),
        "utf8",
      );
      const loaded = loadCronJobsFile();
      expect(loaded.jobs).toHaveLength(0);
    } finally {
      tmp.dispose();
    }
  });

  test("listCronJobs returns all jobs", () => {
    const tmp = withTempOpenPawHome();
    try {
      const makeJob = (suffix: string): CronJob => ({
        id: `550e8400-e29b-41d4-a716-44665544${suffix}`,
        enabled: true,
        schedule: { kind: "at", at: "2026-04-04T09:00:00.000Z" },
        payload: `job-${suffix}`,
        target: { kind: "telegram", chatId: 1 },
        sessionMode: "main",
        deleteAfterSuccess: false,
        nextRunAt: "2026-04-04T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      });
      saveCronJobsFile({ version: 1, jobs: [makeJob("0010"), makeJob("0011"), makeJob("0012")] });
      const jobs = listCronJobs();
      expect(jobs).toHaveLength(3);
    } finally {
      tmp.dispose();
    }
  });

  test("getCronJob returns job by id", () => {
    const tmp = withTempOpenPawHome();
    try {
      const job: CronJob = {
        id: "550e8400-e29b-41d4-a716-446655440020",
        enabled: true,
        schedule: { kind: "at", at: "2026-04-04T09:00:00.000Z" },
        payload: "find me",
        target: { kind: "telegram", chatId: 5 },
        sessionMode: "main",
        deleteAfterSuccess: false,
        nextRunAt: "2026-04-04T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      };
      saveCronJobsFile({ version: 1, jobs: [job] });
      const found = getCronJob("550e8400-e29b-41d4-a716-446655440020");
      expect(found).toBeDefined();
      expect(found!.payload).toBe("find me");
    } finally {
      tmp.dispose();
    }
  });

  test("getCronJob returns undefined for unknown id", () => {
    const tmp = withTempOpenPawHome();
    try {
      saveCronJobsFile({ version: 1, jobs: [] });
      const found = getCronJob("00000000-0000-0000-0000-000000000000");
      expect(found).toBeUndefined();
    } finally {
      tmp.dispose();
    }
  });

  test("upsertCronJob inserts a new job", () => {
    const tmp = withTempOpenPawHome();
    try {
      saveCronJobsFile({ version: 1, jobs: [] });
      const job: CronJob = {
        id: "550e8400-e29b-41d4-a716-446655440030",
        enabled: true,
        schedule: { kind: "cron", expr: "0 9 * * 1-5" },
        payload: "stand-up",
        target: { kind: "telegram", chatId: 10 },
        sessionMode: "main",
        deleteAfterSuccess: false,
        nextRunAt: "2026-04-07T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      };
      upsertCronJob(job);
      const jobs = listCronJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.payload).toBe("stand-up");
    } finally {
      tmp.dispose();
    }
  });

  test("upsertCronJob replaces a job with the same id", () => {
    const tmp = withTempOpenPawHome();
    try {
      const job: CronJob = {
        id: "550e8400-e29b-41d4-a716-446655440031",
        enabled: true,
        schedule: { kind: "cron", expr: "0 9 * * 1-5" },
        payload: "original",
        target: { kind: "telegram", chatId: 10 },
        sessionMode: "main",
        deleteAfterSuccess: false,
        nextRunAt: "2026-04-07T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      };
      saveCronJobsFile({ version: 1, jobs: [job] });
      upsertCronJob({ ...job, payload: "updated" });
      const jobs = listCronJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.payload).toBe("updated");
    } finally {
      tmp.dispose();
    }
  });

  test("deleteCronJob returns true and removes job", () => {
    const tmp = withTempOpenPawHome();
    try {
      const job: CronJob = {
        id: "550e8400-e29b-41d4-a716-446655440040",
        enabled: true,
        schedule: { kind: "at", at: "2026-04-04T09:00:00.000Z" },
        payload: "to-delete",
        target: { kind: "telegram", chatId: 1 },
        sessionMode: "main",
        deleteAfterSuccess: true,
        nextRunAt: "2026-04-04T09:00:00.000Z",
        lastRunAt: null,
        createdAt: "2026-04-03T00:00:00.000Z",
      };
      saveCronJobsFile({ version: 1, jobs: [job] });
      const removed = deleteCronJob("550e8400-e29b-41d4-a716-446655440040");
      expect(removed).toBe(true);
      expect(listCronJobs()).toHaveLength(0);
    } finally {
      tmp.dispose();
    }
  });

  test("deleteCronJob returns false for unknown id", () => {
    const tmp = withTempOpenPawHome();
    try {
      saveCronJobsFile({ version: 1, jobs: [] });
      const removed = deleteCronJob("00000000-0000-0000-0000-000000000099");
      expect(removed).toBe(false);
    } finally {
      tmp.dispose();
    }
  });

  test("mutateCronJobs returns computed result", () => {
    const tmp = withTempOpenPawHome();
    try {
      saveCronJobsFile({ version: 1, jobs: [] });
      const value = mutateCronJobs((file) => ({
        result: file.jobs.length,
        next: file,
      }));
      expect(value).toBe(0);
    } finally {
      tmp.dispose();
    }
  });

  test("appendCronRunRecord writes and readCronRunRecords returns records", () => {
    const tmp = withTempOpenPawHome();
    try {
      const jobId = "550e8400-e29b-41d4-a716-446655440050";
      const runId = "660e8400-e29b-41d4-a716-446655440050";
      appendCronRunRecord(
        jobId,
        {
          runId,
          jobId,
          startedAt: "2026-04-03T10:00:00.000Z",
          finishedAt: "2026-04-03T10:00:05.000Z",
          status: "ok",
          summary: "done",
        },
        1000,
      );
      const records = readCronRunRecords(jobId, 10);
      expect(records).toHaveLength(1);
      expect(records[0]!.runId).toBe(runId);
      expect(records[0]!.status).toBe("ok");
      expect(records[0]!.summary).toBe("done");
    } finally {
      tmp.dispose();
    }
  });

  test("readCronRunRecords returns empty for nonexistent job", () => {
    const tmp = withTempOpenPawHome();
    try {
      const records = readCronRunRecords("00000000-0000-0000-0000-000000000000", 10);
      expect(records).toHaveLength(0);
    } finally {
      tmp.dispose();
    }
  });

  test("readCronRunRecords returns empty when limit is zero", () => {
    const tmp = withTempOpenPawHome();
    try {
      const jobId = "550e8400-e29b-41d4-a716-446655440051";
      appendCronRunRecord(
        jobId,
        {
          runId: "660e8400-e29b-41d4-a716-446655440051",
          jobId,
          startedAt: "2026-04-03T10:00:00.000Z",
          finishedAt: "2026-04-03T10:00:05.000Z",
          status: "ok",
        },
        1000,
      );
      const records = readCronRunRecords(jobId, 0);
      expect(records).toHaveLength(0);
    } finally {
      tmp.dispose();
    }
  });

  test("readCronRunRecords respects limit (last N)", () => {
    const tmp = withTempOpenPawHome();
    try {
      const jobId = "550e8400-e29b-41d4-a716-446655440052";
      for (let i = 0; i < 5; i++) {
        appendCronRunRecord(
          jobId,
          {
            runId: `660e8400-e29b-41d4-a716-44665544005${i}`,
            jobId,
            startedAt: `2026-04-03T10:0${i}:00.000Z`,
            finishedAt: `2026-04-03T10:0${i}:05.000Z`,
            status: "ok",
            summary: `run-${i}`,
          },
          1000,
        );
      }
      const records = readCronRunRecords(jobId, 3);
      expect(records).toHaveLength(3);
      // Should be the last 3 records (runs 2, 3, 4)
      expect(records[2]!.summary).toBe("run-4");
    } finally {
      tmp.dispose();
    }
  });

  test("appendCronRunRecord truncates oldest lines when maxLines exceeded", () => {
    const tmp = withTempOpenPawHome();
    try {
      const jobId = "550e8400-e29b-41d4-a716-446655440053";
      const maxLines = 3;
      for (let i = 0; i < 5; i++) {
        appendCronRunRecord(
          jobId,
          {
            runId: `770e8400-e29b-41d4-a716-44665544005${i}`,
            jobId,
            startedAt: `2026-04-03T10:0${i}:00.000Z`,
            finishedAt: `2026-04-03T10:0${i}:05.000Z`,
            status: "ok",
            summary: `entry-${i}`,
          },
          maxLines,
        );
      }
      const records = readCronRunRecords(jobId, 100);
      expect(records.length).toBeLessThanOrEqual(maxLines);
      // The last record should be the most recent
      expect(records[records.length - 1]!.summary).toBe("entry-4");
    } finally {
      tmp.dispose();
    }
  });

  test("appendCronRunRecord appends error records", () => {
    const tmp = withTempOpenPawHome();
    try {
      const jobId = "550e8400-e29b-41d4-a716-446655440054";
      appendCronRunRecord(
        jobId,
        {
          runId: "880e8400-e29b-41d4-a716-446655440054",
          jobId,
          startedAt: "2026-04-03T10:00:00.000Z",
          finishedAt: "2026-04-03T10:00:01.000Z",
          status: "error",
          error: "network timeout",
        },
        1000,
      );
      const records = readCronRunRecords(jobId, 5);
      expect(records[0]!.status).toBe("error");
      expect(records[0]!.error).toBe("network timeout");
    } finally {
      tmp.dispose();
    }
  });
});

describe("formatCronUserPayload", () => {
  test("prefixes payload with [Cron]", () => {
    expect(formatCronUserPayload("do something")).toBe("[Cron] do something");
  });

  test("does not double-prefix an already-prefixed payload", () => {
    expect(formatCronUserPayload("[Cron] already tagged")).toBe("[Cron] already tagged");
  });

  test("trims leading and trailing whitespace before checking prefix", () => {
    expect(formatCronUserPayload("  do something  ")).toBe("[Cron] do something");
  });

  test("does not re-add prefix when payload starts with [Cron] after trim", () => {
    expect(formatCronUserPayload("  [Cron] with leading spaces")).toBe("[Cron] with leading spaces");
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

describe("cron paths", () => {
  test("getCronDir resolves under OPENPAW_HOME", () => {
    const tmp = withTempOpenPawHome();
    try {
      expect(getCronDir()).toBe(join(tmp.home, "cron"));
    } finally {
      tmp.dispose();
    }
  });

  test("getCronJobsPath resolves to jobs.json inside cron dir", () => {
    const tmp = withTempOpenPawHome();
    try {
      expect(getCronJobsPath()).toBe(join(tmp.home, "cron", "jobs.json"));
    } finally {
      tmp.dispose();
    }
  });

  test("getCronRunsDir resolves to runs/ inside cron dir", () => {
    const tmp = withTempOpenPawHome();
    try {
      expect(getCronRunsDir()).toBe(join(tmp.home, "cron", "runs"));
    } finally {
      tmp.dispose();
    }
  });

  test("ensureCronDirectories creates cron and runs directories", () => {
    const tmp = withTempOpenPawHome();
    try {
      ensureCronDirectories();
      expect(existsSync(join(tmp.home, "cron"))).toBe(true);
      expect(existsSync(join(tmp.home, "cron", "runs"))).toBe(true);
    } finally {
      tmp.dispose();
    }
  });

  test("ensureCronDirectories is idempotent", () => {
    const tmp = withTempOpenPawHome();
    try {
      ensureCronDirectories();
      // calling again should not throw
      expect(() => ensureCronDirectories()).not.toThrow();
    } finally {
      tmp.dispose();
    }
  });
});