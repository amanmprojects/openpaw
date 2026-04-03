/**
 * Load and persist cron jobs (`jobs.json`) and append-only run logs (`runs/<jobId>.jsonl`).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ensureCronDirectories,
  getCronJobsPath,
  getCronRunsDir,
} from "../../config/paths";
import {
  cronJobsFileSchema,
  type CronJob,
  type CronJobsFile,
  type CronRunRecord,
} from "./types";

const DEFAULT_FILE: CronJobsFile = { version: 1, jobs: [] };

function runsPath(jobId: string): string {
  return join(getCronRunsDir(), `${jobId}.jsonl`);
}

/**
 * Reads the cron jobs manifest from disk, or returns an empty manifest when missing/invalid.
 */
export function loadCronJobsFile(): CronJobsFile {
  const path = getCronJobsPath();
  if (!existsSync(path)) {
    return structuredClone(DEFAULT_FILE);
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const result = cronJobsFileSchema.safeParse(parsed);
    return result.success ? result.data : structuredClone(DEFAULT_FILE);
  } catch {
    return structuredClone(DEFAULT_FILE);
  }
}

/**
 * Writes the full cron jobs manifest (overwrites existing).
 */
export function saveCronJobsFile(file: CronJobsFile): void {
  ensureCronDirectories();
  writeFileSync(getCronJobsPath(), JSON.stringify(file, null, 2), "utf8");
}

/**
 * Applies a transactional read–modify–write to `jobs.json`.
 */
export function mutateCronJobs<T>(fn: (file: CronJobsFile) => { next: CronJobsFile; result: T }): T {
  const current = loadCronJobsFile();
  const { next, result } = fn(current);
  saveCronJobsFile(next);
  return result;
}

/**
 * Returns all persisted jobs (enabled and disabled).
 */
export function listCronJobs(): CronJob[] {
  return loadCronJobsFile().jobs;
}

/**
 * Returns one job by id, or undefined.
 */
export function getCronJob(id: string): CronJob | undefined {
  return loadCronJobsFile().jobs.find((j) => j.id === id);
}

/**
 * Inserts a new job or replaces an existing job with the same id.
 */
export function upsertCronJob(job: CronJob): void {
  mutateCronJobs((file) => {
    const others = file.jobs.filter((j) => j.id !== job.id);
    return { result: undefined, next: { version: 1, jobs: [...others, job] } };
  });
}

/**
 * Deletes a job by id. Returns whether a row was removed.
 */
export function deleteCronJob(id: string): boolean {
  return mutateCronJobs((file) => {
    const next = file.jobs.filter((j) => j.id !== id);
    const removed = next.length !== file.jobs.length;
    return { result: removed, next: { version: 1, jobs: next } };
  });
}

/**
 * Appends one JSON line to the job's run log, then truncates oldest lines if over `maxLines`.
 */
export function appendCronRunRecord(
  jobId: string,
  record: CronRunRecord,
  maxLines: number,
): void {
  ensureCronDirectories();
  const path = runsPath(jobId);
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  if (!existsSync(path)) {
    return;
  }
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length <= maxLines) {
      return;
    }
    const kept = lines.slice(-maxLines);
    writeFileSync(path, `${kept.join("\n")}\n`, "utf8");
  } catch {
    // best-effort pruning
  }
}

/**
 * Reads the last `limit` run records for a job (most recent last).
 */
export function readCronRunRecords(jobId: string, limit: number): CronRunRecord[] {
  const path = runsPath(jobId);
  if (!existsSync(path) || limit <= 0) {
    return [];
  }
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const slice = lines.slice(-limit);
    const out: CronRunRecord[] = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line) as CronRunRecord);
      } catch {
        // skip corrupt line
      }
    }
    return out;
  } catch {
    return [];
  }
}
