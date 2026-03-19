/**
 * Format an AI SDK response for sending via Telegram.
 */
export function formatResponse(response) {
  if (typeof response === 'string') {
    return response;
  }

  if (response && typeof response === 'object') {
    // AI SDK generateText result
    if (response.text) {
      return response.text;
    }

    // ModelMessage format
    if (response.role === 'assistant' && typeof response.content === 'string') {
      return response.content;
    }

    // Array of content parts
    if (Array.isArray(response.content)) {
      const textParts = response.content
        .filter(part => part.type === 'text')
        .map(part => part.text);
      return textParts.join('\n') || '[No text content]';
    }
  }

  return String(response);
}
