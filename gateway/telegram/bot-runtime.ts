/**
 * Telegram channel runtime wiring: commands, serialization, and forwarding to the agent runtime.
 */
import { Bot } from "grammy";
import { logError, logInfo } from "../../lib/log";
import { createGatewayContext, type OpenPawGatewayContext } from "../bootstrap";
import type { ChannelAdapter } from "../channel-adapter";
import { formatAvailableOpenPawSlashCommandsForUser } from "../slash-command-tokens";
import {
  getTelegramPersistenceSessionId,
  setActiveTelegramSession,
  startNewTelegramThread,
} from "./active-thread-store";
import {
  getTelegramChatPreferences,
  setTelegramChatPreferences,
} from "./chat-preferences";
import { registerOpenPawBotCommands } from "./bot-commands";
import { createTelegramMessageQueue } from "./message-queue";
import {
  firstCommandToken,
  shouldForwardTextToAgent,
  shouldReportUnknownOpenPawSlashCommand,
} from "./reserved-command-filter";
import { listTelegramSessionsForChat } from "./session-file-discovery";
import { formatTelegramSessionLabel } from "./session-label";
import { replyWithSessionsList } from "./sessions-list-reply";
import { telegramSessionKey } from "./session-key";
import { deliverStreamingReply } from "./stream-delivery";
import { startCronSchedulerIfEnabled } from "../cron/scheduler";

/**
 * Registers Telegram handlers for commands and plain-text forwarding.
 *
 * @param runSerialized Per-chat async queue; shared with the cron scheduler when provided from the adapter.
 */
export function wireTelegramBot(
  bot: Bot,
  ctx: OpenPawGatewayContext,
  runSerialized: ReturnType<typeof createTelegramMessageQueue>,
): void {
  const { runtime } = ctx;
  const runNext = runSerialized;

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
        await grammyCtx.reply(`OpenPaw error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });

  bot.command("sessions", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    await runNext(telegramSessionKey(grammyCtx), async () => {
      try {
        await replyWithSessionsList(grammyCtx, chatId);
      } catch (e) {
        await grammyCtx.reply(`OpenPaw error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });

  bot.command("reasoning", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    await runNext(telegramSessionKey(grammyCtx), async () => {
      try {
        const arg = String(grammyCtx.match ?? "").trim().toLowerCase();
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
        await grammyCtx.reply(`OpenPaw error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });

  bot.command("tool_calls", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    await runNext(telegramSessionKey(grammyCtx), async () => {
      try {
        const arg = String(grammyCtx.match ?? "").trim().toLowerCase();
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
        await grammyCtx.reply(`OpenPaw error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });

  bot.command("sandbox", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    await runNext(telegramSessionKey(grammyCtx), async () => {
      try {
        const arg = String(grammyCtx.match ?? "").trim().toLowerCase();
        if (arg !== "on" && arg !== "off") {
          await grammyCtx.reply("Usage: /sandbox on — or — /sandbox off");
          return;
        }
        const sandboxRestricted = arg === "on";
        const safetyMode = sandboxRestricted ? "workspace_only" : "full_access";
        await setTelegramChatPreferences(chatId, { sandboxRestricted, safetyMode });
        logInfo("telegram.safety_mode_changed", {
          chatId,
          safetyMode,
        });
        await grammyCtx.reply(
          sandboxRestricted
            ? "Filesystem sandbox is on: file_editor and bash are limited to the workspace."
            : "Filesystem sandbox is off. The agent can read/write outside the workspace and run shell commands with cwd in your home directory. Use only if you trust this chat.",
        );
      } catch (e) {
        await grammyCtx.reply(`OpenPaw error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });

  bot.command("resume", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    await runNext(telegramSessionKey(grammyCtx), async () => {
      try {
        const arg = String(grammyCtx.match ?? "").trim();
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
        const label = formatTelegramSessionLabel(chosen.sessionId, chatId, chosen.title);
        await grammyCtx.reply(`Resumed session ${n} (${label}).`);
      } catch (e) {
        await grammyCtx.reply(`OpenPaw error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });

  bot.on("message:text").filter(shouldReportUnknownOpenPawSlashCommand, async (grammyCtx) => {
    const text = grammyCtx.message.text ?? "";
    const token = firstCommandToken(text) ?? "/?";
    await runNext(telegramSessionKey(grammyCtx), async () => {
      await grammyCtx.reply(
        `Unknown command ${token}. Available: ${formatAvailableOpenPawSlashCommandsForUser()}.`,
      );
    });
  });

  bot.on("message:text").filter(shouldForwardTextToAgent, async (grammyCtx) => {
    const text = grammyCtx.message.text;
    const chatId = grammyCtx.chat?.id;
    if (!text?.trim() || chatId === undefined) {
      return;
    }

    const queueKey = telegramSessionKey(grammyCtx);
    const persistenceId = await getTelegramPersistenceSessionId(chatId);
    const prefs = await getTelegramChatPreferences(chatId);

    await runNext(queueKey, async () => {
      try {
        await deliverStreamingReply(grammyCtx, prefs, async (handlers) => {
          await runtime.runTurn({
            sessionId: persistenceId,
            userText: text,
            surface: "telegram",
            sandboxRestricted: prefs.sandboxRestricted,
            safetyMode: prefs.safetyMode,
            onTextDelta: handlers.onTextDelta,
            onReasoningDelta: handlers.onReasoningDelta,
            onToolStatus: handlers.onToolStatus,
          });
        });
      } catch (e) {
        logError("telegram.turn_failed", {
          chatId,
          sessionId: persistenceId,
          error: e instanceof Error ? e.message : String(e),
        });
        try {
          await grammyCtx.reply(`OpenPaw error: ${e instanceof Error ? e.message : String(e)}`);
        } catch {
          // ignore secondary failure
        }
      }
    });
  });
}

/**
 * Builds the Telegram channel adapter.
 */
export function createTelegramChannelAdapter(ctx: OpenPawGatewayContext): ChannelAdapter {
  const token = ctx.config.channels?.telegram?.botToken;
  if (!token) {
    throw new Error(
      "Telegram bot token missing. Add channels.telegram.botToken to ~/.openpaw/config.yaml",
    );
  }

  const runSerialized = createTelegramMessageQueue();

  return {
    id: "telegram",
    run: async () => {
      const bot = new Bot(token);
      await registerOpenPawBotCommands(bot);
      wireTelegramBot(bot, ctx, runSerialized);
      startCronSchedulerIfEnabled(ctx, bot, runSerialized);
      logInfo("telegram.channel_starting", { mode: "long_polling" });
      await bot.start();
    },
  };
}

/**
 * Runs the standalone Telegram gateway entrypoint.
 */
export async function runTelegramGateway(): Promise<void> {
  const ctx = await createGatewayContext();
  await createTelegramChannelAdapter(ctx).run();
}
