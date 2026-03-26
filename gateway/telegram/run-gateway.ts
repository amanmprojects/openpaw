import { Bot } from "grammy";
import { createAgentRuntime } from "../../agent/agent";
import { ensureWorkspaceLayout } from "../../agent/workspace-bootstrap";
import { getWorkspaceRoot } from "../../config/paths";
import { loadConfig } from "../../config/storage";
import {
  getTelegramPersistenceSessionId,
  setActiveTelegramSession,
  startNewTelegramThread,
} from "./active-thread-store";
import { createTelegramMessageQueue } from "./message-queue";
import { restAfterCommand, shouldForwardTextToAgent } from "./reserved-command-filter";
import { replyWithSessionsList } from "./sessions-list-reply";
import { telegramSessionKey } from "./session-key";
import { listTelegramSessionsForChat } from "./session-file-discovery";
import { formatTelegramSessionLabel } from "./session-label";
import { deliverStreamingReply } from "./stream-delivery";

/**
 * Long-polling Telegram gateway: one OpenPaw session per chat (with optional threads), agent runs with streaming delivery.
 */
export async function runTelegramGateway(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    throw new Error("Config not found. Run `openpaw onboard` first.");
  }
  const token = config.channels?.telegram?.botToken;
  if (!token) {
    throw new Error("Telegram bot token missing. Add channels.telegram.botToken to ~/.openpaw/config.yaml");
  }

  ensureWorkspaceLayout();
  const workspacePath = getWorkspaceRoot();
  const runtime = createAgentRuntime(config, workspacePath);
  const runNext = createTelegramMessageQueue();

  const bot = new Bot(token);

  try {
    await bot.api.setMyCommands([
      { command: "new", description: "Start a fresh conversation" },
      { command: "sessions", description: "List saved sessions for this chat" },
      { command: "resume", description: "Resume a session by number from /sessions" },
    ]);
  } catch {
    // menu is optional if the API call fails
  }

  bot.command("new", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(ctx);
    await runNext(queueKey, async () => {
      try {
        await startNewTelegramThread(chatId);
        await ctx.reply("Started a new conversation.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ctx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("sessions", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(ctx);
    await runNext(queueKey, async () => {
      try {
        await replyWithSessionsList(ctx, chatId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ctx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("resume", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(ctx);
    const text = ctx.message?.text ?? "";
    await runNext(queueKey, async () => {
      try {
        const arg = restAfterCommand(text);
        if (!/^\d+$/.test(arg)) {
          await ctx.reply("Usage: /resume 1 — use /sessions to see numbers.");
          return;
        }
        const n = Number.parseInt(arg, 10);
        if (n < 1) {
          await ctx.reply("Usage: /resume 1 — use /sessions to see numbers.");
          return;
        }
        const entries = await listTelegramSessionsForChat(chatId);
        if (entries.length === 0) {
          await ctx.reply("No saved sessions yet.");
          return;
        }
        if (n > entries.length) {
          await ctx.reply(`No session ${n}. Run /sessions (1–${entries.length}).`);
          return;
        }
        const chosen = entries[n - 1]!;
        await setActiveTelegramSession(chatId, chosen.sessionId);
        const label = formatTelegramSessionLabel(chosen.sessionId, chatId);
        await ctx.reply(`Resumed session ${n} (${label}).`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ctx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.on("message:text").filter(shouldForwardTextToAgent, async (ctx) => {
    const text = ctx.message.text;
    if (!text?.trim()) {
      return;
    }

    const queueKey = telegramSessionKey(ctx);
    const chatId = ctx.chat?.id;
    const persistenceId =
      chatId !== undefined ? await getTelegramPersistenceSessionId(chatId) : queueKey;

    await runNext(queueKey, async () => {
      try {
        await deliverStreamingReply(ctx, async (push) => {
          await runtime.runTurn({
            sessionId: persistenceId,
            userText: text,
            onTextDelta: push,
          });
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          await ctx.reply(`OpenPaw error: ${msg}`);
        } catch {
          // ignore double failure
        }
      }
    });
  });

  console.log("OpenPaw Telegram gateway starting (long polling)…");
  await bot.start();
}
