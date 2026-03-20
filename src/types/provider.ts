import type { ModelConfig } from './config.js';

export interface ProviderAdapter {
  readonly name: string;
  readonly id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chatModel(modelId: string): any;
  test(modelId: string): Promise<boolean>;
  getModels(): ModelConfig[];
}
