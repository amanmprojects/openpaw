import { Gateway } from '../gateway/index.js';
import { TUIChannel } from '../channels/tui/index.js';
import { render } from 'ink';
import React from 'react';
import { App } from '../channels/tui/app.js';
import { readConfig } from '../services/config.js';
import { loadChannel } from '../channels/registry.js';
import { isGatewayRunning } from '../services/gateway-process.js';
import type { ChannelConfig } from '../types/index.js';

export async function startTUI(): Promise<void> {
  const { running: gatewayRunning } = await isGatewayRunning();
  
  const gateway = new Gateway();
  await gateway.init();

  const tuiChannel = new TUIChannel({ enabled: true });
  await tuiChannel.start(gateway);

  gateway.channels = [tuiChannel];

  const config = await readConfig();
  const channels = config.channels || {};

  for (const [name, channelConfig] of Object.entries(channels)) {
    const chConfig = channelConfig as ChannelConfig;
    if (chConfig.enabled && name !== 'tui') {
      if (name === 'telegram' && gatewayRunning) {
        console.log('[TUI] Skipping Telegram channel - gateway daemon is running');
        console.log('[TUI] Use "openpaw gateway stop" to run Telegram in TUI mode');
        continue;
      }
      try {
        const channel = await loadChannel(name, chConfig);
        await channel.start(gateway);
        gateway.channels.push(channel);
        console.log(`[TUI] Started channel: ${name}`);
      } catch (err) {
        const error = err as Error;
        console.error(`[TUI] Failed to start channel ${name}:`, error.message);
      }
    }
  }

  const { unmount } = render(React.createElement(App, { gateway, tuiChannel }));

  process.on('SIGINT', async () => {
    unmount();
    await gateway.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    unmount();
    await gateway.stop();
    process.exit(0);
  });
}
