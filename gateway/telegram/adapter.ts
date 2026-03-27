/**
 * Telegram channel for the OpenPaw gateway: wires a grammy `Bot` to gateway
 * commands, per-chat message serialization, chat preferences, and streaming
 * assistant replies via `deliverStreamingReply` and `runtime.runTurn`.
 *
 * Exports `createTelegramChannelAdapter` for the multi-channel gateway and
 * `runTelegramGateway` as a standalone long-polling entrypoint.
 */
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
import {
  firstCommandToken,
  shouldForwardTextToAgent,
  shouldReportUnknownOpenPawSlashCommand,
} from "./reserved-command-filter";
import { formatAvailableOpenPawSlashCommandsForUser } from "../slash-command-tokens";
import { replyWithSessionsList } from "./sessions-list-reply";
import { telegramSessionKey } from "./session-key";
import { listTelegramSessionsForChat } from "./session-file-discovery";
import { formatTelegramSessionLabel } from "./session-label";
import {
  getTelegramChatPreferences,
  setTelegramChatPreferences,
} from "./chat-preferences";
import { deliverStreamingReply } from "./stream-delivery";

/**
 * Registers Telegram handlers: session management (`/new`, `/sessions`, `/resume`),
 * display prefs (`/reasoning`, `/tool_calls`), sandbox (`/sandbox on|off`),
 * unknown OpenPaw slash-command help,
 * and plain text forwarded to the agent. Work for each chat/topic is serialized
 * through the per-key message queue.
 */
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

  bot.command("reasoning", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(grammyCtx);
    await runNext(queueKey, async () => {
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
    await runNext(queueKey, async () => {
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
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot.command("sandbox", async (grammyCtx) => {
    const chatId = grammyCtx.chat?.id;
    if (chatId === undefined) {
      return;
    }
    const queueKey = telegramSessionKey(grammyCtx);
    await runNext(queueKey, async () => {
      try {
        const arg = String(grammyCtx.match ?? "").trim().toLowerCase();
        if (arg !== "on" && arg !== "off") {
          await grammyCtx.reply("Usage: /sandbox on — or — /sandbox off");
          return;
        }
        const sandboxRestricted = arg === "on";
        await setTelegramChatPreferences(chatId, { sandboxRestricted });
        if (sandboxRestricted) {
          await grammyCtx.reply(
            "Filesystem sandbox is on: file_editor and bash are limited to the workspace.",
          );
        } else {
          await grammyCtx.reply(
            "Filesystem sandbox is off. The agent can read/write outside the workspace and run shell commands with cwd in your home directory. Use only if you trust this chat.",
          );
        }
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
    await runNext(queueKey, async () => {
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
        const label = formatTelegramSessionLabel(chosen.sessionId, chatId);
        await grammyCtx.reply(`Resumed session ${n} (${label}).`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await grammyCtx.reply(`OpenPaw error: ${msg}`);
      }
    });
  });

  bot
    .on("message:text")
    .filter(shouldReportUnknownOpenPawSlashCommand, async (grammyCtx) => {
      const chatId = grammyCtx.chat?.id;
      if (chatId === undefined) {
        return;
      }
      const text = grammyCtx.message.text ?? "";
      const queueKey = telegramSessionKey(grammyCtx);
      const token = firstCommandToken(text) ?? "/?";
      const available = formatAvailableOpenPawSlashCommandsForUser();
      await runNext(queueKey, async () => {
        await grammyCtx.reply(
          `Unknown command ${token}. Available: ${available}.`,
        );
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

    const persistenceId = await getTelegramPersistenceSessionId(chatId);
    const prefs = await getTelegramChatPreferences(chatId);

    await runNext(queueKey, async () => {
      try {
        await deliverStreamingReply(grammyCtx, prefs, async (handlers) => {
          await runtime.runTurn({
            sessionId: persistenceId,
            userText: text,
            sandboxRestricted: prefs.sandboxRestricted,
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

/**
 * Builds a {@link ChannelAdapter} that starts the Telegram bot with registered
 * commands and long polling. Requires `channels.telegram.botToken` in config.
 */
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
