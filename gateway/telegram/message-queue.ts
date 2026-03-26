/**
 * Serializes async work per queue key (one chain per Telegram chat queue id).
 */
export function createTelegramMessageQueue() {
  const chains = new Map<string, Promise<unknown>>();

  return function runSerialized<T>(queueKey: string, task: () => Promise<T>): Promise<T> {
    const prev = chains.get(queueKey) ?? Promise.resolve();
    const result = prev.then(() => task());
    chains.set(
      queueKey,
      result.then(
        () => {},
        () => {},
      ),
    );
    return result;
  };
}
