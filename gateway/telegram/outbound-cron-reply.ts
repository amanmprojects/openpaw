/**
 * Delivers cron-triggered assistant output to Telegram without a Grammy message Context.
 */
import type { Bot } from "grammy";
import { GrammyError } from "grammy";
import type { ToolStreamEvent } from "../../agent/types";
import { formatAssistantMarkdownForTelegram } from "./assistant-markdown";
import type { TelegramChatPreferences } from "./chat-preferences";

const CHUNK = 3800;

function splitBody(s: string, max: number): string[] {
  if (s.length <= max) {
    return [s];
  }
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += max) {
    parts.push(s.slice(i, i + max));
  }
  return parts;
}

async function sendMessageChunk(
  bot: Bot,
  chatId: number,
  text: string,
  parseMode: "MarkdownV2" | undefined,
): Promise<void> {
  if (!text) {
    return;
  }
  try {
    await bot.api.sendMessage(chatId, text, parseMode ? { parse_mode: parseMode } : {});
  } catch (err) {
    if (parseMode && err instanceof GrammyError) {
      await bot.api.sendMessage(chatId, text);
      return;
    }
    throw err;
  }
}

function toolLine(ev: ToolStreamEvent): string | null {
  switch (ev.type) {
    case "tool_starting":
      return `Tool: ${ev.toolName} …`;
    case "tool_error":
      return `Tool ${ev.toolName} error: ${ev.errorText}`;
    case "tool_denied":
      return `Tool ${ev.toolName} denied`;
    case "tool_output":
      return `Tool ${ev.toolName} completed`;
    default:
      return null;
  }
}

/**
 * Runs the agent turn and sends assistant markdown (and optional reasoning / tool lines) to the chat.
 */
export async function deliverCronTurnToTelegram(
  bot: Bot,
  chatId: number,
  prefs: TelegramChatPreferences,
  runTurn: (hooks: {
    onTextDelta: (d: string) => void;
    onReasoningDelta: (d: string) => void;
    onToolStatus?: (ev: ToolStreamEvent) => void;
  }) => Promise<{ text: string }>,
): Promise<{ text: string }> {
  let reasoningBuf = "";

  const result = await runTurn({
    onTextDelta: () => {},
    onReasoningDelta: (d) => {
      if (prefs.showReasoning) {
        reasoningBuf += d;
      }
    },
    onToolStatus: prefs.showToolCalls
      ? (ev) => {
          const line = toolLine(ev);
          if (!line) {
            return;
          }
          void (async () => {
            try {
              await bot.api.sendMessage(chatId, line.slice(0, 4096));
            } catch {
              // non-fatal
            }
          })();
        }
      : undefined,
  });

  if (prefs.showReasoning && reasoningBuf.trim()) {
    try {
      await bot.api.sendMessage(chatId, `[Reasoning]\n${reasoningBuf.slice(0, 4000)}`);
    } catch {
      // non-fatal
    }
  }

  if (result.text.trim()) {
    const { body, parseMode } = formatAssistantMarkdownForTelegram(result.text);
    for (const part of splitBody(body, CHUNK)) {
      await sendMessageChunk(bot, chatId, part, parseMode);
    }
  }

  return result;
}
