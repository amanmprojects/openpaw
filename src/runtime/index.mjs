import { readConfig, writeConfig } from '../services/config.mjs';
import { loadEnabledChannels } from '../channels/registry.mjs';
import { PsiAgent } from '../psi/index.mjs';
import { SessionManager } from '../sessions/index.mjs';
import { buildSystemPrompt } from '../psi/system-prompt.mjs';
import { getDefaultWorkspacePath, workspaceExists, createWorkspace } from '../memory/workspace.mjs';

export class Runtime {
  constructor() {
    this.config = null;
    this.channels = [];
    this.psi = null;
    this.sessions = null;
    this.workspacePath = null;
    this.sessionQueues = new Map(); // per-session message queues
  }

  async init() {
    this.config = await readConfig();

    // Resolve workspace path
    this.workspacePath = this.config.currentWorkspace || getDefaultWorkspacePath();

    // Auto-create workspace if it doesn't exist
    if (!(await workspaceExists(this.workspacePath))) {
      console.log(`[Runtime] Creating workspace at ${this.workspacePath}`);
      await createWorkspace(this.workspacePath);
    }

    // Init session manager
    this.sessions = new SessionManager(this.workspacePath);

    // Init Psi agent
    this.psi = new PsiAgent(this.config);
    this.psi.initProviders();

    // Load channels
    this.channels = await loadEnabledChannels(this.config.channels || {});

    console.log(`[Runtime] Initialized with ${this.channels.length} channel(s)`);
    console.log(`[Runtime] Workspace: ${this.workspacePath}`);
    console.log(`[Runtime] Default model: ${this.psi.getDefaultModel() || 'not set'}`);
  }

  async start() {
    await this.init();

    for (const channel of this.channels) {
      console.log(`[Runtime] Starting channel: ${channel.name}`);
      await channel.start(this);
    }

    console.log('[Runtime] All channels started');
  }

  async stop() {
    for (const channel of this.channels) {
      console.log(`[Runtime] Stopping channel: ${channel.name}`);
      await channel.stop();
    }
    console.log('[Runtime] Stopped');
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  /**
   * Handle an incoming message from any channel.
   * Messages within the same session are processed sequentially.
   */
  async handleMessage(channelName, sessionId, normalizedMessages) {
    const queueKey = `${channelName}/${sessionId}`;

    // Create a promise chain for sequential processing per session
    if (!this.sessionQueues.has(queueKey)) {
      this.sessionQueues.set(queueKey, Promise.resolve());
    }

    const previousTask = this.sessionQueues.get(queueKey);
    const currentTask = previousTask.then(() =>
      this._processMessage(channelName, sessionId, normalizedMessages)
    );
    this.sessionQueues.set(queueKey, currentTask);

    return currentTask;
  }

  async _processMessage(channelName, sessionId, normalizedMessages) {
    const channel = this.channels.find(c => c.name === channelName);
    if (!channel) {
      console.error(`[Runtime] Channel not found: ${channelName}`);
      return;
    }

    // Append messages to session
    const session = await this.sessions.appendMessages(sessionId, channelName, normalizedMessages);

    // Build system prompt
    const isMainSession = this._isMainSession(session);
    const systemPrompt = await buildSystemPrompt(this.workspacePath, isMainSession);

    // Get model for this session
    const modelId = session.meta?.modelId || undefined;

    try {
      // Generate response with Psi
      const result = await this.psi.generate(
        session.messages,
        systemPrompt,
        {
          modelId,
          workspacePath: this.workspacePath,
        }
      );

      // Save assistant response to session
      const assistantMessage = {
        role: 'assistant',
        content: result.text,
      };
      await this.sessions.appendMessages(sessionId, channelName, [assistantMessage]);

      // Send response through channel
      await channel.send(sessionId, result);

    } catch (err) {
      console.error(`[Runtime] Error generating response:`, err);

      // Send error message to user
      await channel.send(sessionId, `Error: ${err.message}`);
    }
  }

  /**
   * Determine if a session is the "main" session (owner's direct chat).
   * Main sessions get MEMORY.md loaded.
   */
  _isMainSession(session) {
    if (session.channel === 'tui') return true;

    if (session.channel === 'telegram') {
      const ownerId = this.config.ownerTelegramId;
      if (!ownerId) return true; // No owner set, treat all as main
      return session.meta?.telegramUserId === ownerId;
    }

    return false;
  }

  getCurrentModel() {
    return this.psi?.getDefaultModel() || null;
  }

  getSession(sessionId, channel = null) {
    if (channel) return this.sessions.get(sessionId, channel);
    // Search all channels
    for (const ch of this.channels) {
      const session = this.sessions.get(sessionId, ch.name);
      if (session) return session;
    }
    return null;
  }

  setSessionModel(sessionId, modelId) {
    // Validate model exists
    this.psi.getModel(modelId);

    const session = this.getSession(sessionId);
    if (session) {
      session.meta = session.meta || {};
      session.meta.modelId = modelId;
      this.sessions.save(session);
    }
  }

  clearSession(sessionId) {
    for (const channel of this.channels) {
      const session = this.sessions.get(sessionId, channel.name);
      if (session) {
        this.sessions.clear(sessionId, channel.name);
        return;
      }
    }
  }

  getWorkspaceName() {
    return this.workspacePath.split('/').pop();
  }

  getWorkspacePath() {
    return this.workspacePath;
  }
}
