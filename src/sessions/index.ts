import { loadSession, saveSession, deleteSession as deleteSessionFile } from './store.js';
import type { Session, SessionMeta, Message } from '../types/index.js';

export class SessionManager {
  private workspacePath: string;
  private sessions: Map<string, Session>;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.sessions = new Map();
  }

  async getOrCreate(sessionId: string, channel: string, meta: SessionMeta = {}): Promise<Session> {
    const cacheKey = `${channel}/${sessionId}`;

    if (this.sessions.has(cacheKey)) {
      return this.sessions.get(cacheKey)!;
    }

    const existing = await loadSession(this.workspacePath, sessionId, channel);
    if (existing) {
      this.sessions.set(cacheKey, existing);
      return existing;
    }

    const session: Session = {
      id: sessionId,
      channel,
      createdAt: new Date().toISOString(),
      messages: [],
      meta,
    };

    this.sessions.set(cacheKey, session);
    await this.save(session);
    return session;
  }

  async appendMessages(
    sessionId: string,
    channel: string,
    messages: Message[]
  ): Promise<Session> {
    const session = await this.getOrCreate(sessionId, channel);
    session.messages.push(...messages);
    await this.save(session);
    return session;
  }

  async save(session: Session): Promise<void> {
    await saveSession(this.workspacePath, session);
  }

  get(sessionId: string, channel: string): Session | null {
    const cacheKey = `${channel}/${sessionId}`;
    return this.sessions.get(cacheKey) || null;
  }

  async clear(sessionId: string, channel: string): Promise<void> {
    const cacheKey = `${channel}/${sessionId}`;
    this.sessions.delete(cacheKey);
    await deleteSessionFile(this.workspacePath, sessionId, channel);
  }
}
