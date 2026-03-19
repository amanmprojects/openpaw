import { TelegramChannel } from './telegram/index.mjs';
import { TUIChannel } from './tui/index.mjs';

const BUILT_IN_CHANNELS = {
  telegram: TelegramChannel,
  tui: TUIChannel,
};

export async function loadChannel(channelName, config) {
  const ChannelConstructor = BUILT_IN_CHANNELS[channelName];
  if (!ChannelConstructor) {
    throw new Error(`Unknown channel: ${channelName}. Available: ${Object.keys(BUILT_IN_CHANNELS).join(', ')}`);
  }
  return new ChannelConstructor(config);
}

export async function loadEnabledChannels(channelsConfig) {
  const channels = [];
  for (const [name, config] of Object.entries(channelsConfig)) {
    if (config.enabled) {
      channels.push(await loadChannel(name, config));
    }
  }
  return channels;
}

export function getAvailableChannels() {
  return Object.keys(BUILT_IN_CHANNELS);
}
