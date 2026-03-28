/**
 * A messaging channel (Telegram, WhatsApp, etc.) that runs until stopped.
 */
export type ChannelAdapter = {
  readonly id: string;
  /** Runs until the channel stops (e.g. long polling ends). Normally does not resolve. */
  run: () => Promise<void>;
};
