import { TelegramChannel } from './telegram/index.js';
import { TUIChannel } from './tui/index.js';
import type { ChannelConfig, ChannelAdapter } from '../types/index.js';

const BUILT_IN_CHANNELS: Record<string, new (config: ChannelConfig) => ChannelAdapter> = {
  telegram: TelegramChannel,
  tui: TUIChannel,
};

export async function loadChannel(channelName: string, config: ChannelConfig): Promise<ChannelAdapter> {
  const ChannelConstructor = BUILT_IN_CHANNELS[channelName];
  if (!ChannelConstructor) {
    throw new Error(`Unknown channel: ${channelName}. Available: ${Object.keys(BUILT_IN_CHANNELS).join(', ')}`);
  }
  return new ChannelConstructor(config);
}

export async function loadEnabledChannels(channelsConfig: Record<string, ChannelConfig>): Promise<ChannelAdapter[]> {
  const channels: ChannelAdapter[] = [];
  for (const [name, config] of Object.entries(channelsConfig)) {
    if (config.enabled) {
      channels.push(await loadChannel(name, config));
    }
  }
  return channels;
}

export function getAvailableChannels(): string[] {
  return Object.keys(BUILT_IN_CHANNELS);
}
