import { OpenAICompatibleProvider } from './openai-compatible/index.js';
import type { ProviderAdapter } from '../types/provider.js';
import type { ProviderConfig } from '../types/config.js';

const BUILT_IN_PROVIDERS: Record<string, new (id: string, config: ProviderConfig) => ProviderAdapter> = {
  'openai-compatible': OpenAICompatibleProvider,
};

export async function loadProvider(
  providerId: string,
  config: ProviderConfig
): Promise<ProviderAdapter> {
  const providerType = config.type || 'openai-compatible';
  const ProviderConstructor = BUILT_IN_PROVIDERS[providerType];

  if (!ProviderConstructor) {
    throw new Error(
      `Unknown provider type: ${providerType}. Available: ${Object.keys(BUILT_IN_PROVIDERS).join(', ')}`
    );
  }

  return new ProviderConstructor(providerId, config);
}

export async function loadProviders(
  providersConfig: Record<string, ProviderConfig>
): Promise<Map<string, ProviderAdapter>> {
  const providers = new Map<string, ProviderAdapter>();

  for (const [providerId, config] of Object.entries(providersConfig)) {
    const provider = await loadProvider(providerId, config);
    providers.set(providerId, provider);
  }

  return providers;
}

export function getAvailableProviderTypes(): string[] {
  return Object.keys(BUILT_IN_PROVIDERS);
}
