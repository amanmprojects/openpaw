import type { ChannelConfig, Gateway, PsiResponse, ValidationResponse, ChannelAdapter, StreamEvent } from '../../types/index.js';
import { normalizeMessage } from './normalizer.js';
import { formatResponse } from './formatter.js';

export class TUIChannel implements ChannelAdapter {
  name = 'tui' as const;
  gateway: Gateway | null = null;
  private _onResponse: ((response: string) => void) | null = null;
  private _onStreamEvent: ((event: StreamEvent) => void) | null = null;
  private _throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingEvents: StreamEvent[] = [];
  private _lastFlush = 0;

  constructor(_config: ChannelConfig) {}

  async test(): Promise<ValidationResponse> {
    return { success: true, botInfo: { name: 'TUI' } };
  }

  async start(gateway: Gateway): Promise<void> {
    this.gateway = gateway;
  }

  async stop(): Promise<void> {
    this.gateway = null;
    this._flushEvents();
  }

  async send(_sessionId: string, response: PsiResponse | string): Promise<void> {
    this._flushEvents();
    if (this._onResponse) {
      this._onResponse(formatResponse(response));
    }
  }

  onStreamEvent(_sessionId: string, event: StreamEvent): void {
    if (event.type === 'finish') {
      this._pendingEvents.push(event);
      this._flushEvents();
      return;
    }

    this._pendingEvents.push(event);

    const now = Date.now();
    const elapsed = now - this._lastFlush;

    if (elapsed >= 50) {
      this._flushEvents();
    } else if (!this._throttleTimer) {
      this._throttleTimer = setTimeout(() => {
        this._flushEvents();
      }, 50 - elapsed);
    }
  }

  private _flushEvents(): void {
    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer);
      this._throttleTimer = null;
    }

    if (this._pendingEvents.length === 0) return;

    const latest = this._pendingEvents[this._pendingEvents.length - 1];
    const toolStarts = this._pendingEvents.filter(e => e.type === 'tool-start');
    const toolResults = this._pendingEvents.filter(e => e.type === 'tool-result');

    if (this._onStreamEvent) {
      for (const event of toolStarts) this._onStreamEvent(event);
      for (const event of toolResults) this._onStreamEvent(event);
      if (latest && (latest.type === 'reasoning-delta' || latest.type === 'text-delta' || latest.type === 'finish')) {
        this._onStreamEvent(latest);
      }
    }

    this._pendingEvents = [];
    this._lastFlush = Date.now();
  }

  setResponseHandler(handler: (response: string) => void): void {
    this._onResponse = handler;
  }

  setStreamEventHandler(handler: (event: StreamEvent) => void): void {
    this._onStreamEvent = handler;
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.gateway) return;
    const normalized = normalizeMessage({ text });
    await this.gateway.handleMessage(this.name, 'tui-local-main', normalized);
  }
}
