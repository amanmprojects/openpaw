import type { SessionId } from "../../agent/types";
import { formatTuiSessionLabel } from "./tui-session-label";
import type { TuiSessionListEntry } from "./tui-session-discovery";

const MAX_LINES = 20;
const MAX_CHARS = 3500;

/**
 * Builds the plaintext body for a TUI /sessions reply (numbered list, active marker, truncation).
 */
export function formatTuiSessionsListMessage(
  entries: TuiSessionListEntry[],
  activeSessionId: SessionId,
): string {
  if (entries.length === 0) {
    return "No saved sessions yet.";
  }

  const lines: string[] = [];
  const shown = Math.min(entries.length, MAX_LINES);
  for (let i = 0; i < shown; i++) {
    const e = entries[i]!;
    const n = i + 1;
    const mark = e.sessionId === activeSessionId ? " (active)" : "";
    const label = formatTuiSessionLabel(e.sessionId);
    lines.push(`${n}. ${label}${mark}`);
  }
  if (entries.length > MAX_LINES) {
    lines.push(`…and ${entries.length - MAX_LINES} more.`);
  }

  let body = "Saved sessions (newest first):\n" + lines.join("\n");
  if (body.length > MAX_CHARS) {
    body = `${body.slice(0, MAX_CHARS - 20)}\n…(truncated)`;
  }
  return body;
}
