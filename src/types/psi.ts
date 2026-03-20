import type { Message } from './session.js';

export interface StreamCallbacks {
  onTextDelta?: (delta: string, full: string) => void;
  onReasoningDelta?: (delta: string, full: string) => void;
  onToolInputStart?: (name: string, id: string) => void;
  onToolInputDelta?: (delta: string, full: string) => void;
  onToolInputEnd?: (name: string | undefined, input: string | undefined) => void;
  onToolCall?: (name: string, id: string, input: unknown) => void;
  onToolResult?: (name: string, output: string) => void;
  onFinish?: (reason: string) => void;
}

export interface PsiResponse {
  text: string;
  reasoning?: string;
  messages: Message[];
}

export interface StreamOptions {
  modelId?: string;
  workspacePath: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
}
