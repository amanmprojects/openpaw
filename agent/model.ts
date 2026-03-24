import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { OpenPawConfig } from "../config/types";

/**
 * OpenAI-compatible chat model from persisted {@link OpenPawConfig}.
 */
export function createLanguageModel(config: OpenPawConfig) {
  const provider = createOpenAICompatible({
    baseURL: config.provider.baseUrl,
    name: "openpaw",
    apiKey: config.provider.apiKey,
  });
  return provider.chatModel(config.provider.model);
}
