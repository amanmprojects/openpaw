/**
 * Manages Baileys multi-file auth state persistence under `~/.openpaw/whatsapp-auth/`.
 * Wraps the built-in `useMultiFileAuthState` helper from Baileys.
 */

import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";
import type { AuthenticationState } from "@whiskeysockets/baileys";
import { getConfigDir } from "../../config/paths";
import { WHATSAPP_AUTH_DIR_NAME } from "./constants";

/**
 * Returns the absolute path to the Baileys auth state directory.
 */
export function getWhatsAppAuthDir(): string {
  return join(getConfigDir(), WHATSAPP_AUTH_DIR_NAME);
}

/**
 * Loads or initialises Baileys auth state from disk.
 * Creates the auth directory if it does not exist.
 *
 * @returns The auth state and a `saveCreds` callback to persist credential updates.
 */
export async function loadWhatsAppAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const dir = getWhatsAppAuthDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return useMultiFileAuthState(dir);
}
