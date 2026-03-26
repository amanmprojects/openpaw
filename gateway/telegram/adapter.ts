import { Bot } from "grammy";
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
import { deliverStreamingReply } from "./stream-delivery";

function wireTelegramBot(bot: Bot, ctx: OpenPawGatewayContext): void {
  const { runtime } = ctx;
  const runNext = createTelegramMessageQueue();

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
    const persistenceId =
      chatId !== undefined ? await getTelegramPersistenceSessionId(chatId) : queueKey;

    await runNext(queueKey, async () => {
      try {
        await deliverStreamingReply(grammyCtx, async (push) => {
          await runtime.runTurn({
            sessionId: persistenceId,
            userText: text,
            onTextDelta: push,
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
