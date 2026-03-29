import type { Context } from "grammy";
import { GrammyError } from "grammy";
import { logInfo, logWarn } from "../../lib/log";
import type { ToolStreamEvent } from "../../agent/types";
import type { TelegramChatPreferences } from "./chat-preferences";
import {
  formatAssistantMarkdownForTelegram,
  type AssistantTelegramPayload,
} from "./assistant-markdown";
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

function isTelegramEntityParseError(err: unknown): boolean {
  if (!(err instanceof GrammyError) || err.error_code !== 400) {
    return false;
  }
  const d = typeof err.description === "string" ? err.description.toLowerCase() : "";
  return (
    (d.includes("parse") && d.includes("entit")) ||
    d.includes("can't parse entities") ||
    d.includes("cannot parse entities") ||
    d.includes("find end")
  );
}

function logMarkdownV2ApiParseFailed(where: string, err: unknown): void {
  const detail =
    err instanceof GrammyError && typeof err.description === "string"
      ? err.description
      : String(err);
  logWarn("telegram.markdown_parse_failed", { where, detail });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type SendOrEditOptions = {
  plainFallbackBody?: string;
  onEntityParseUsePlainForRestOfPhase?: () => void;
};

async function sendOrEditRobust(
  ctx: Context,
  chatId: number,
  text: string,
  messageId: number | undefined,
  metrics: TelegramDeliveryMetrics,
  parseMode?: "HTML" | "MarkdownV2",
  options?: SendOrEditOptions,
): Promise<number | undefined> {
  if (!text) {
    return messageId;
  }
  const body = text.slice(0, 4096);
  const plainFallbackBody = options?.plainFallbackBody;
  const onEntityParseUsePlainForRestOfPhase = options?.onEntityParseUsePlainForRestOfPhase;

  let activeBody = body;
  let activeExtra = parseMode ? { parse_mode: parseMode } : {};
  let switchedToPlainAfterEntityError = false;

  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      if (messageId !== undefined) {
        await ctx.api.editMessageText(chatId, messageId, activeBody, activeExtra);
        return messageId;
      }
      const sent = await ctx.reply(activeBody, activeExtra);
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

      if (
        isTelegramEntityParseError(e) &&
        parseMode === "MarkdownV2" &&
        plainFallbackBody !== undefined &&
        !switchedToPlainAfterEntityError
      ) {
        const plain = plainFallbackBody.slice(0, 4096);
        if (plain.length > 0) {
          logMarkdownV2ApiParseFailed(
            messageId !== undefined ? "editMessageText" : "reply",
            e,
          );
          activeBody = plain;
          activeExtra = {};
          switchedToPlainAfterEntityError = true;
          onEntityParseUsePlainForRestOfPhase?.();
          continue;
        }
      }

      metrics.editFailures++;

      if (messageId !== undefined) {
        try {
          metrics.fallbackReplies++;
          const sent = await ctx.reply(activeBody, activeExtra);
          return sent.message_id;
        } catch (fallbackErr) {
          if (
            isTelegramEntityParseError(fallbackErr) &&
            parseMode === "MarkdownV2" &&
            plainFallbackBody !== undefined
          ) {
            const plain = plainFallbackBody.slice(0, 4096);
            if (plain.length > 0) {
              try {
                logMarkdownV2ApiParseFailed("fallback reply", fallbackErr);
                const sent = await ctx.reply(plain, {});
                onEntityParseUsePlainForRestOfPhase?.();
                return sent.message_id;
              } catch (plainReplyErr) {
                logWarn("telegram.fallback_plain_reply_failed", {
                  error: String(plainReplyErr),
                });
              }
            }
          }
          logWarn("telegram.fallback_reply_failed", {
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        }
      }
      await sleep(Math.min(500 * (attempt + 1), 3000));
    }
  }

  return messageId;
}

async function replyRobust(
  ctx: Context,
  text: string,
  metrics: TelegramDeliveryMetrics,
  parseMode?: "HTML" | "MarkdownV2",
  options?: Pick<SendOrEditOptions, "plainFallbackBody" | "onEntityParseUsePlainForRestOfPhase">,
): Promise<number | undefined> {
  const body = text.slice(0, 4096);
  if (!body) {
    return undefined;
  }
  const extra = parseMode ? { parse_mode: parseMode } : {};
  const plainFallbackBody = options?.plainFallbackBody;
  const onEntityParseUsePlainForRestOfPhase = options?.onEntityParseUsePlainForRestOfPhase;

  let activeBody = body;
  let activeExtra = extra;
  let switchedToPlainAfterEntityError = false;

  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      const sent = await ctx.reply(activeBody, activeExtra);
      return sent.message_id;
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 429) {
        metrics.retryAfter429++;
        const sec =
          typeof e.parameters?.retry_after === "number" ? e.parameters.retry_after : 1;
        await sleep(sec * 1000);
        continue;
      }

      if (
        isTelegramEntityParseError(e) &&
        parseMode === "MarkdownV2" &&
        plainFallbackBody !== undefined &&
        !switchedToPlainAfterEntityError
      ) {
        const plain = plainFallbackBody.slice(0, 4096);
        if (plain.length > 0) {
          logMarkdownV2ApiParseFailed("replyRobust", e);
          activeBody = plain;
          activeExtra = {};
          switchedToPlainAfterEntityError = true;
          onEntityParseUsePlainForRestOfPhase?.();
          continue;
        }
      }

      metrics.editFailures++;
      logWarn("telegram.reply_failed", {
        error: e instanceof GrammyError ? e.description : String(e),
      });
      await sleep(Math.min(500 * (attempt + 1), 3000));
    }
  }
  return undefined;
}

type ActivePhase = {
  kind: "text" | "reasoning";
  accumulated: string;
  messageId: number | undefined;
  lastEdit: number;
  forcePlainForRestOfPhase: boolean;
};

type PhaseRef = { current: ActivePhase | null };

function phaseHasDisplayableContent(p: ActivePhase): boolean {
  return p.accumulated.trim().length > 0;
}

function textPhaseTelegramPayload(
  plainMarkdownSource: string,
  forcePlain: boolean,
): AssistantTelegramPayload {
  if (forcePlain) {
    return { body: plainMarkdownSource.slice(0, 4096), parseMode: undefined };
  }
  return formatAssistantMarkdownForTelegram(plainMarkdownSource);
}

function textPhaseSendArgs(
  plainMarkdownSource: string,
  forcePlain: boolean,
): { body: string; parseMode?: "MarkdownV2" } {
  const payload = textPhaseTelegramPayload(plainMarkdownSource, forcePlain);
  return payload.parseMode === "MarkdownV2"
    ? { body: payload.body, parseMode: "MarkdownV2" }
    : { body: payload.body };
}

/**
 * Runs a task that streams assistant output to Telegram.
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
    const textOptions = (plainSlice: string): SendOrEditOptions | undefined =>
      html
        ? undefined
        : {
            plainFallbackBody: plainSlice.slice(0, 4096),
            onEntityParseUsePlainForRestOfPhase: () => {
              cur.forcePlainForRestOfPhase = true;
            },
          };

    while (acc.length > CHUNK_SAFE && mid !== undefined) {
      const cut = acc.lastIndexOf("\n", CHUNK_SAFE);
      const splitAt = cut > CHUNK_SAFE / 2 ? cut : CHUNK_SAFE;
      const plainChunk = acc.slice(0, splitAt);
      if (html) {
        mid = await sendOrEditRobust(
          ctx,
          chatId,
          formatReasoningPhaseHtml(plainChunk, false),
          mid,
          metrics,
          "HTML",
        );
      } else {
        const payload = textPhaseSendArgs(plainChunk, cur.forcePlainForRestOfPhase);
        mid = await sendOrEditRobust(
          ctx,
          chatId,
          payload.body,
          mid,
          metrics,
          payload.parseMode,
          textOptions(plainChunk),
        );
      }
      acc = acc.slice(splitAt).trimStart();
    }
    if (acc.trim().length > 0) {
      if (html) {
        await sendOrEditRobust(
          ctx,
          chatId,
          formatReasoningPhaseHtml(acc, false),
          mid,
          metrics,
          "HTML",
        );
      } else {
        const payload = textPhaseSendArgs(acc, cur.forcePlainForRestOfPhase);
        await sendOrEditRobust(
          ctx,
          chatId,
          payload.body,
          mid,
          metrics,
          payload.parseMode,
          textOptions(acc),
        );
      }
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
      forcePlainForRestOfPhase: false,
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
    const textOptions = (plainSlice: string): SendOrEditOptions | undefined =>
      html
        ? undefined
        : {
            plainFallbackBody: plainSlice.slice(0, 4096),
            onEntityParseUsePlainForRestOfPhase: () => {
              phase.forcePlainForRestOfPhase = true;
            },
          };

    while (acc.length > CHUNK_SAFE && mid !== undefined) {
      const cut = acc.lastIndexOf("\n", CHUNK_SAFE);
      const splitAt = cut > CHUNK_SAFE / 2 ? cut : CHUNK_SAFE;
      const plainChunk = acc.slice(0, splitAt);
      if (html) {
        mid = await sendOrEditRobust(
          ctx,
          chatId,
          formatReasoningPhaseHtml(plainChunk, false),
          mid,
          metrics,
          "HTML",
        );
      } else {
        const payload = textPhaseSendArgs(plainChunk, phase.forcePlainForRestOfPhase);
        mid = await sendOrEditRobust(
          ctx,
          chatId,
          payload.body,
          mid,
          metrics,
          payload.parseMode,
          textOptions(plainChunk),
        );
      }
      acc = acc.slice(splitAt).trimStart();
    }
    const tailPlain = showCursor && !html ? `${acc}${CURSOR}` : acc;
    let newId: number | undefined;
    if (html) {
      newId = await sendOrEditRobust(
        ctx,
        chatId,
        formatReasoningPhaseHtml(acc, showCursor),
        mid,
        metrics,
        "HTML",
      );
    } else {
      const payload = textPhaseSendArgs(tailPlain, phase.forcePlainForRestOfPhase);
      newId = await sendOrEditRobust(
        ctx,
        chatId,
        payload.body,
        mid,
        metrics,
        payload.parseMode,
        textOptions(tailPlain),
      );
    }
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
            const toolHtml = formatToolInputOnlyHtml(ev.toolName, ev.input);
            const mid = await replyRobust(ctx, toolHtml, metrics, "HTML");
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
      await replyRobust(
        ctx,
        "(No assistant text this turn — tools or empty reply.)",
        metrics,
      );
    }
  })();

  await Promise.all([producer, consumer]);

  const elapsedMs = Date.now() - metrics.startedAt;
  logInfo("telegram.turn.delivered", {
    editFailures: metrics.editFailures,
    retryAfter429: metrics.retryAfter429,
    fallbackReplies: metrics.fallbackReplies,
    elapsedMs,
  });

  if (producerError) {
    throw producerError;
  }
}
