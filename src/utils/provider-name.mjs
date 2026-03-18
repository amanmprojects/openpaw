import { URL } from 'url';

export function generateProviderName(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname
      .replace(/\./g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '');
    return `custom-${hostname}`;
  } catch {
    return `custom-provider-${Date.now()}`;
  }
}
