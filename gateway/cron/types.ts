/**
 * Zod schemas and TypeScript types for persisted gateway cron jobs.
 */
import { z } from "zod";

export const cronScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("at"),
    /** ISO 8601 instant when the one-shot job should run. */
    at: z.string().min(1),
  }),
  z.object({
    kind: z.literal("cron"),
    expr: z.string().min(1),
    timezone: z.string().min(1).optional(),
  }),
]);

export type CronSchedule = z.infer<typeof cronScheduleSchema>;

export const cronTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("telegram"),
    chatId: z.number().finite(),
  }),
]);

export type CronTarget = z.infer<typeof cronTargetSchema>;

export const cronJobSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  schedule: cronScheduleSchema,
  /** Text passed to the model as the user turn (executor may prefix `[Cron] `). */
  payload: z.string(),
  target: cronTargetSchema,
  sessionMode: z.enum(["main", "isolated"]),
  /** When true (default for one-shot), the job row is removed after a successful run. */
  deleteAfterSuccess: z.boolean(),
  /** ISO instant of the next execution, or null if unscheduled / exhausted. */
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable().optional(),
  createdAt: z.string(),
  label: z.string().nullable().optional(),
});

export type CronJob = z.infer<typeof cronJobSchema>;

export const cronJobsFileSchema = z.object({
  version: z.literal(1),
  jobs: z.array(cronJobSchema),
});

export type CronJobsFile = z.infer<typeof cronJobsFileSchema>;

export const cronRunRecordSchema = z.object({
  runId: z.string().uuid(),
  jobId: z.string().uuid(),
  startedAt: z.string(),
  finishedAt: z.string(),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
  summary: z.string().optional(),
});

export type CronRunRecord = z.infer<typeof cronRunRecordSchema>;

/**
 * Parses and validates a JSON value as {@link CronRunRecord}, or returns null.
 */
export function parseCronRunRecord(data: unknown): CronRunRecord | null {
  const result = cronRunRecordSchema.safeParse(data);
  return result.success ? result.data : null;
}
