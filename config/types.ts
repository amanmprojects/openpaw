/**
 * LLM provider settings used for API calls.
 */
export interface ProviderConfig {
  /** Base URL of the provider API (e.g. OpenAI-compatible endpoint). */
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Optional integrations for outbound channels (e.g. Telegram bot).
 */
export interface ChannelsConfig {
  /** When set, enables Telegram with this bot token. */
  telegram?: {
    botToken: string;
  };
}

/**
 * Ordered list of personality labels shown in onboarding and persisted to `config.yaml`.
 * Each value is written as the `personality` string field.
 */
export const PERSONALITIES = ["Assistant", "Meowl", "Coder"] as const;

/** One of the allowed `personality` values stored in config. */
export type Personality = (typeof PERSONALITIES)[number];

/**
 * Optional gateway cron scheduler settings (persisted in `config.yaml`).
 */
export interface CronConfig {
  /** When false, the gateway does not start the cron tick loop. Defaults to true when omitted. */
  enabled?: boolean;
  /** Seconds between due-job checks (default 60). */
  tickSeconds?: number;
  /** Upper bound on overlapping cron executions (default 2). */
  maxConcurrentRuns?: number;
  /** Max lines to keep per job run log before truncating from the start (default 5000). */
  maxRunLogLines?: number;
}

/**
 * Full OpenPaw user configuration as represented on disk and in the onboarding flow.
 */
export interface OpenPawConfig {
  provider: ProviderConfig;
  channels?: ChannelsConfig;
  personality: Personality;
  cron?: CronConfig;
}
