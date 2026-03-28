/**
 * Generates a queue-serialization key for a WhatsApp chat based on the remote JID.
 */

/**
 * Returns a string key used for per-chat message queue serialization.
 *
 * @param remoteJid - The WhatsApp JID of the chat (e.g. `919876543210@s.whatsapp.net`).
 */
export function whatsappSessionKey(remoteJid: string): string {
  return `whatsapp:${remoteJid}`;
}
