export function formatResponse(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    if (obj.text && typeof obj.text === 'string') return obj.text;
    if (obj.content) {
      if (typeof obj.content === 'string') return obj.content;
      if (Array.isArray(obj.content)) {
        return obj.content
          .filter((p: { type: string }) => p.type === 'text')
          .map((p: { text?: string }) => p.text)
          .filter(Boolean)
          .join('\n') || '[No text content]';
      }
    }
  }
  return String(response);
}
