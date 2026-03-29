/**
 * Messaging channel startup orchestration for the gateway process.
 */
import { createGatewayContext, type OpenPawGatewayContext } from "./bootstrap";
import type { ChannelAdapter } from "./channel-adapter";
import { createTelegramChannelAdapter } from "./telegram/adapter";
import { logInfo } from "../lib/log";

/**
 * Build all messaging adapters that are activated by the current config.
 */
export function createMessagingChannelAdapters(ctx: OpenPawGatewayContext): ChannelAdapter[] {
  const adapters: ChannelAdapter[] = [];

  const telegramToken = ctx.config.channels?.telegram?.botToken;
  if (telegramToken) {
    adapters.push(createTelegramChannelAdapter(ctx));
  }

  return adapters;
}

/**
 * Start every configured messaging adapter in parallel (shared `AgentRuntime`).
 */
export async function runGatewayMessagingChannels(ctx: OpenPawGatewayContext): Promise<void> {
  const adapters = createMessagingChannelAdapters(ctx);
  if (adapters.length === 0) {
    throw new Error(
      "No messaging channels configured. Add e.g. channels.telegram.botToken to ~/.openpaw/config.yaml",
    );
  }

  logInfo("gateway.starting", {
    adapters: adapters.map((adapter) => adapter.id),
  });
  await Promise.all(adapters.map((a) => a.run()));
}

/**
 * Bootstrap and run all messaging channels.
 */
export async function startGateway(): Promise<void> {
  const ctx = await createGatewayContext();
  await runGatewayMessagingChannels(ctx);
}
