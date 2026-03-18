import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";
import { devToolsMiddleware } from "@ai-sdk/devtools";

export const litellm = createOpenAICompatible({
  baseURL: 'https://openai-aman.duckdns.org/v1',
  name: 'litellm',
  apiKey: "sk-9833006363",
});

export const wrappedLitellm = (model: string) => wrapLanguageModel({
  model: litellm(model),
  middleware: devToolsMiddleware(),
});