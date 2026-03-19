export function normalizeMessage(message) {
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
