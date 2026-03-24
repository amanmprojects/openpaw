import { Bot } from "grammy";
import { createAgentRuntime } from "../agent/agent";
import { ensureWorkspaceLayout } from "../agent/workspace-bootstrap";
import { getWorkspaceRoot } from "../config/paths";
import { loadConfig } from "../config/storage";
import { telegramSessionKey } from "./session-key";
import { deliverStreamingReply } from "./stream-delivery";

function createSessionQueue() {
  const chains = new Map<string, Promise<unknown>>();

  return function runSerialized<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const prev = chains.get(sessionId) ?? Promise.resolve();
    const result = prev.then(() => task());
    chains.set(
      sessionId,
      result.then(
        () => {},
        () => {},
      ),
    );
    return result;
  };
}

/**
 * Long-polling Telegram gateway: one OpenPaw session per chat, agent runs with streaming delivery.
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
  const runNext = createSessionQueue();

  const bot = new Bot(token);

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (!text?.trim()) {
      return;
    }

    const sessionId = telegramSessionKey(ctx);

    await runNext(sessionId, async () => {
      try {
        await deliverStreamingReply(ctx, async (push) => {
          await runtime.runTurn({
            sessionId,
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
