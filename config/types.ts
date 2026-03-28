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
 * Optional integrations for outbound channels (Telegram, WhatsApp, etc.).
 */
export interface ChannelsConfig {
  /** When set, enables Telegram with this bot token. */
  telegram?: {
    botToken: string;
  };
  /** When `enabled` is true, starts the WhatsApp channel via Baileys (QR code pairing). */
  whatsapp?: {
    enabled: boolean;
  };
}

/**
 * Optional token budget settings. When set, the agent tracks daily token
 * usage and falls back to a local model when the cap is reached.
 */
export interface BudgetConfig {
  /** Maximum tokens allowed per calendar day (UTC). 0 = unlimited. */
  dailyLimitTokens: number;
  /**
   * Local Ollama model to fall back to when the budget is exhausted.
   * Example: "ollama/llama3" — requires Ollama running on localhost:11434.
   */
  fallbackModel?: string;
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
  /** Optional daily token cap and fallback model. */
  budget?: BudgetConfig;
}
