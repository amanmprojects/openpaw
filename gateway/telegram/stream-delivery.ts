import type { Context } from "grammy";
import { GrammyError } from "grammy";
import type { ToolStreamEvent } from "../../agent/types";
import { formatToolStreamEvent } from "../../agent/tool-stream-format";
import type { TelegramChatPreferences } from "./chat-preferences";

const EDIT_INTERVAL_MS = 550;
const CURSOR = " ▉";
const CHUNK_SAFE = 3800;
const MAX_API_ATTEMPTS = 12;

/** Prepended to reasoning-phase Telegram messages (plain text). */
const REASONING_PREFIX = "💭 ";

/** Counters and timing for one assistant turn delivered to Telegram. */
export type TelegramDeliveryMetrics = {
  editFailures: number;
  retryAfter429: number;
  fallbackReplies: number;
  startedAt: number;
};

type Queued =
  | { t: "d"; phase: "text" | "reasoning"; v: string }
  | { t: "tool"; v: string };

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
): Promise<number | undefined> {
  if (!text) {
    return messageId;
  }
  const body = text.slice(0, 4096);

  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      if (messageId !== undefined) {
        await ctx.api.editMessageText(chatId, messageId, body);
        return messageId;
      }
      const sent = await ctx.reply(body);
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
          const sent = await ctx.reply(body);
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
): Promise<void> {
  const body = text.slice(0, 4096);
  if (!body) {
    return;
  }
  for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
    try {
      await ctx.reply(body);
      return;
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
}

type ActivePhase = {
  kind: "text" | "reasoning";
  /** Full message body so far (includes {@link REASONING_PREFIX} for reasoning). No trailing cursor. */
  accumulated: string;
  messageId: number | undefined;
  lastEdit: number;
};

/** Ref so TypeScript keeps correct typing across `await` inside the consumer loop. */
type PhaseRef = { current: ActivePhase | null };

function phaseHasDisplayableContent(p: ActivePhase): boolean {
  if (p.kind === "text") {
    return p.accumulated.length > 0;
  }
  return p.accumulated.length > REASONING_PREFIX.length;
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
          const line = formatToolStreamEvent(ev);
          if (line) {
            queue.push({ t: "tool", v: line });
          }
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

  const finalizePhase = async (): Promise<void> => {
    const cur = active.current;
    if (!cur || !phaseHasDisplayableContent(cur)) {
      active.current = null;
      return;
    }
    let acc = cur.accumulated;
    let mid = cur.messageId;
    while (acc.length > CHUNK_SAFE && mid !== undefined) {
      const cut = acc.lastIndexOf("\n", CHUNK_SAFE);
      const splitAt = cut > CHUNK_SAFE / 2 ? cut : CHUNK_SAFE;
      const chunk = acc.slice(0, splitAt);
      mid = await sendOrEditRobust(ctx, chatId, chunk, mid, metrics);
      acc = acc.slice(splitAt).trimStart();
    }
    if (acc.length > 0) {
      await sendOrEditRobust(ctx, chatId, acc, mid, metrics);
      sentAny = true;
    }
    active.current = null;
  };

  const startPhase = (kind: "text" | "reasoning"): void => {
    active.current = {
      kind,
      accumulated: kind === "reasoning" ? REASONING_PREFIX : "",
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
    let acc = phase.accumulated;
    let mid = phase.messageId;
    while (acc.length > CHUNK_SAFE && mid !== undefined) {
      const cut = acc.lastIndexOf("\n", CHUNK_SAFE);
      const splitAt = cut > CHUNK_SAFE / 2 ? cut : CHUNK_SAFE;
      const chunk = acc.slice(0, splitAt);
      mid = await sendOrEditRobust(ctx, chatId, chunk, mid, metrics);
      acc = acc.slice(splitAt).trimStart();
    }
    const tail = showCursor ? `${acc}${CURSOR}` : acc;
    const newId = await sendOrEditRobust(ctx, chatId, tail, mid, metrics);
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
          await replyRobust(ctx, item.v, metrics);
          sentAny = true;
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
