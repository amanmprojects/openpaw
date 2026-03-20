import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

export async function testApiConnection(
  baseUrl: string,
  apiKey: string,
  modelId: string
): Promise<boolean> {
  const provider = createOpenAICompatible({
    baseURL: baseUrl.replace(/\/$/, ''),
    name: 'test-provider',
    apiKey
  });

  try {
    await generateText({
      model: provider.chatModel(modelId),
      prompt: 'Hi',
      abortSignal: AbortSignal.timeout(30000)
    });
    
    return true;
  } catch (error) {
    const err = error as Error;
    throw new Error(`API test failed: ${err.message}`);
  }
}

export function createProvider(config: {
  baseUrl: string;
  name?: string;
  apiKey: string;
}): ReturnType<typeof createOpenAICompatible> {
  const providerConfig = {
    baseURL: config.baseUrl.replace(/\/$/, ''),
    name: config.name || 'custom-provider',
    apiKey: config.apiKey,
  };

  return createOpenAICompatible(providerConfig);
}
