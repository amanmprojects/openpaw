/**
 * Filename constants for WhatsApp channel persistence under `~/.openpaw/workspace/sessions/`.
 */

/** Persisted active WhatsApp thread UUID per phone number. */
export const WHATSAPP_ACTIVE_THREADS_FILENAME = "whatsapp-active-threads.json";

/** Per-phone-number UI preferences (show reasoning, show tool calls). */
export const WHATSAPP_CHAT_PREFERENCES_FILENAME = "whatsapp-chat-preferences.json";

/** Directory inside `~/.openpaw/` that stores Baileys multi-file auth state. */
export const WHATSAPP_AUTH_DIR_NAME = "whatsapp-auth";

/** Maximum WhatsApp message length (characters). */
export const WHATSAPP_MAX_MESSAGE_LENGTH = 65536;

/** Prefix used for WhatsApp slash commands (since WhatsApp has no native bot commands). */
export const WHATSAPP_COMMAND_PREFIX = "!";
