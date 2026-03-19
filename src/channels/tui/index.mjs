import { normalizeMessage } from './normalizer.mjs';
import { formatResponse } from './formatter.mjs';

export class TUIChannel {
  name = 'tui';
  runtime = null;
  _onResponse = null;

  constructor(config) {
    this.config = config;
  }

  async test() {
    return { success: true, botInfo: { name: 'TUI' } };
  }

  async start(runtime) {
    this.runtime = runtime;
  }

  async stop() {
    this.runtime = null;
  }

  async send(sessionId, response) {
    if (this._onResponse) {
      this._onResponse(formatResponse(response));
    }
  }

  setResponseHandler(handler) {
    this._onResponse = handler;
  }

  async sendMessage(text) {
    if (!this.runtime) return;
    const normalized = normalizeMessage({ text });
    await this.runtime.handleMessage(this.name, 'tui-local-main', normalized);
  }
}
