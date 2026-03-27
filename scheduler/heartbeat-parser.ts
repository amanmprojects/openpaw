/**
 * HEARTBEAT.md parser.
 *
 * Reads the workspace `HEARTBEAT.md` and extracts scheduled task definitions.
 *
 * ## HEARTBEAT.md format
 *
 * Each task starts with a level-2 heading that contains a cron expression
 * or shorthand inside brackets, followed by a plain-text description of what
 * the agent should do.
 *
 * ```markdown
 * ## [every monday 8am] Morning briefing
 * Check Moodle for assignment deadlines, check my calendar and send a WhatsApp/Telegram summary.
 *
 * ## [daily 9pm] Evening digest
 * Summarise what I worked on today and remind me of tomorrow's tasks.
 *
 * ## [0 * * * *] Hourly server check
 * Ping staging server and report if CPU > 80%.
 * ```
 *
 * ### Supported shorthand
 * | shorthand | cron |
 * |-----------|------|
 * | daily HH:MM | `MM HH * * *` |
 * | daily HAM/PM | converted to 24h |
 * | every monday HH:MM | `MM HH * * 1` |
 * | every weekday HH:MM | `MM HH * * 1-5` |
 * | every NNmin | `*\/NN * * * *` |
 * | raw cron (5 fields) | used as-is |
 */

export type HeartbeatTask = {
  /** Human-readable task name (the heading text after the bracket). */
  name: string;
  /** Cron expression (5 fields). */
  cron: string;
  /** The instruction text sent as the agent turn. */
  prompt: string;
};

// ─── Cron helpers ────────────────────────────────────────────────────────────

const DAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Converts "8am", "9:30pm", "14:00", "8" → { hour, minute } in 24h.
 */
function parseTime(raw: string): { hour: number; minute: number } | null {
  const lower = raw.toLowerCase().trim();
  const ampm = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? "0");
    if (ampm[3] === "pm" && h !== 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return { hour: h, minute: m };
  }
  const plain = lower.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (plain) {
    return { hour: Number(plain[1]), minute: Number(plain[2] ?? "0") };
  }
  return null;
}

/**
 * Converts a human-readable schedule shorthand or a raw 5-field cron expression
 * into a normalised 5-field cron string, or null if not recognisable.
 */
export function parseCron(schedule: string): string | null {
  const s = schedule.trim().toLowerCase();

  // Raw cron — 5 whitespace-separated fields
  if (/^[\d*/,\-]+(\s+[\d*/,\-]+){4}$/.test(s)) {
    return s;
  }

  // "every NNmin"
  const evMin = s.match(/^every\s+(\d+)\s*min(?:ute)?s?$/);
  if (evMin) {
    return `*/${evMin[1] ?? "1"} * * * *`;
  }

  // "every hour"
  if (s === "every hour") return "0 * * * *";

  // "every day HH:MM" or "daily HH:MM"
  const daily = s.match(/^(?:every\s+day|daily)\s+(.+)$/);
  if (daily) {
    const t = parseTime(daily[1] ?? "");
    if (t) return `${t.minute} ${t.hour} * * *`;
  }

  // "every weekday HH:MM"
  const weekday = s.match(/^every\s+weekday\s+(.+)$/);
  if (weekday) {
    const t = parseTime(weekday[1] ?? "");
    if (t) return `${t.minute} ${t.hour} * * 1-5`;
  }

  // "every <dayname> HH:MM"
  const byDay = s.match(/^every\s+(\w+)\s+(.+)$/);
  if (byDay) {
    const dow = DAYS[byDay[1] ?? ""];
    if (dow !== undefined) {
      const t = parseTime(byDay[2] ?? "");
      if (t) return `${t.minute} ${t.hour} * * ${dow}`;
    }
  }

  return null;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parses a HEARTBEAT.md string and returns the list of scheduled tasks.
 * Sections without a recognisable schedule are silently skipped.
 */
export function parseHeartbeatMd(content: string): HeartbeatTask[] {
  const tasks: HeartbeatTask[] = [];
  const sections = content.split(/^## /m).slice(1); // skip preamble

  for (const section of sections) {
    const lines = section.split("\n");
    const heading = lines[0]?.trim() ?? "";

    // Extract [schedule] from heading
    const bracketMatch = heading.match(/^\[(.+?)\]\s*(.*)$/);
    if (!bracketMatch) {
      continue;
    }
    const rawSchedule = (bracketMatch[1] ?? "").trim();
    const name = (bracketMatch[2] ?? "").trim() || rawSchedule;

    const cron = parseCron(rawSchedule);
    if (!cron) {
      console.warn(`[heartbeat] Unrecognised schedule "${rawSchedule}" in section "${name}" — skipped.`);
      continue;
    }

    const prompt = lines.slice(1).join("\n").trim();
    if (!prompt) {
      continue;
    }

    tasks.push({ name, cron, prompt });
  }

  return tasks;
}
