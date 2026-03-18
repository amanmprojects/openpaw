import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

export async function testApiConnection(baseUrl, apiKey, modelId) {
  const provider = createOpenAICompatible({
    baseURL: baseUrl.replace(/\/$/, ''),
    name: 'test-provider',
    apiKey
  });

  try {
    await generateText({
      model: provider.chatModel(modelId),
      prompt: 'Hi',
      maxTokens: 1,
      abortSignal: AbortSignal.timeout(10000)
    });
    
    return true;
  } catch (error) {
    throw new Error(`API test failed: ${error.message}`);
  }
}
