/**
 * Builds the plaintext body for a WhatsApp !sessions reply (numbered list, active marker, truncation).
 */

import type { SessionId } from "../../agent/types";
import { formatWhatsAppSessionLabel } from "./session-label";
import type { WhatsAppSessionListEntry } from "./session-file-discovery";

const MAX_LINES = 20;
const MAX_CHARS = 3500;

/**
 * Formats a human-readable sessions list for a WhatsApp chat.
 */
export function formatWhatsAppSessionsListMessage(
  entries: WhatsAppSessionListEntry[],
  activeSessionId: SessionId,
  jid: string,
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
    const label = formatWhatsAppSessionLabel(e.sessionId, jid);
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
