/**
 * Handles WhatsApp "slash" commands prefixed with `!` (e.g. `!new`, `!sessions`, `!resume 2`).
 * Returns true if the message was handled as a command, false if it should be forwarded to the agent.
 */

import type { WASocket } from "@whiskeysockets/baileys";
import type { AgentRuntime } from "../../agent/agent";
import { formatBudgetReport } from "../../agent/token-budget";
import { WHATSAPP_COMMAND_PREFIX } from "./constants";
import {
  getWhatsAppPersistenceSessionId,
  startNewWhatsAppThread,
  setActiveWhatsAppSession,
} from "./active-thread-store";
import { listWhatsAppSessionsForJid } from "./session-file-discovery";
import { formatWhatsAppSessionsListMessage } from "./sessions-list-reply";
import {
  getWhatsAppChatPreferences,
  setWhatsAppChatPreferences,
} from "./chat-preferences";
import { formatWhatsAppSessionLabel } from "./session-label";

/**
 * Set of recognised WhatsApp bot commands (without the prefix).
 */
const COMMANDS = new Set([
  "new",
  "sessions",
  "resume",
  "reasoning",
  "tool_calls",
  "budget",
  "help",
]);

/**
 * Returns true if the message text starts with the command prefix and matches a known command.
 */
export function isWhatsAppCommand(text: string): boolean {
  if (!text.startsWith(WHATSAPP_COMMAND_PREFIX)) return false;
  const token = text.slice(WHATSAPP_COMMAND_PREFIX.length).trim().split(/\s/)[0]?.toLowerCase();
  return token !== undefined && COMMANDS.has(token);
}

/**
 * Extracts the command name and the rest of the text after the command.
 */
function parseCommand(text: string): { cmd: string; rest: string } {
  const stripped = text.slice(WHATSAPP_COMMAND_PREFIX.length).trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  return {
    cmd: (tokens[0] ?? "").toLowerCase(),
    rest: tokens.slice(1).join(" ").trim(),
  };
}

/**
 * Processes a WhatsApp command message. Returns true if handled, false otherwise.
 */
export async function handleWhatsAppCommand(
  sock: WASocket,
  jid: string,
  text: string,
  runtime: AgentRuntime,
): Promise<boolean> {
  if (!isWhatsAppCommand(text)) return false;

  const { cmd, rest } = parseCommand(text);

  try {
    switch (cmd) {
      case "new":
        await handleNew(sock, jid);
        break;
      case "sessions":
        await handleSessions(sock, jid);
        break;
      case "resume":
        await handleResume(sock, jid, rest);
        break;
      case "reasoning":
        await handleReasoning(sock, jid, rest);
        break;
      case "tool_calls":
        await handleToolCalls(sock, jid, rest);
        break;
      case "budget":
        await handleBudget(sock, jid, runtime);
        break;
      case "help":
        await handleHelp(sock, jid);
        break;
      default:
        return false;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sock.sendMessage(jid, { text: `OpenPaw error: ${msg}` });
  }

  return true;
}

async function handleNew(sock: WASocket, jid: string): Promise<void> {
  await startNewWhatsAppThread(jid);
  await sock.sendMessage(jid, { text: "Started a new conversation." });
}

async function handleSessions(sock: WASocket, jid: string): Promise<void> {
  const entries = await listWhatsAppSessionsForJid(jid);
  const activeId = await getWhatsAppPersistenceSessionId(jid);
  const body = formatWhatsAppSessionsListMessage(entries, activeId, jid);
  await sock.sendMessage(jid, { text: body });
}

async function handleResume(sock: WASocket, jid: string, rest: string): Promise<void> {
  if (!/^\d+$/.test(rest)) {
    await sock.sendMessage(jid, { text: "Usage: !resume 1 — use !sessions to see numbers." });
    return;
  }
  const n = Number.parseInt(rest, 10);
  if (n < 1) {
    await sock.sendMessage(jid, { text: "Usage: !resume 1 — use !sessions to see numbers." });
    return;
  }
  const entries = await listWhatsAppSessionsForJid(jid);
  if (entries.length === 0) {
    await sock.sendMessage(jid, { text: "No saved sessions yet." });
    return;
  }
  if (n > entries.length) {
    await sock.sendMessage(jid, { text: `No session ${n}. Run !sessions (1–${entries.length}).` });
    return;
  }
  const chosen = entries[n - 1]!;
  await setActiveWhatsAppSession(jid, chosen.sessionId);
  const label = formatWhatsAppSessionLabel(chosen.sessionId, jid);
  await sock.sendMessage(jid, { text: `Resumed session ${n} (${label}).` });
}

async function handleReasoning(sock: WASocket, jid: string, rest: string): Promise<void> {
  const arg = rest.toLowerCase();
  if (arg !== "show" && arg !== "hide") {
    await sock.sendMessage(jid, { text: "Usage: !reasoning show — or — !reasoning hide" });
    return;
  }
  await setWhatsAppChatPreferences(jid, { showReasoning: arg === "show" });
  await sock.sendMessage(jid, {
    text: arg === "show"
      ? "Reasoning will appear as separate messages."
      : "Reasoning messages are hidden (session still saves them).",
  });
}

async function handleToolCalls(sock: WASocket, jid: string, rest: string): Promise<void> {
  const arg = rest.toLowerCase();
  if (arg !== "show" && arg !== "hide") {
    await sock.sendMessage(jid, { text: "Usage: !tool_calls show — or — !tool_calls hide" });
    return;
  }
  await setWhatsAppChatPreferences(jid, { showToolCalls: arg === "show" });
  await sock.sendMessage(jid, {
    text: arg === "show"
      ? "Tool call status lines will be shown."
      : "Tool call status lines are hidden (session still saves them).",
  });
}

async function handleBudget(sock: WASocket, jid: string, runtime: AgentRuntime): Promise<void> {
  const report = runtime.budget.report();
  // Strip HTML tags from the budget report (originally formatted for Telegram HTML).
  const plain = formatBudgetReport(report)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  await sock.sendMessage(jid, { text: plain });
}

async function handleHelp(sock: WASocket, jid: string): Promise<void> {
  const lines = [
    "🐾 *OpenPaw Commands*",
    "",
    "!new — Start a new conversation",
    "!sessions — List saved sessions",
    "!resume <n> — Resume session by number",
    "!reasoning show|hide — Toggle reasoning display",
    "!tool_calls show|hide — Toggle tool call display",
    "!budget — Show today's token usage",
    "!help — Show this help message",
    "",
    "Any other message is sent to the AI agent.",
  ];
  await sock.sendMessage(jid, { text: lines.join("\n") });
}
