import type { Context } from "grammy";
import { GrammyError } from "grammy";
import type { ToolStreamEvent } from "../../agent/types";
import type { TelegramChatPreferences } from "./chat-preferences";
import { formatAssistantMarkdownToTelegramV2 } from "./assistant-markdown";
import {
  formatReasoningPhaseHtml,
  formatStandaloneToolResultHtml,
  formatToolCallCompleteHtml,
  formatToolInputOnlyHtml,
} from "./message-html";

const EDIT_INTERVAL_MS = 550;
const CURSOR = " ▉";
const CHUNK_SAFE = 3800;
const MAX_API_ATTEMPTS = 12;

/** Counters and timing for one assistant turn delivered to Telegram. */
export type TelegramDeliveryMetrics = {
  editFailures: number;
  retryAfter429: number;
  fallbackReplies: number;
  startedAt: number;
};

type Queued =
  | { t: "d"; phase: "text" | "reasoning"; v: string }
  | { t: "tool"; ev: ToolStreamEvent };

export type TelegramStreamHandlers = {
  onTextDelta: (delta: string) => void;
  onReasoningDelta: (delta: string) => void;
  onToolStatus?: (event: ToolStreamEvent) => void;
};

function isNotModifiedError(err: unknown): boolean {
  return (
    err instanceof GrammyError &&
    typeof err.description === "string" &&
    err.description.toLowerCase().includes("message is not modified")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sends or edits a message with 429 retries, treats "not modified" as OK, and falls back to reply after edit failures.
 */
async function sendOrEditRobust(
  ctx: Context,
  chatId: number,
  text: string,
  messageId: number | undefined,
  metrics: TelegramDeliveryMetrics,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<number | undefined> {
  if (!text) {
    return messageId;
  }
  const body = text.slice(0, 4096);
  const extra = parseMode ? { parse_mode: parseMode } : {};

  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      if (messageId !== undefined) {
        await ctx.api.editMessageText(chatId, messageId, body, extra);
        return messageId;
      }
      const sent = await ctx.reply(body, extra);
      return sent.message_id;
    } catch (e) {
      if (isNotModifiedError(e)) {
        return messageId;
      }
      if (e instanceof GrammyError && e.error_code === 429) {
        metrics.retryAfter429++;
        const sec =
          typeof e.parameters?.retry_after === "number" ? e.parameters.retry_after : 1;
        await sleep(sec * 1000);
        continue;
      }

      console.warn(
        "OpenPaw Telegram: send/edit failed",
        e instanceof GrammyError
          ? { code: e.error_code, description: e.description }
          : e,
      );
      metrics.editFailures++;

      if (messageId !== undefined) {
        try {
          metrics.fallbackReplies++;
          const sent = await ctx.reply(body, extra);
          return sent.message_id;
        } catch (fallbackErr) {
          console.warn("OpenPaw Telegram: fallback reply failed", fallbackErr);
        }
      }
      await sleep(Math.min(500 * (attempt + 1), 3000));
    }
  }

  return messageId;
}

/**
 * Sends a standalone chat message (tool lines, errors) with the same retry policy.
 */
async function replyRobust(
  ctx: Context,
  text: string,
  metrics: TelegramDeliveryMetrics,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<number | undefined> {
  const body = text.slice(0, 4096);
  if (!body) {
    return undefined;
  }
  const extra = parseMode ? { parse_mode: parseMode } : {};
  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      const sent = await ctx.reply(body, extra);
      return sent.message_id;
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 429) {
        metrics.retryAfter429++;
        const sec =
          typeof e.parameters?.retry_after === "number" ? e.parameters.retry_after : 1;
        await sleep(sec * 1000);
        continue;
      }
      metrics.editFailures++;
      console.warn(
        "OpenPaw Telegram: reply failed",
        e instanceof GrammyError
          ? { code: e.error_code, description: e.description }
          : e,
      );
      await sleep(Math.min(500 * (attempt + 1), 3000));
    }
  }
  return undefined;
}

type ActivePhase = {
  kind: "text" | "reasoning";
  /** Plain text: user-visible answer, or raw reasoning (HTML applied when sending). */
  accumulated: string;
  messageId: number | undefined;
  lastEdit: number;
};

/** Ref so TypeScript keeps correct typing across `await` inside the consumer loop. */
type PhaseRef = { current: ActivePhase | null };

function phaseHasDisplayableContent(p: ActivePhase): boolean {
  return p.accumulated.trim().length > 0;
}

/**
 * Runs a task that streams assistant output to Telegram: separate messages per reasoning vs text phase,
 * optional tool lines, debounced in-phase edits, and a trailing cursor until the turn ends.
 */
export async function deliverStreamingReply(
  ctx: Context,
  prefs: TelegramChatPreferences,
  runWithHandlers: (handlers: TelegramStreamHandlers) => Promise<void>,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    return;
  }

  const metrics: TelegramDeliveryMetrics = {
    editFailures: 0,
    retryAfter429: 0,
    fallbackReplies: 0,
    startedAt: Date.now(),
  };

  const queue: Queued[] = [];
  let producerDone = false;
  let producerError: unknown;

  const handlers: TelegramStreamHandlers = {
    onTextDelta: (delta) => {
      if (delta) {
        queue.push({ t: "d", phase: "text", v: delta });
      }
    },
    onReasoningDelta: (delta) => {
      if (!delta || !prefs.showReasoning) {
        return;
      }
      queue.push({ t: "d", phase: "reasoning", v: delta });
    },
    onToolStatus: prefs.showToolCalls
      ? (ev) => {
          queue.push({ t: "tool", ev });
        }
      : undefined,
  };

  const producer = (async () => {
    try {
      await runWithHandlers(handlers);
    } catch (e) {
      producerError = e;
    } finally {
      producerDone = true;
    }
  })();

  const active: PhaseRef = { current: null };
  let sentAny = false;
  /** toolCallId → message to edit when output/error/denied arrives */
  const pendingToolBubble = new Map<
    string,
    { messageId: number; toolName: string; input: unknown }
  >();

  const finalizePhase = async (): Promise<void> => {
    const cur = active.current;
    if (!cur || !phaseHasDisplayableContent(cur)) {
      active.current = null;
      return;
    }
    const html = cur.kind === "reasoning";
    let acc = cur.accumulated;
    let mid = cur.messageId;
    while (acc.length > CHUNK_SAFE && mid !== undefined) {
      const cut = acc.lastIndexOf("\n", CHUNK_SAFE);
      const splitAt = cut > CHUNK_SAFE / 2 ? cut : CHUNK_SAFE;
      const plainChunk = acc.slice(0, splitAt);
      const payload = html
        ? formatReasoningPhaseHtml(plainChunk, false)
        : formatAssistantMarkdownToTelegramV2(plainChunk);
      mid = await sendOrEditRobust(
        ctx,
        chatId,
        payload,
        mid,
        metrics,
        html ? "HTML" : "MarkdownV2",
      );
      acc = acc.slice(splitAt).trimStart();
    }
    if (acc.trim().length > 0) {
      const payload = html
        ? formatReasoningPhaseHtml(acc, false)
        : formatAssistantMarkdownToTelegramV2(acc);
      await sendOrEditRobust(ctx, chatId, payload, mid, metrics, html ? "HTML" : "MarkdownV2");
      sentAny = true;
    }
    active.current = null;
  };

  const startPhase = (kind: "text" | "reasoning"): void => {
    active.current = {
      kind,
      accumulated: "",
      messageId: undefined,
      lastEdit: 0,
    };
  };

  const ensurePhase = async (kind: "text" | "reasoning"): Promise<ActivePhase> => {
    if (active.current?.kind === kind) {
      return active.current;
    }
    await finalizePhase();
    startPhase(kind);
    return active.current!;
  };

  const flushLiveEdit = async (showCursor: boolean): Promise<void> => {
    const phase = active.current;
    if (phase === null || !phaseHasDisplayableContent(phase)) {
      return;
    }
    const html = phase.kind === "reasoning";
    let acc = phase.accumulated;
    let mid = phase.messageId;
    while (acc.length > CHUNK_SAFE && mid !== undefined) {
      const cut = acc.lastIndexOf("\n", CHUNK_SAFE);
      const splitAt = cut > CHUNK_SAFE / 2 ? cut : CHUNK_SAFE;
      const plainChunk = acc.slice(0, splitAt);
      const payload = html
        ? formatReasoningPhaseHtml(plainChunk, false)
        : formatAssistantMarkdownToTelegramV2(plainChunk);
      mid = await sendOrEditRobust(
        ctx,
        chatId,
        payload,
        mid,
        metrics,
        html ? "HTML" : "MarkdownV2",
      );
      acc = acc.slice(splitAt).trimStart();
    }
    const tailPlain = showCursor && !html ? `${acc}${CURSOR}` : acc;
    const payload = html
      ? formatReasoningPhaseHtml(acc, showCursor)
      : formatAssistantMarkdownToTelegramV2(tailPlain);
    const newId = await sendOrEditRobust(
      ctx,
      chatId,
      payload,
      mid,
      metrics,
      html ? "HTML" : "MarkdownV2",
    );
    phase.messageId = newId;
    phase.accumulated = acc;
    phase.lastEdit = Date.now();
    sentAny = true;
  };

  const consumer = (async () => {
    while (!producerDone || queue.length > 0) {
      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.t === "tool") {
          await finalizePhase();
          const ev = item.ev;
          if (ev.type === "tool_input") {
            const html = formatToolInputOnlyHtml(ev.toolName, ev.input);
            const mid = await replyRobust(ctx, html, metrics, "HTML");
            if (mid !== undefined) {
              pendingToolBubble.set(ev.toolCallId, {
                messageId: mid,
                toolName: ev.toolName,
                input: ev.input,
              });
            }
            sentAny = true;
          } else {
            const pending = pendingToolBubble.get(ev.toolCallId);
            if (pending) {
              const combined = formatToolCallCompleteHtml(
                pending.toolName,
                pending.input,
                ev,
              );
              await sendOrEditRobust(
                ctx,
                chatId,
                combined,
                pending.messageId,
                metrics,
                "HTML",
              );
              pendingToolBubble.delete(ev.toolCallId);
            } else {
              const orphan = formatStandaloneToolResultHtml(ev);
              if (orphan) {
                await replyRobust(ctx, orphan, metrics, "HTML");
              }
            }
            sentAny = true;
          }
          continue;
        }

        const cur = await ensurePhase(item.phase);
        cur.accumulated += item.v;
      }

      const curActive = active.current;
      if (curActive !== null && phaseHasDisplayableContent(curActive)) {
        const now = Date.now();
        const shouldEdit =
          producerDone ||
          now - curActive.lastEdit >= EDIT_INTERVAL_MS ||
          curActive.accumulated.length >= 40;
        if (shouldEdit) {
          await flushLiveEdit(!producerDone);
        }
      }

      if (!producerDone || queue.length > 0) {
        await sleep(50);
      }
    }

    await finalizePhase();

    if (!sentAny && producerDone) {
      void (await replyRobust(
        ctx,
        "(No assistant text this turn — tools or empty reply.)",
        metrics,
      ));
    }
  })();

  await Promise.all([producer, consumer]);

  const elapsedMs = Date.now() - metrics.startedAt;
  console.log(
    JSON.stringify({
      openpaw: "telegram_turn",
      editFailures: metrics.editFailures,
      retryAfter429: metrics.retryAfter429,
      fallbackReplies: metrics.fallbackReplies,
      elapsedMs,
    }),
  );

  if (producerError) {
    throw producerError;
  }
}
