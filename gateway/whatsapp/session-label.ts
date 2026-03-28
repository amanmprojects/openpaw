/**
 * Formats human-readable labels for WhatsApp session rows (legacy → "main", else thread suffix).
 */

import { normaliseJid } from "./active-thread-store";

/**
 * Returns a short display label for a WhatsApp session ID.
 *
 * @param sessionId - e.g. `wa:919876543210` or `wa:919876543210:abc-uuid`
 * @param jid - The WhatsApp JID for context (used to strip the normalised prefix).
 */
export function formatWhatsAppSessionLabel(sessionId: string, jid: string): string {
  const normJid = normaliseJid(jid);
  const legacy = `wa:${normJid}`;
  if (sessionId === legacy) {
    return "main";
  }
  const prefix = `${legacy}:`;
  if (sessionId.startsWith(prefix)) {
    return sessionId.slice(prefix.length);
  }
  return sessionId;
}
