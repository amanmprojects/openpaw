/**
 * Heartbeat scheduler — runs proactive agent turns on a cron schedule.
 *
 * Reads `~/.openpaw/workspace/HEARTBEAT.md` for task definitions, schedules
 * them using a lightweight cron runner, and calls `runtime.runTurn()` with
 * the task prompt.  The result is delivered to the registered outbound channel
 * (currently Telegram) so the user receives the message without asking.
 *
 * Usage:
 *   const scheduler = createHeartbeatScheduler(runtime, workspacePath);
 *   scheduler.start(sendToUser);   // pass a function that sends text to the user
 *   // ... later:
 *   scheduler.stop();
 */

import { existsSync, readFileSync, watchFile, unwatchFile } from "node:fs";
import { join } from "node:path";
import { parseHeartbeatMd, type HeartbeatTask } from "./heartbeat-parser";
import type { AgentRuntime } from "../agent/agent";

export type OutboundSender = (text: string) => Promise<void>;

// ─── Minimal cron runner ─────────────────────────────────────────────────────

/**
 * Parses a 5-field cron string into parts.
 */
function splitCron(expr: string) {
  const [minute, hour, dom, month, dow] = expr.split(" ");
  return { minute: minute!, hour: hour!, dom: dom!, month: month!, dow: dow! };
}

/**
 * Returns true if `value` matches a cron field (supports *, ranges, step /N, and lists).
 */
function matchField(value: number, field: string): boolean {
  for (const part of field.split(",")) {
    if (part === "*") return true;
    if (part.includes("/")) {
      const [rangeOrStar, step] = part.split("/");
      const stepN = Number(step);
      if (rangeOrStar === "*") {
        if (value % stepN === 0) return true;
      } else if (rangeOrStar?.includes("-")) {
        const [lo, hi] = rangeOrStar.split("-").map(Number);
        if (value >= lo! && value <= hi! && (value - lo!) % stepN === 0) return true;
      }
    } else if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number);
      if (value >= lo! && value <= hi!) return true;
    } else {
      if (value === Number(part)) return true;
    }
  }
  return false;
}

/**
 * Returns true if `date` fires the given cron expression.
 */
function matchesCron(expr: string, date: Date): boolean {
  const { minute, hour, dom, month, dow } = splitCron(expr);
  return (
    matchField(date.getMinutes(), minute) &&
    matchField(date.getHours(), hour) &&
    matchField(date.getDate(), dom) &&
    matchField(date.getMonth() + 1, month) &&
    matchField(date.getDay(), dow)
  );
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

const HEARTBEAT_FILENAME = "HEARTBEAT.md";
const POLL_INTERVAL_MS = 60_000; // check every minute

export type HeartbeatScheduler = {
  /** Start scheduling tasks. Call once with the outbound sender. */
  start: (sender: OutboundSender) => void;
  /** Stop all timers and file watchers. */
  stop: () => void;
};

/**
 * Creates a heartbeat scheduler tied to the given agent runtime.
 *
 * The scheduler:
 * 1. Reads and re-reads `HEARTBEAT.md` whenever the file changes on disk.
 * 2. Every minute, checks which tasks are due and fires them.
 * 3. Each fired task runs a full agent turn and sends the reply to the user
 *    via the registered `OutboundSender`.
 */
export function createHeartbeatScheduler(
  runtime: AgentRuntime,
  workspacePath: string,
): HeartbeatScheduler {
  const heartbeatPath = join(workspacePath, HEARTBEAT_FILENAME);
  let tasks: HeartbeatTask[] = [];
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let sender: OutboundSender | null = null;

  function loadTasks(): void {
    if (!existsSync(heartbeatPath)) {
      tasks = [];
      return;
    }
    try {
      const raw = readFileSync(heartbeatPath, "utf8");
      tasks = parseHeartbeatMd(raw);
      console.log(
        `[heartbeat] Loaded ${tasks.length} task(s): ${tasks.map((t) => t.name).join(", ")}`,
      );
    } catch (e) {
      console.warn("[heartbeat] Failed to parse HEARTBEAT.md:", e);
      tasks = [];
    }
  }

  async function runTask(task: HeartbeatTask): Promise<void> {
    if (!sender) return;
    console.log(`[heartbeat] Firing task: ${task.name}`);
    try {
      const result = await runtime.runTurn({
        sessionId: "heartbeat:proactive",
        userText: `[Heartbeat task: ${task.name}]\n${task.prompt}`,
      });
      if (result.text.trim()) {
        await sender(result.text);
      }
    } catch (e) {
      console.error(`[heartbeat] Task "${task.name}" failed:`, e);
      try {
        await sender?.(`⚠️ Heartbeat task "${task.name}" failed: ${e instanceof Error ? e.message : String(e)}`);
      } catch {
        // swallow secondary error
      }
    }
  }

  function tickMinute(): void {
    const now = new Date();
    for (const task of tasks) {
      if (matchesCron(task.cron, now)) {
        void runTask(task);
      }
    }
  }

  return {
    start(outboundSender: OutboundSender) {
      sender = outboundSender;
      loadTasks();

      // Re-load when the file changes.
      if (existsSync(heartbeatPath)) {
        watchFile(heartbeatPath, { interval: 5000 }, () => {
          console.log("[heartbeat] HEARTBEAT.md changed — reloading tasks.");
          loadTasks();
        });
      }

      // Align to the top of the next minute, then poll every 60s.
      const msToNextMin = (60 - new Date().getSeconds()) * 1000;
      setTimeout(() => {
        tickMinute();
        intervalHandle = setInterval(tickMinute, POLL_INTERVAL_MS);
      }, msToNextMin);

      console.log("[heartbeat] Scheduler started.");
    },

    stop() {
      if (intervalHandle !== null) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }
      if (existsSync(heartbeatPath)) {
        unwatchFile(heartbeatPath);
      }
      console.log("[heartbeat] Scheduler stopped.");
    },
  };
}
