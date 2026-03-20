import { readConfig } from '../services/config.js';
import { loadEnabledChannels } from '../channels/registry.js';
import { PsiAgent } from '../psi/index.js';
import { SessionManager, generateSessionId } from '../sessions/index.js';
import { buildSystemPrompt } from '../psi/system-prompt.js';
import { getDefaultWorkspacePath, workspaceExists, createWorkspace } from '../memory/workspace.js';
import type { OpenPawConfig, ChannelAdapter, Session, SessionMeta, SessionListItem, Message } from '../types/index.js';

export class Gateway {
  config: OpenPawConfig | null = null;
  channels: ChannelAdapter[] = [];
  psi: PsiAgent | null = null;
  sessions: SessionManager | null = null;
  workspacePath: string | null = null;
  private sessionQueues: Map<string, Promise<void>> = new Map();

  async init(): Promise<void> {
    this.config = await readConfig();

    this.workspacePath = this.config.currentWorkspace || getDefaultWorkspacePath();

    if (!(await workspaceExists(this.workspacePath))) {
      console.log(`[Gateway] Creating workspace at ${this.workspacePath}`);
      await createWorkspace(this.workspacePath);
    }

    this.sessions = new SessionManager(this.workspacePath);

    this.psi = new PsiAgent(this.config);
    this.psi.initProviders();

    this.channels = await loadEnabledChannels(this.config.channels || {});

    console.log(`[Gateway] Initialized with ${this.channels.length} channel(s)`);
    console.log(`[Gateway] Workspace: ${this.workspacePath}`);
    console.log(`[Gateway] Default model: ${this.psi.getDefaultModel() || 'not set'}`);
  }

  async start(): Promise<void> {
    await this.init();

    for (const channel of this.channels) {
      console.log(`[Gateway] Starting channel: ${channel.name}`);
      await channel.start(this);
    }

    console.log('[Gateway] All channels started');
  }

  async stop(): Promise<void> {
    for (const channel of this.channels) {
      console.log(`[Gateway] Stopping channel: ${channel.name}`);
      await channel.stop();
    }
    console.log('[Gateway] Stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async handleMessage(channelName: string, sessionId: string, normalizedMessages: Message[]): Promise<void> {
    const queueKey = `${channelName}/${sessionId}`;

    if (!this.sessionQueues.has(queueKey)) {
      this.sessionQueues.set(queueKey, Promise.resolve());
    }

    const previousTask = this.sessionQueues.get(queueKey)!;
    const currentTask = previousTask.then(() =>
      this._processMessage(channelName, sessionId, normalizedMessages)
    );
    this.sessionQueues.set(queueKey, currentTask);

    return currentTask;
  }

  private async _processMessage(channelName: string, sessionId: string, normalizedMessages: Message[]): Promise<void> {
    if (!this.channels || !this.sessions || !this.psi || !this.workspacePath || !this.config) {
      return;
    }
    
    const channel = this.channels.find(c => c.name === channelName);
    if (!channel) {
      console.error(`[Gateway] Channel not found: ${channelName}`);
      return;
    }

    const session = await this.sessions.appendMessages(sessionId, channelName, normalizedMessages);

    const isMainSession = this._isMainSession(session);
    const systemPrompt = await buildSystemPrompt(this.workspacePath, isMainSession);

    const modelId = session.meta?.modelId || undefined;

    try {
      // Use streaming for better UX, forward events to channel
      const streamCallbacks = {
        onTextDelta: (_delta: string, full: string) => {
          channel.onStreamEvent?.(sessionId, { type: 'text-delta', full });
        },
        onReasoningDelta: (_delta: string, full: string) => {
          channel.onStreamEvent?.(sessionId, { type: 'reasoning-delta', full });
        },
        onToolInputStart: (toolName: string, id: string) => {
          channel.onStreamEvent?.(sessionId, { type: 'tool-start', toolName, toolCallId: id });
        },
        onToolCall: (toolName: string, toolCallId: string, input: unknown) => {
          channel.onStreamEvent?.(sessionId, { type: 'tool-call', toolName, toolCallId, input });
        },
        onToolResult: (toolName: string, output: string) => {
          channel.onStreamEvent?.(sessionId, { type: 'tool-result', toolName, output });
        },
        onFinish: () => {
          channel.onStreamEvent?.(sessionId, { type: 'finish' });
        },
      };

      const result = await this.psi.stream(
        session.messages,
        systemPrompt,
        {
          modelId,
          workspacePath: this.workspacePath,
        },
        streamCallbacks
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: result.text,
      };
      await this.sessions.appendMessages(sessionId, channelName, [assistantMessage]);

      // Also send via channel.send() for channels that don't use streaming
      await channel.send(sessionId, { text: result.text, messages: result.messages });

    } catch (err) {
      const error = err as Error;
      console.error(`[Gateway] Error generating response:`, error);

      // Send finish event on error too, so TUI doesn't get stuck
      channel.onStreamEvent?.(sessionId, { type: 'finish' });
      await channel.send(sessionId, `Error: ${error.message}`);
    }
  }

  private _isMainSession(session: Session): boolean {
    if (session.channel === 'tui') return true;

    if (session.channel === 'telegram') {
      const ownerId = this.config?.ownerTelegramId;
      if (!ownerId) return true;
      return (session.meta as SessionMeta)?.telegramUserId === ownerId;
    }

    return false;
  }

  getCurrentModel(): string | null {
    return this.psi?.getDefaultModel() || null;
  }

  getSession(sessionId: string, channel?: string): Session | null {
    if (!this.sessions) return null;
    
    if (channel) return this.sessions.get(sessionId, channel);
    for (const ch of this.channels) {
      const session = this.sessions.get(sessionId, ch.name);
      if (session) return session;
    }
    return null;
  }

  setSessionModel(sessionId: string, modelId: string): void {
    if (!this.psi) return;
    
    this.psi.getModel(modelId);

    const session = this.getSession(sessionId);
    if (session && this.sessions) {
      session.meta = session.meta || {};
      session.meta.modelId = modelId;
      this.sessions.save(session);
    }
  }

  clearSession(sessionId: string): void {
    if (!this.sessions) return;
    
    for (const channel of this.channels) {
      const session = this.sessions.get(sessionId, channel.name);
      if (session) {
        this.sessions.clear(sessionId, channel.name);
        const queueKey = `${channel.name}/${sessionId}`;
        this.sessionQueues.delete(queueKey);
        return;
      }
    }
  }

  getWorkspaceName(): string {
    return (this.workspacePath || '').split('/').pop() || '';
  }

  getWorkspacePath(): string {
    return this.workspacePath || '';
  }

  async listSessions(channel: string, limit: number = 10): Promise<SessionListItem[]> {
    if (!this.sessions) return [];
    return this.sessions.list(channel, limit);
  }

  async loadSession(sessionId: string, channel: string): Promise<Session | null> {
    if (!this.sessions) return null;
    return this.sessions.load(sessionId, channel);
  }

  async updateSessionTitle(sessionId: string, channel: string, title: string): Promise<void> {
    if (!this.sessions) return;
    const session = this.sessions.get(sessionId, channel);
    if (session) {
      session.title = title;
      await this.sessions.save(session);
    }
  }

  createSessionId(): string {
    return generateSessionId();
  }
}
