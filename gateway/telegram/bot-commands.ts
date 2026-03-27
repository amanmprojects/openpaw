import type { Bot } from "grammy";
import { OPENPAW_SLASH_COMMAND_NAMES } from "../slash-command-tokens";

const OPENPAW_COMMAND_DESCRIPTIONS: Record<(typeof OPENPAW_SLASH_COMMAND_NAMES)[number], string> =
  {
    new: "Start a fresh conversation",
    sessions: "List saved sessions for this chat",
    resume: "Resume a session by number from /sessions",
    reasoning: "show or hide — reasoning bubbles in Telegram",
    tool_calls: "show or hide — tool status lines in Telegram",
  };

const OPENPAW_COMMANDS = OPENPAW_SLASH_COMMAND_NAMES.map((command) => ({
  command,
  description: OPENPAW_COMMAND_DESCRIPTIONS[command],
}));

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
