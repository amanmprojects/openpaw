import { Runtime } from '../runtime/index.mjs';
import { TUIChannel } from '../channels/tui/index.mjs';
import { render } from 'ink';
import React from 'react';
import { App } from '../channels/tui/app.mjs';

export async function startTUI() {
  const runtime = new Runtime();
  await runtime.init();

  // Create and start TUI channel
  const tuiChannel = new TUIChannel({ enabled: true });
  await tuiChannel.start(runtime);

  // Replace the default channels with just TUI for this session
  runtime.channels = [tuiChannel];

  // Also start any other channels (like Telegram) if enabled
  const { readConfig } = await import('../services/config.mjs');
  const config = await readConfig();
  const { loadChannel } = await import('../channels/registry.mjs');

  for (const [name, channelConfig] of Object.entries(config.channels || {})) {
    if (channelConfig.enabled && name !== 'tui') {
      try {
        const channel = await loadChannel(name, channelConfig);
        await channel.start(runtime);
        runtime.channels.push(channel);
        console.log(`[TUI] Started channel: ${name}`);
      } catch (err) {
        console.error(`[TUI] Failed to start channel ${name}:`, err.message);
      }
    }
  }

  // Render Ink app
  const { unmount } = render(React.createElement(App, { runtime, tuiChannel }));

  // Handle cleanup
  process.on('SIGINT', async () => {
    unmount();
    await runtime.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    unmount();
    await runtime.stop();
    process.exit(0);
  });
}
