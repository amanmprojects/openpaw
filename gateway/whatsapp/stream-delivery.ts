/**
 * Delivers an agent turn response to a WhatsApp chat.
 *
 * Unlike Telegram, WhatsApp does not support editing sent messages mid-stream.
 * Instead we show a "composing" presence indicator while the agent works,
 * accumulate the full response, and send it as one or more messages at the end.
 */

import type { WASocket } from "@whiskeysockets/baileys";
import type { WhatsAppChatPreferences } from "./chat-preferences";
import type { ToolStreamEvent } from "../../agent/types";
import { WHATSAPP_MAX_MESSAGE_LENGTH } from "./constants";

export type WhatsAppStreamHandlers = {
  onTextDelta: (delta: string) => void;
  onReasoningDelta: (delta: string) => void;
  onToolStatus: (ev: ToolStreamEvent) => void;
};

/**
 * Runs an agent turn, shows "composing" presence during processing,
 * then sends the accumulated response as one or more WhatsApp messages.
 *
 * @param sock - The Baileys socket instance.
 * @param jid - The remote JID to send to.
 * @param prefs - Per-chat display preferences.
 * @param runTurn - Callback that receives stream handlers and runs the agent turn.
 */
export async function deliverWhatsAppReply(
  sock: WASocket,
  jid: string,
  prefs: WhatsAppChatPreferences,
  runTurn: (handlers: WhatsAppStreamHandlers) => Promise<void>,
): Promise<void> {
  let textAccum = "";
  let reasoningAccum = "";
  const toolEvents: ToolStreamEvent[] = [];

  // Show "typing…" indicator.
  await sock.presenceSubscribe(jid);
  await sock.sendPresenceUpdate("composing", jid);

  const handlers: WhatsAppStreamHandlers = {
    onTextDelta: (delta) => {
      textAccum += delta;
    },
    onReasoningDelta: (delta) => {
      reasoningAccum += delta;
    },
    onToolStatus: (ev) => {
      toolEvents.push(ev);
    },
  };

  try {
    await runTurn(handlers);
  } finally {
    // Clear composing indicator.
    await sock.sendPresenceUpdate("paused", jid).catch(() => {});
  }

  // Build and send the response messages.
  const parts: string[] = [];

  // Reasoning block (if enabled and present).
  if (prefs.showReasoning && reasoningAccum.trim()) {
    const trimmed = reasoningAccum.trim();
    const maxLen = 2000;
    const reasoningText =
      trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
    parts.push(`💭 *Reasoning*\n${reasoningText}`);
  }

  // Tool call summaries (if enabled).
  if (prefs.showToolCalls && toolEvents.length > 0) {
    for (const ev of toolEvents) {
      parts.push(formatToolEvent(ev));
    }
  }

  // Main text reply.
  if (textAccum.trim()) {
    parts.push(textAccum.trim());
  }

  if (parts.length === 0) {
    parts.push("(No response generated.)");
  }

  // Send each part as a separate message (reasoning, tools, then text).
  for (const part of parts) {
    await sendLongMessage(sock, jid, part);
  }
}

/**
 * Formats a tool stream event into a human-readable WhatsApp message line.
 */
function formatToolEvent(ev: ToolStreamEvent): string {
  switch (ev.type) {
    case "tool_input":
      return `🔧 *${ev.toolName}*\n\`\`\`\n${truncate(JSON.stringify(ev.input, null, 2), 500)}\n\`\`\``;
    case "tool_output":
      return `✅ *${ev.toolName}*\n\`\`\`\n${truncate(JSON.stringify(ev.output, null, 2), 500)}\n\`\`\``;
    case "tool_error":
      return `⚠️ *${ev.toolName}* — error: ${truncate(ev.errorText, 200)}`;
    case "tool_denied":
      return `⛔ *${ev.toolName}* — denied by user`;
    default:
      return "";
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Sends a potentially long message by splitting it into WhatsApp-safe chunks.
 */
async function sendLongMessage(sock: WASocket, jid: string, text: string): Promise<void> {
  const max = WHATSAPP_MAX_MESSAGE_LENGTH;
  if (text.length <= max) {
    await sock.sendMessage(jid, { text });
    return;
  }
  // Split at newline boundaries where possible.
  let remaining = text;
  while (remaining.length > 0) {
    let chunk: string;
    if (remaining.length <= max) {
      chunk = remaining;
      remaining = "";
    } else {
      const cutPoint = remaining.lastIndexOf("\n", max);
      const splitAt = cutPoint > max * 0.5 ? cutPoint : max;
      chunk = remaining.slice(0, splitAt);
      remaining = remaining.slice(splitAt).trimStart();
    }
    await sock.sendMessage(jid, { text: chunk });
  }
}
