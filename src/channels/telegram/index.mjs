import { Bot } from 'grammy';
import { testTelegramToken } from './test.mjs';
import { handleCommands } from './commands.mjs';
import { normalizeMessage } from './normalizer.mjs';
import { formatResponse } from './formatter.mjs';

export class TelegramChannel {
  name = 'telegram';
  bot = null;
  runtime = null;

  constructor(config) {
    this.config = config;
  }

  async test(config) {
    return testTelegramToken(config.botToken || this.config.botToken);
  }

  async start(runtime) {
    this.runtime = runtime;
    const token = this.config.botToken;

    this.bot = new Bot(token);
    this.bot.catch((err) => {
      console.error('[Telegram] Bot error:', err.error || err);
    });

    // Handle /commands first, before normal messages
    this.bot.on('message:text', async (ctx, next) => {
      const text = ctx.message.text.trim();

      if (text.startsWith('/')) {
        const handled = await handleCommands(ctx, this.runtime, this);
        if (handled) return;
      }

      await next();
    });

    // Handle all text messages
    this.bot.on('message:text', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const chatId = ctx.chat.id.toString();
        const sessionId = `telegram-${userId}-${this.config.sessionSuffix || 'main'}`;
        const normalized = normalizeMessage(ctx.message);

        await this.runtime.handleMessage(this.name, sessionId, normalized);
      } catch (err) {
        console.error('[Telegram] Error handling message:', err);
        try {
          await ctx.reply('Sorry, something went wrong processing your message.');
        } catch {}
      }
    });

    // Handle photo messages
    this.bot.on('message:photo', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessionId = `telegram-${userId}-${this.config.sessionSuffix || 'main'}`;
        const normalized = normalizeMessage(ctx.message);

        await this.runtime.handleMessage(this.name, sessionId, normalized);
      } catch (err) {
        console.error('[Telegram] Error handling photo:', err);
      }
    });

    // Handle document messages
    this.bot.on('message:document', async (ctx) => {
      try {
        const userId = ctx.from.id.toString();
        const sessionId = `telegram-${userId}-${this.config.sessionSuffix || 'main'}`;
        const normalized = normalizeMessage(ctx.message);

        await this.runtime.handleMessage(this.name, sessionId, normalized);
      } catch (err) {
        console.error('[Telegram] Error handling document:', err);
      }
    });

    console.log('[Telegram] Starting bot...');
    this.bot.start();
  }

  async stop() {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
    }
  }

  async send(sessionId, response) {
    if (!this.bot) {
      console.error('[Telegram] Bot not started, cannot send');
      return;
    }

    // Extract chat ID from sessionId: telegram-{userId}-xxx
    const userId = sessionId.split('-')[1];
    if (!userId) return;

    try {
      const text = formatResponse(response);
      await this.bot.api.sendMessage(userId, text);
    } catch (err) {
      console.error('[Telegram] Error sending response:', err);
    }
  }

  getSessionSuffix() {
    return this.config.sessionSuffix || 'main';
  }
}
