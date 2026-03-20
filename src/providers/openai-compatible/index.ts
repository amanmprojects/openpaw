import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import type { ProviderAdapter } from '../../types/provider.js';
import type { ProviderConfig, ModelConfig } from '../../types/config.js';

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly name: string;
  readonly id: string;
  private config: ProviderConfig;
  private provider: ReturnType<typeof createOpenAICompatible>;

  constructor(providerId: string, config: ProviderConfig) {
    this.id = providerId;
    this.name = providerId;
    this.config = config;
    this.provider = createOpenAICompatible({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      name: providerId,
      apiKey: config.apiKey,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chatModel(modelId: string): any {
    return this.provider.chatModel(modelId);
  }

  async test(modelId: string): Promise<boolean> {
    try {
      await generateText({
        model: this.provider.chatModel(modelId),
        prompt: 'Hi',
        abortSignal: AbortSignal.timeout(30000)
      });
      return true;
    } catch (error) {
      const err = error as Error;
      throw new Error(`API test failed: ${err.message}`);
    }
  }

  getModels(): ModelConfig[] {
    return this.config.models;
  }
}

export async function testApiConnection(
  baseUrl: string,
  apiKey: string,
  modelId: string
): Promise<boolean> {
  const provider = new OpenAICompatibleProvider('test-provider', {
    baseUrl,
    apiKey,
    models: []
  });
  return provider.test(modelId);
}
