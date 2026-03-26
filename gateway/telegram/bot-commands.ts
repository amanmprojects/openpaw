import type { Bot } from "grammy";

const OPENPAW_COMMANDS = [
  { command: "new", description: "Start a fresh conversation" },
  { command: "sessions", description: "List saved sessions for this chat" },
  { command: "resume", description: "Resume a session by number from /sessions" },
];

/**
 * Telegram keeps separate command lists per {@link https://core.telegram.org/bots/api#botcommandscope}.
 * Without `all_group_chats`, supergroups still show BotFather/old menu entries while handlers work.
 */
const COMMAND_SCOPES = [
  { type: "default" as const },
  { type: "all_private_chats" as const },
  { type: "all_group_chats" as const },
];

export async function registerOpenPawBotCommands(bot: Bot): Promise<void> {
  for (const scope of COMMAND_SCOPES) {
    try {
      await bot.api.setMyCommands(OPENPAW_COMMANDS, { scope });
    } catch (e) {
      console.warn(
        `OpenPaw: setMyCommands failed (scope=${scope.type}). Menu may be wrong in some chats:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
