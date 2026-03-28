/**
 * Per-chat async message queue for WhatsApp, ensuring ordered processing of tasks per JID.
 * Mirrors the Telegram message queue pattern.
 */

type Task = () => Promise<void>;

/**
 * Creates a message queue that serialises async work per WhatsApp chat key.
 * Each call to the returned function enqueues a task; tasks for the same key
 * run strictly in order while different keys run concurrently.
 */
export function createWhatsAppMessageQueue(): (
  key: string,
  task: Task,
) => Promise<void> {
  const queues = new Map<string, Promise<void>>();

  return async (key: string, task: Task): Promise<void> => {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    queues.set(key, next);

    try {
      await next;
    } finally {
      if (queues.get(key) === next) {
        queues.delete(key);
      }
    }
  };
}
