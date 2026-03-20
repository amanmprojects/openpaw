import type { UserMessage } from '../../types/index.js';

export function normalizeMessage(message: { text?: string }): UserMessage[] {
  if (message.text) {
    return [{
      role: 'user',
      content: message.text,
    }];
  }
  return [{
    role: 'user',
    content: '[Empty message]',
  }];
}
