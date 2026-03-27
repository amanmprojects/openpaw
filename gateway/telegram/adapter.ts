import { Bot, InlineKeyboard } from "grammy";
import { createGatewayContext, type OpenPawGatewayContext } from "../bootstrap";
import type { ChannelAdapter } from "../channel-adapter";
import {
  getTelegramPersistenceSessionId,
  setActiveTelegramSession,
  startNewTelegramThread,
} from "./active-thread-store";
import { createTelegramMessageQueue } from "./message-queue";
import { registerOpenPawBotCommands } from "./bot-commands";
import { restAfterCommand, shouldForwardTextToAgent } from "./reserved-command-filter";
import { replyWithSessionsList } from "./sessions-list-reply";
import { telegramSessionKey } from "./session-key";
import { listTelegramSessionsForChat } from "./session-file-discovery";
import { formatTelegramSessionLabel } from "./session-label";
import {
  getTelegramChatPreferences,
  setTelegramChatPreferences,
} from "./chat-preferences";
import { deliverStreamingReply } from "./stream-delivery";
import {
  registerApprovalResponder,
  resolveApproval,
  type ApprovalRequest,
} from "../approval-gate";
import { createTokenBudget, formatBudgetReport } from "../../agent/token-budget";

/** Callback data prefix for inline approval buttons. */
const APPROVAL_YES_PREFIX = "approve:yes:";
const APPROVAL_NO_PREFIX = "approve:no:";

/**
 * Builds an inline keyboard with Approve / Deny buttons for a given approval request.
 */
function buildApprovalKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Approve", `${APPROVAL_YES_PREFIX}${requestId}`)
    .text("❌ Deny", `${APPROVAL_NO_PREFIX}${requestId}`);
}

/**
 * Sends an approval prompt to the Telegram chat identified by chatId and
 * registers a one-shot callback listener for the Yes/No response.
 */
function wireApprovalResponder(bot: Bot, chatId: number): void {
  registerApprovalResponder(async (req: ApprovalRequest) => {
    const keyboard = buildApprovalKeyboard(req.id);
    try {
      await bot.api.sendMessage(
        chatId,
        `⚠️ <b>OpenPaw approval needed</b>\n\n` +
          `<b>Tool:</b> <code>${req.tool}</code>\n` +
          `<b>Action:</b>\n${req.description}`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (e) {
      console.warn("OpenPaw: failed to send approval prompt", e);
    }
  });
}

function wireTelegramBot(bot: Bot, ctx: OpenPawGatewayContext): void {
  const { runtime } = ctx;
  const runNext = createTelegramMessageQueue();

  // Initialise budget reporter (reads from config; 0 = unlimited).
  const budget = createTokenBudget({
    dailyLimitTokens: ctx.config.budget?.dailyLimitTokens ?? 0,
    fallbackModel: ctx.config.budget?.fallbackModel,
  });

  // Handle inline button callbacks for approval requests.
  bot.on("callback_query:data", async (grammyCtx) => {
    const data = grammyCtx.callbackQuery.data;
    if (data.startsWith(APPROVAL_YES_PREFIX)) {
      const id = data.slice(APPROVAL_YES_PREFIX.length);
      const found = resolveApproval(id, true);
      await grammyCtx.answerCallbackQuery({ text: found ? "✅ Approved" : "Already resolved" });
      if (found) {
        await grammyCtx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      }
    } else if (data.startsWith(APPROVAL_NO_PREFIX)) {
      const id = data.slice(APPROVAL_NO_PREFIX.length);
      const found = resolveApproval(id, false);
      await grammyCtx.answerCallbackQuery({ text: found ? "❌ Denied" : "Already resolved" });
      if (found) {
        await grammyCtx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      }
    }
  });

  // /budget — show today's token usage
  bot.command("budget", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) return;
    const queueKey = telegramSessionKey(grammyCtx);
    await runNext(queueKey, async () => {
      try {
        const report = budget.report();
        await grammyCtx.reply(formatBudgetReport(report), { parse_mode: "HTML" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("new", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(grammyCtx);
    await runNext(queueKey, async () => {
      try {
        await startNewTelegramThread(chatId);
        await grammyCtx.reply("Started a new conversation.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("sessions", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(grammyCtx);
    await runNext(queueKey, async () => {
      try {
        await replyWithSessionsList(grammyCtx, chatId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("reasoning", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(grammyCtx);
    const text = grammyCtx.message?.text ?? "";
    await runNext(queueKey, async () => {
      try {
        const arg = restAfterCommand(text).toLowerCase();
        if (arg !== "show" && arg !== "hide") {
          await grammyCtx.reply("Usage: /reasoning show — or — /reasoning hide");
          return;
        }
        const showReasoning = arg === "show";
        await setTelegramChatPreferences(chatId, { showReasoning });
        await grammyCtx.reply(
          showReasoning
            ? "Reasoning will appear as separate messages."
            : "Reasoning messages are hidden (session still saves them).",
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("tool_calls", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(grammyCtx);
    const text = grammyCtx.message?.text ?? "";
    await runNext(queueKey, async () => {
      try {
        const arg = restAfterCommand(text).toLowerCase();
        if (arg !== "show" && arg !== "hide") {
          await grammyCtx.reply("Usage: /tool_calls show — or — /tool_calls hide");
          return;
        }
        const showToolCalls = arg === "show";
        await setTelegramChatPreferences(chatId, { showToolCalls });
        await grammyCtx.reply(
          showToolCalls
            ? "Tool call status lines will be shown."
            : "Tool call status lines are hidden (session still saves them).",
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("resume", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(grammyCtx);
    const text = grammyCtx.message?.text ?? "";
    await runNext(queueKey, async () => {
      try {
        const arg = restAfterCommand(text);
        if (!/^\d+$/.test(arg)) {
          await grammyCtx.reply("Usage: /resume 1 — use /sessions to see numbers.");
          return;
        }
        const n = Number.parseInt(arg, 10);
        if (n < 1) {
          await grammyCtx.reply("Usage: /resume 1 — use /sessions to see numbers.");
          return;
        }
        const entries = await listTelegramSessionsForChat(chatId);
        if (entries.length === 0) {
          await grammyCtx.reply("No saved sessions yet.");
          return;
        }
        if (n > entries.length) {
          await grammyCtx.reply(`No session ${n}. Run /sessions (1–${entries.length}).`);
          return;
        }
        const chosen = entries[n - 1]!;
        await setActiveTelegramSession(chatId, chosen.sessionId);
        const label = formatTelegramSessionLabel(chosen.sessionId, chatId);
        await grammyCtx.reply(`Resumed session ${n} (${label}).`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.on("message:text").filter(shouldForwardTextToAgent, async (grammyCtx) => {
    const text = grammyCtx.message.text;
    if (!text?.trim()) {
      return;
    }

    const queueKey = telegramSessionKey(grammyCtx);
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }

    // Wire the approval responder to the current chat so approval prompts go
    // to the right user.  This is called on every message so group chats work
    // correctly (last active user's chat receives the prompt).
    wireApprovalResponder(bot, chatId);

    const persistenceId = await getTelegramPersistenceSessionId(chatId);
    const prefs = await getTelegramChatPreferences(chatId);

    await runNext(queueKey, async () => {
      try {
        await deliverStreamingReply(grammyCtx, prefs, async (handlers) => {
          await runtime.runTurn({
            sessionId: persistenceId,
            userText: text,
            onTextDelta: handlers.onTextDelta,
            onReasoningDelta: handlers.onReasoningDelta,
            onToolStatus: handlers.onToolStatus,
          });
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          await grammyCtx.reply(`OpenPaw error: ${msg}`);
        } catch {
          // ignore double failure
        }
      }
    });
  });
}

export function createTelegramChannelAdapter(ctx: OpenPawGatewayContext): ChannelAdapter {
  const token = ctx.config.channels?.telegram?.botToken;
  if (!token) {
    throw new Error(
      "Telegram bot token missing. Add channels.telegram.botToken to ~/.openpaw/config.yaml",
    );
  }

  return {
    id: "telegram",
    run: async () => {
      const bot = new Bot(token);
      await registerOpenPawBotCommands(bot);
      wireTelegramBot(bot, ctx);
      console.log("OpenPaw Telegram channel starting (long polling)…");
      await bot.start();
    },
  };
}

/**
 * Run only the Telegram channel (single-adapter entrypoint).
 */
export async function runTelegramGateway(): Promise<void> {
  const ctx = await createGatewayContext();
  await createTelegramChannelAdapter(ctx).run();
}
