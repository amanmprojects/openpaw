/**
 * WhatsApp channel adapter using Baileys (WhatsApp Web multi-device protocol).
 * Connects via QR code on first run, then persists auth state for reconnection.
 * Mirrors the Telegram adapter pattern: per-chat queue, session management,
 * command handling, approval gate, and streaming reply delivery.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import type { OpenPawGatewayContext } from "../bootstrap";
import type { ChannelAdapter } from "../channel-adapter";
import {
  registerApprovalResponder,
  resolveApproval,
  type ApprovalRequest,
} from "../approval-gate";
import { createWhatsAppMessageQueue } from "./message-queue";
import { whatsappSessionKey } from "./session-key";
import { getWhatsAppPersistenceSessionId } from "./active-thread-store";
import { getWhatsAppChatPreferences } from "./chat-preferences";
import { handleWhatsAppCommand, isWhatsAppCommand } from "./command-handler";
import { deliverWhatsAppReply } from "./stream-delivery";
import { getWhatsAppAuthDir } from "./auth-store";

/** In-flight approval requests awaiting user reply. */
const pendingApprovals = new Map<string, { jid: string; resolve: (approved: boolean) => void }>();

/**
 * Wires the approval responder to send approval prompts to the specified WhatsApp JID
 * and listen for "yes"/"no" text replies to resolve them.
 */
function wireApprovalResponder(sock: WASocket, jid: string): void {
  registerApprovalResponder(async (req: ApprovalRequest) => {
    pendingApprovals.set(req.id, { jid, resolve: (approved) => resolveApproval(req.id, approved) });
    try {
      const text =
        `⚠️ *OpenPaw approval needed*\n\n` +
        `*Tool:* ${req.tool}\n` +
        `*Action:*\n${req.description}\n\n` +
        `Reply *yes* to approve or *no* to deny.`;
      await sock.sendMessage(jid, { text });
    } catch (e) {
      console.warn("OpenPaw: failed to send WhatsApp approval prompt", e);
      // Auto-approve on delivery failure so the agent doesn't hang.
      resolveApproval(req.id, true);
      pendingApprovals.delete(req.id);
    }
  });
}

/**
 * Checks if an incoming message is a yes/no reply to a pending approval request.
 * Returns true if handled as an approval response.
 */
function tryResolveApproval(jid: string, text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (lower !== "yes" && lower !== "no") return false;

  // Find the most recent pending approval for this JID.
  for (const [id, entry] of pendingApprovals) {
    if (entry.jid === jid) {
      const approved = lower === "yes";
      entry.resolve(approved);
      pendingApprovals.delete(id);
      return true;
    }
  }
  return false;
}

/**
 * Sets up all message handlers on the Baileys socket.
 */
function wireWhatsAppHandlers(sock: WASocket, ctx: OpenPawGatewayContext): void {
  const { runtime } = ctx;
  const runNext = createWhatsAppMessageQueue();

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Skip messages sent by us, status broadcasts, and non-text messages.
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;

      const jid = msg.key.remoteJid;
      if (!jid) continue;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";
      if (!text.trim()) continue;

      const queueKey = whatsappSessionKey(jid);

      // Check if this is a yes/no reply to a pending approval.
      if (tryResolveApproval(jid, text)) continue;

      await runNext(queueKey, async () => {
        // Check if it's a command (e.g. !new, !sessions).
        const handled = await handleWhatsAppCommand(sock, jid, text, runtime);
        if (handled) return;

        // Forward to the agent.
        try {
          wireApprovalResponder(sock, jid);
          const persistenceId = await getWhatsAppPersistenceSessionId(jid);
          const prefs = await getWhatsAppChatPreferences(jid);

          await deliverWhatsAppReply(sock, jid, prefs, async (handlers) => {
            await runtime.runTurn({
              sessionId: persistenceId,
              userText: text,
              onTextDelta: handlers.onTextDelta,
              onReasoningDelta: handlers.onReasoningDelta,
              onToolStatus: handlers.onToolStatus,
            });
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          try {
            await sock.sendMessage(jid, { text: `OpenPaw error: ${errMsg}` });
          } catch {
            // ignore double failure
          }
        }
      });
    }
  });
}

/**
 * Connects to WhatsApp via Baileys, handles QR code display, reconnection,
 * and credential persistence. Returns a promise that resolves when the
 * connection is permanently closed.
 */
async function connectWhatsApp(ctx: OpenPawGatewayContext): Promise<void> {
  const authDir = getWhatsAppAuthDir();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ["OpenPaw", "Chrome", "1.0.0"],
  });

  // Persist credentials on every update.
  sock.ev.on("creds.update", saveCreds);

  // Wire message handlers.
  wireWhatsAppHandlers(sock, ctx);

  // Handle connection updates (QR code, reconnect, logout).
  return new Promise<void>((resolve, reject) => {
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(
          "\n🐾 OpenPaw WhatsApp: Scan the QR code above with your WhatsApp app.\n" +
            "   Open WhatsApp → Settings → Linked Devices → Link a Device\n",
        );
      }

      if (connection === "open") {
        console.log("🐾 OpenPaw WhatsApp channel connected.");
      }

      if (connection === "close") {
        const statusCode =
          (lastDisconnect?.error as Boom)?.output?.statusCode ?? 0;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log(
            `[whatsapp] Connection closed (code ${statusCode}), reconnecting…`,
          );
          try {
            await connectWhatsApp(ctx);
            resolve();
          } catch (e) {
            reject(e);
          }
        } else {
          console.log(
            "[whatsapp] Logged out. Delete ~/.openpaw/whatsapp-auth/ and restart to re-link.",
          );
          resolve();
        }
      }
    });
  });
}

/**
 * Creates the WhatsApp channel adapter for the gateway.
 */
export function createWhatsAppChannelAdapter(
  ctx: OpenPawGatewayContext,
): ChannelAdapter {
  return {
    id: "whatsapp",
    run: async () => {
      console.log("OpenPaw WhatsApp channel starting (Baileys)…");
      await connectWhatsApp(ctx);
    },
  };
}
