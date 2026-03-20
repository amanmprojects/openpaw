export function formatResponse(response: unknown): string {
  if (typeof response === 'string') {
    return response;
  }

  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    
    if (obj.text && typeof obj.text === 'string') {
      return obj.text;
    }

    if (obj.role === 'assistant' && typeof obj.content === 'string') {
      return obj.content;
    }

    if (Array.isArray(obj.content)) {
      const textParts = obj.content
        .filter((part: { type: string }) => part.type === 'text')
        .map((part: { text?: string }) => part.text)
        .filter(Boolean);
      return textParts.join('\n') || '[No text content]';
    }
  }

  return String(response);
}
