import { ToolLoopAgent } from 'ai';
import { getTools } from './tools/index.js';
import { loadProviders } from '../providers/registry.js';
import type { OpenPawConfig, StreamCallbacks, ModelInfo } from '../types/index.js';
import type { ProviderAdapter } from '../types/provider.js';

export class PsiAgent {
  private config: OpenPawConfig;
  private providers: Map<string, ProviderAdapter>;
  private defaultModel: string | null;

  constructor(config: OpenPawConfig) {
    this.config = config;
    this.providers = new Map();
    this.defaultModel = null;
  }

  async initProviders(): Promise<void> {
    if (!this.config.models?.providers) return;

    this.providers = await loadProviders(this.config.models.providers);

    const first = this.providers.values().next().value;
    if (first) {
      const models = first.getModels();
      if (models.length > 0) {
        this.defaultModel = `${models[0]!.id}`;
      }
    }
  }

  getModel(modelId?: string) {
    const targetModelId = modelId ?? this.defaultModel;

    for (const [, provider] of this.providers) {
      const models = provider.getModels();
      const model = models.find(m => m.id === targetModelId);
      if (model && targetModelId) {
        return provider.chatModel(targetModelId);
      }
    }

    throw new Error(`Model not found: ${targetModelId}`);
  }

  async stream(
    messages: unknown[],
    systemPrompt: string,
    options: { modelId?: string; workspacePath?: string } = {},
    callbacks: StreamCallbacks = {}
  ): Promise<{ text: string; reasoning?: string; messages: unknown[] }> {
    const model = this.getModel(options.modelId);
    const tools = getTools(options.workspacePath ?? '');

    const agent = new ToolLoopAgent({
      model,
      instructions: systemPrompt,
      tools,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await agent.stream({ messages: messages as any[] });

    let fullText = '';
    let fullReasoning = '';
    let currentTool: { name: string; id: string; input: string } | null = null;

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          fullText += part.text;
          if (callbacks.onTextDelta) {
            callbacks.onTextDelta(part.text, fullText);
          }
          break;
        }

        case 'reasoning-delta': {
          fullReasoning += part.text;
          if (callbacks.onReasoningDelta) {
            callbacks.onReasoningDelta(part.text, fullReasoning);
          }
          break;
        }

        case 'tool-input-start': {
          currentTool = { name: part.toolName, id: part.id, input: '' };
          if (callbacks.onToolInputStart) {
            callbacks.onToolInputStart(part.toolName, part.id);
          }
          break;
        }

        case 'tool-input-delta': {
          if (currentTool) {
            currentTool.input += part.delta;
          }
          if (callbacks.onToolInputDelta) {
            callbacks.onToolInputDelta(part.delta, currentTool?.input || '');
          }
          break;
        }

        case 'tool-input-end': {
          if (callbacks.onToolInputEnd) {
            callbacks.onToolInputEnd(currentTool?.name, currentTool?.input);
          }
          break;
        }

        case 'tool-call': {
          if (callbacks.onToolCall) {
            callbacks.onToolCall(part.toolName, part.toolCallId, part.input);
          }
          break;
        }

        case 'tool-result': {
          const output = typeof part.output === 'string'
            ? part.output
            : JSON.stringify(part.output);
          if (callbacks.onToolResult) {
            callbacks.onToolResult(part.toolName, output);
          }
          break;
        }

        case 'finish': {
          if (callbacks.onFinish) {
            callbacks.onFinish(part.finishReason);
          }
          break;
        }
      }
    }

    const response = await result.response;
    const responseMessages = response.messages;

    return {
      text: fullText || (await result.text),
      reasoning: fullReasoning,
      messages: responseMessages || [],
    };
  }

  async generate(
    messages: unknown[],
    systemPrompt: string,
    options: { modelId?: string; workspacePath?: string } = {}
  ): Promise<{ text: string; messages: unknown[] }> {
    const model = this.getModel(options.modelId);
    const tools = getTools(options.workspacePath ?? '');

    const agent = new ToolLoopAgent({
      model,
      instructions: systemPrompt,
      tools,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await agent.generate({ messages: messages as any[] });

    return {
      text: result.text,
      messages: [],
    };
  }

  getAvailableModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    for (const [providerId, provider] of this.providers) {
      for (const model of provider.getModels()) {
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

  getDefaultModel(): string | null {
    return this.defaultModel;
  }
}
