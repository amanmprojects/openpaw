import { Bot, GrammyError, Context } from "grammy";
import { testTelegramToken } from "./test.js";
import {
  COMMANDS_LIST,
  handleHelp,
  handleModel,
  handleNewSession,
  handleStatus,
  handleRestart,
} from "./commands.js";
import { normalizeMessage } from "./normalizer.js";
import { formatResponse } from "./formatter.js";
import type {
  ChannelConfig,
  Gateway,
  PsiResponse,
  ValidationResponse,
  ChannelAdapter,
  StreamEvent,
} from "../../types/index.js";

export class TelegramChannel implements ChannelAdapter {
  name = "telegram" as const;
  bot: Bot | null = null;
  gateway: Gateway | null = null;
  config: ChannelConfig;
  private _pendingMessages: Map<string, { chatId: string }> = new Map();

  constructor(config: ChannelConfig) {
    this.config = config;
  }

  async test(config?: ChannelConfig): Promise<ValidationResponse> {
    return testTelegramToken(config?.botToken || this.config.botToken || "");
  }

  async start(gateway: Gateway): Promise<void> {
    this.gateway = gateway;
    const token = this.config.botToken;

    if (!token) {
      throw new Error("Telegram bot token is required");
    }

    this.bot = new Bot(token);
    this.bot.catch((err) => {
      if (err.error instanceof GrammyError && err.error.error_code === 409) {
        console.error(
          "[Telegram] ⚠️  Another bot instance is already running. Please stop it first.",
        );
        console.error(
          '[Telegram]    Kill other instances: pkill -f "node.*openpaw"',
        );
      } else {
        console.error("[Telegram] Bot error:", err.error || err);
      }
    });

    this._registerCommands();
    this._registerMessageHandlers();

    console.log("[Telegram] Starting bot...");
    this.bot
      .start({
        onStart: async () => {
          console.log("[Telegram] Bot is polling for updates");
          await this._registerCommandsMenu();
        },
      })
      .catch((err) => {
        if (err instanceof GrammyError && err.error_code === 409) {
          console.error(
            "[Telegram] ⚠️  Another bot instance is already running.",
          );
          console.error(
            '[Telegram]    Kill other instances: pkill -f "node.*openpaw"',
          );
        } else {
          const error = err as Error;
          console.error("[Telegram] Failed to start:", error.message);
        }
      });
  }

  private _registerCommands(): void {
    if (!this.bot) return;

    this.bot.command("help", (ctx) => handleHelp(ctx));
    this.bot.command("model", (ctx) => handleModel(ctx, this.gateway!, this));
    this.bot.command("newsesh", (ctx) =>
      handleNewSession(ctx, this.gateway!, this),
    );
    this.bot.command("status", (ctx) => handleStatus(ctx, this.gateway!, this));
    this.bot.command("restart", (ctx) => handleRestart(ctx, this.gateway!));
  }

  private async _registerCommandsMenu(): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.api.setMyCommands(COMMANDS_LIST);
    } catch (err) {
      const error = err as Error;
      console.error(
        "[Telegram] Failed to register commands menu:",
        error.message,
      );
    }
  }

  private _registerMessageHandlers(): void {
    if (!this.bot || !this.gateway) return;

    const handleMessage = async (ctx: Context): Promise<void> => {
      try {
        if (!ctx.message) return;

        const userId = ctx.from?.id.toString();
        const chatId = ctx.chat?.id.toString();
        if (!userId || !chatId) return;

        const sessionId = `telegram-${userId}-${this.config.sessionSuffix || "main"}`;

        this._pendingMessages.set(sessionId, { chatId });

        const normalized = normalizeMessage(ctx.message);
        await this.gateway!.handleMessage(this.name, sessionId, normalized);
      } catch (err) {
        const error = err as Error;
        console.error("[Telegram] Error handling message:", error);
        try {
          await ctx.reply(
            "Sorry, something went wrong processing your message.",
          );
        } catch {
          // Ignore reply errors
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.bot.on("message:text", handleMessage as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.bot.on("message:photo", handleMessage as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.bot.on("message:document", handleMessage as any);
  }

  async stop(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
    }
  }

  onStreamEvent(sessionId: string, event: StreamEvent): void {
    const pending = this._pendingMessages.get(sessionId);
    if (!pending || !this.bot) return;

    if (event.type === "finish") {
      this._pendingMessages.delete(sessionId);
    }
  }

  async send(sessionId: string, response: PsiResponse | string): Promise<void> {
    if (!this.bot) {
      console.error("[Telegram] Bot not started, cannot send");
      return;
    }

    const userId = sessionId.split("-")[1];
    if (!userId) {
      console.log("No userId found in sessionId");
      return;
    }

    try {
      const text = formatResponse(response);
      await this.bot.api.sendMessage(userId, text);
    } catch (err) {
      const error = err as Error;
      console.error("[Telegram] Error sending response:", error);
    }
  }

  getSessionSuffix(): string {
    return this.config.sessionSuffix || "main";
  }
}
