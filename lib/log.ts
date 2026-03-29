/**
 * Minimal structured logging helpers for OpenPaw processes.
 */

type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

/**
 * Emits an informational structured log line.
 */
export function logInfo(event: string, fields?: LogFields): void {
  emit("info", event, fields);
}

/**
 * Emits a warning structured log line.
 */
export function logWarn(event: string, fields?: LogFields): void {
  emit("warn", event, fields);
}

/**
 * Emits an error structured log line.
 */
export function logError(event: string, fields?: LogFields): void {
  emit("error", event, fields);
}
