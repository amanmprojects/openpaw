export function formatResponse(response) {
  if (typeof response === 'string') return response;
  if (response?.text) return response.text;
  if (response?.content) {
    if (typeof response.content === 'string') return response.content;
    if (Array.isArray(response.content)) {
      return response.content
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n') || '[No text content]';
    }
  }
  return String(response);
}
