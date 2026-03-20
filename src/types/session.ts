export interface SessionMeta {
  modelId?: string;
  telegramUserId?: string;
  [key: string]: unknown;
}

export interface Session {
  id: string;
  channel: string;
  messages: Message[];
  meta?: SessionMeta;
  title?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SessionListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  messageCount: number;
}

export type Message = UserMessage | AssistantMessage | SystemMessage;

export interface UserMessage {
  role: 'user';
  content: string | ContentPart[];
  timestamp?: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string;
  timestamp?: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

export interface SystemMessage {
  role: 'system';
  content: string;
  timestamp?: string;
}

export interface ContentPart {
  type: 'text' | 'image' | 'file';
  text?: string;
  image?: string;
  data?: string;
  filename?: string;
  mediaType?: string;
}

export interface ToolCall {
  name: string;
  status: 'running' | 'done';
  input?: unknown;
  output?: string;
}
