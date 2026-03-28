import { createGatewayContext, type OpenPawGatewayContext } from "./bootstrap";
import type { ChannelAdapter } from "./channel-adapter";
import { createTelegramChannelAdapter } from "./telegram/adapter";
import { createWhatsAppChannelAdapter } from "./whatsapp/adapter";
import { createHeartbeatScheduler } from "../scheduler/heartbeat-scheduler";
import { startDashboardServer } from "../dashboard/server";

/**
 * Build all messaging adapters that are activated by the current config.
 */
export function createMessagingChannelAdapters(ctx: OpenPawGatewayContext): ChannelAdapter[] {
  const adapters: ChannelAdapter[] = [];

  const telegramToken = ctx.config.channels?.telegram?.botToken;
  if (telegramToken) {
    adapters.push(createTelegramChannelAdapter(ctx));
  }

  const whatsappEnabled = ctx.config.channels?.whatsapp?.enabled;
  if (whatsappEnabled) {
    adapters.push(createWhatsAppChannelAdapter(ctx));
  }

  return adapters;
}

/**
 * Start every configured messaging adapter in parallel (shared `AgentRuntime`).
 * Also starts the heartbeat scheduler, wiring its outbound sender to the first
 * available Telegram chat (proactive messages use the same bot token).
 */
export async function runGatewayMessagingChannels(ctx: OpenPawGatewayContext): Promise<void> {
  const adapters = createMessagingChannelAdapters(ctx);
  if (adapters.length === 0) {
    throw new Error(
      "No messaging channels configured. Add channels.telegram.botToken or channels.whatsapp.enabled to ~/.openpaw/config.yaml",
    );
  }

  // Start heartbeat scheduler.  Proactive messages are sent via the Telegram
  // bot API without a grammy Context, so we call sendMessage directly.
  const telegramToken = ctx.config.channels?.telegram?.botToken;
  if (telegramToken) {
    const scheduler = createHeartbeatScheduler(ctx.runtime, ctx.workspacePath);

    // We need a chatId to push proactive messages.  Read from environment or
    // fall back to the first active thread if the env var isn't set.
    const proactiveChatId = process.env.OPENPAW_HEARTBEAT_CHAT_ID
      ? Number(process.env.OPENPAW_HEARTBEAT_CHAT_ID)
      : null;

    if (proactiveChatId) {
      const { Bot } = await import("grammy");
      const bot = new Bot(telegramToken);

      scheduler.start(async (text) => {
        try {
          await bot.api.sendMessage(proactiveChatId, text);
        } catch (e) {
          console.warn("[heartbeat] Failed to send proactive message:", e);
        }
      });

      // Clean up on process exit.
      process.on("SIGINT", () => scheduler.stop());
      process.on("SIGTERM", () => scheduler.stop());
    } else {
      console.warn(
        "[heartbeat] OPENPAW_HEARTBEAT_CHAT_ID not set. " +
          "Proactive heartbeat messages are disabled. " +
          "Set this env var to your Telegram chat ID to enable them.",
      );
    }
  }

  console.log(`OpenPaw gateway starting: ${adapters.map((a) => a.id).join(", ")}`);
  await Promise.all(adapters.map((a) => a.run()));
}

/**
 * Bootstrap and run all messaging channels.
 */
export async function startGateway(): Promise<void> {
  const ctx = await createGatewayContext();
  
  // Start the web dashboard.
  const dashboard = startDashboardServer();
  process.on("SIGINT", () => dashboard.stop());
  process.on("SIGTERM", () => dashboard.stop());

  await runGatewayMessagingChannels(ctx);
}
