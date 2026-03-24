import type { Context } from "grammy";

const EDIT_INTERVAL_MS = 300;
const CURSOR = " ▉";
const CHUNK_SAFE = 3800;

/**
 * Runs a task that streams text via `push(delta)` and mirrors it to Telegram (send + debounced edits).
 */
export async function deliverStreamingReply(
  ctx: Context,
  runWithPush: (push: (delta: string) => void) => Promise<void>,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    return;
  }

  const queue: string[] = [];
  let producerDone = false;
  let producerError: unknown;

  const producer = (async () => {
    try {
      await runWithPush((delta) => {
        if (delta) {
          queue.push(delta);
        }
      });
    } catch (e) {
      producerError = e;
    } finally {
      producerDone = true;
    }
  })();

  let accumulated = "";
  let messageId: number | undefined;
  let lastEdit = 0;
  let editSupported = true;

  const sendOrEdit = async (text: string) => {
    if (!text) {
      return;
    }
    const body = text.slice(0, 4096);
    if (!editSupported) {
      return;
    }
    try {
      if (messageId !== undefined) {
        await ctx.api.editMessageText(chatId, messageId, body);
      } else {
        const sent = await ctx.reply(body);
        messageId = sent.message_id;
      }
    } catch {
      editSupported = false;
    }
  };

  const consumer = (async () => {
    while (!producerDone || queue.length > 0) {
      while (queue.length > 0) {
        accumulated += queue.shift() ?? "";
      }

      const now = Date.now();
      const shouldEdit =
        accumulated.length > 0 &&
        (producerDone ||
          now - lastEdit >= EDIT_INTERVAL_MS ||
          accumulated.length >= 40);

      if (shouldEdit) {
        while (accumulated.length > CHUNK_SAFE && messageId !== undefined) {
          const cut = accumulated.lastIndexOf("\n", CHUNK_SAFE);
          const splitAt = cut > CHUNK_SAFE / 2 ? cut : CHUNK_SAFE;
          const chunk = accumulated.slice(0, splitAt);
          await sendOrEdit(chunk);
          accumulated = accumulated.slice(splitAt).trimStart();
          messageId = undefined;
        }

        const live = producerDone ? accumulated : accumulated + CURSOR;
        await sendOrEdit(live);
        lastEdit = Date.now();
      }

      if (!producerDone || queue.length > 0) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    if (producerDone && accumulated.length === 0 && messageId === undefined) {
      await sendOrEdit("(No assistant text this turn — tools or empty reply.)");
    }
  })();

  await Promise.all([producer, consumer]);

  if (producerError) {
    throw producerError;
  }
}
