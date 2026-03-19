import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { getTools } from './tools.mjs';

export class PsiAgent {
  constructor(config) {
    this.config = config;
    this.providers = new Map();
    this.defaultModel = null;
  }

  initProviders() {
    if (!this.config.models?.providers) return;

    for (const [providerId, providerConfig] of Object.entries(this.config.models.providers)) {
      const provider = createOpenAICompatible({
        baseURL: providerConfig.baseUrl.replace(/\/$/, ''),
        name: providerId,
        apiKey: providerConfig.apiKey,
      });
      this.providers.set(providerId, {
        provider,
        models: providerConfig.models,
      });
    }

    // Set default to first available model
    const first = this.providers.values().next().value;
    if (first && first.models.length > 0) {
      this.defaultModel = `${first.models[0].id}`;
    }
  }

  getModel(modelId) {
    if (!modelId) modelId = this.defaultModel;

    for (const [providerId, data] of this.providers) {
      const model = data.models.find(m => m.id === modelId);
      if (model) {
        return data.provider.chatModel(modelId);
      }
    }

    throw new Error(`Model not found: ${modelId}`);
  }

  async generate(messages, systemPrompt, options = {}) {
    const model = this.getModel(options.modelId);
    const tools = getTools(options.workspacePath);

    const params = {
      model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: options.maxSteps || 10,
    };

    if (options.maxTokens) {
      params.maxTokens = options.maxTokens;
    }

    return generateText(params);
  }

  getAvailableModels() {
    const models = [];
    for (const [providerId, data] of this.providers) {
      for (const model of data.models) {
        models.push({
          id: model.id,
          name: model.name || model.id,
          provider: providerId,
          contextWindow: model.contextWindow,
        });
      }
    }
    return models;
  }

  getDefaultModel() {
    return this.defaultModel;
  }
}
