export type ProviderType = 'openai-compatible' | 'gemini' | 'anthropic';

export interface ProviderConfig {
  type?: ProviderType;
  baseUrl: string;
  apiKey: string;
  api?: string;
  models: ModelConfig[];
}

export interface ModelConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: string[];
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface OpenPawConfig {
  currentWorkspace: string;
  ownerTelegramId: string | null;
  models: {
    mode: 'merge' | 'replace';
    providers: Record<string, ProviderConfig>;
  };
  channels: Record<string, ChannelConfig>;
}

export interface ChannelConfig {
  enabled: boolean;
  botToken?: string;
  sessionSuffix?: string;
  [key: string]: unknown;
}
