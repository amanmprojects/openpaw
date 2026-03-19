import { loadSession, saveSession, deleteSession as deleteSessionFile } from './store.mjs';

export class SessionManager {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.sessions = new Map(); // in-memory cache
  }

  /**
   * Get or create a session.
   */
  async getOrCreate(sessionId, channel, meta = {}) {
    const cacheKey = `${channel}/${sessionId}`;

    // Check in-memory cache
    if (this.sessions.has(cacheKey)) {
      return this.sessions.get(cacheKey);
    }

    // Try loading from disk
    const existing = await loadSession(this.workspacePath, sessionId, channel);
    if (existing) {
      this.sessions.set(cacheKey, existing);
      return existing;
    }

    // Create new session
    const session = {
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

  /**
   * Append messages to a session.
   */
  async appendMessages(sessionId, channel, messages) {
    const session = await this.getOrCreate(sessionId, channel);
    session.messages.push(...messages);
    await this.save(session);
    return session;
  }

  /**
   * Save a session.
   */
  async save(session) {
    await saveSession(this.workspacePath, session);
  }

  /**
   * Get a session from cache (no disk read).
   */
  get(sessionId, channel) {
    const cacheKey = `${channel}/${sessionId}`;
    return this.sessions.get(cacheKey) || null;
  }

  /**
   * Clear a session from memory and delete from disk.
   */
  async clear(sessionId, channel) {
    const cacheKey = `${channel}/${sessionId}`;
    this.sessions.delete(cacheKey);
    await deleteSessionFile(this.workspacePath, sessionId, channel);
  }
}
