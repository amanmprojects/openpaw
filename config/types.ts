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
 * Full OpenPaw user configuration as represented on disk and in the onboarding flow.
 */
export interface OpenPawConfig {
  provider: ProviderConfig;
  channels?: ChannelsConfig;
  personality: Personality;
}
