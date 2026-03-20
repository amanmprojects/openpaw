import type { ChannelConfig } from './config.js';

export interface ValidationResponse {
  success: boolean;
  botInfo?: {
    id?: number;
    username?: string;
    firstName?: string;
    name?: string;
    [key: string]: unknown;
  };
}

export interface PsiResponse {
  text: string;
  reasoning?: string;
  messages: unknown[];
}

export interface SessionListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  messageCount: number;
}

export interface Gateway {
  getCurrentModel(): string | null;
  getWorkspaceName(): string;
  getWorkspacePath(): string;
  handleMessage(channelName: string, sessionId: string, messages: unknown[]): Promise<void>;
  getSession(sessionId: string, channel?: string): Session | null;
  setSessionModel(sessionId: string, modelId: string): void;
  clearSession(sessionId: string): void;
  restart(): Promise<void>;
  listSessions(channel: string, limit?: number): Promise<SessionListItem[]>;
  loadSession(sessionId: string, channel: string): Promise<Session | null>;
  updateSessionTitle(sessionId: string, channel: string, title: string): Promise<void>;
  createSessionId(): string;
}

export interface Session {
  id: string;
  channel: string;
  messages: unknown[];
  meta?: SessionMeta;
  createdAt: string;
  updatedAt?: string;
}

export interface SessionMeta {
  modelId?: string;
  telegramUserId?: string;
  [key: string]: unknown;
}

export interface StreamEvent {
  type: 'text-delta' | 'reasoning-delta' | 'tool-start' | 'tool-call' | 'tool-result' | 'finish';
  text?: string;
  full?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: string;
}

export interface ChannelAdapter {
  name: string;
  test: (config?: ChannelConfig) => Promise<ValidationResponse>;
  start: (gateway: Gateway) => Promise<void>;
  stop: () => Promise<void>;
  send: (sessionId: string, response: PsiResponse | string) => Promise<void>;
  onStreamEvent?: (sessionId: string, event: StreamEvent) => void;
}
