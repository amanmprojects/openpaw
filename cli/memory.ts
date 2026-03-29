import { MemoryStore, type MemoryTarget } from "../agent";
import { getWorkspaceRoot } from "../config";

function createStore(): MemoryStore {
  const store = new MemoryStore(getWorkspaceRoot());
  store.loadFromDisk();
  return store;
}

function formatEntries(label: string, entries: string[]): string {
  if (entries.length === 0) {
    return `${label}: empty`;
  }
  return `${label}:\n${entries.map((entry, index) => `${index + 1}. ${entry}`).join("\n\n")}`;
}

/**
 * Prints memory entries for one or both targets.
 */
export function handleMemoryList(target?: MemoryTarget): void {
  const store = createStore();
  if (target === "memory") {
    console.log(formatEntries("Agent memory", store.memoryEntries));
    return;
  }
  if (target === "user") {
    console.log(formatEntries("User memory", store.userEntries));
    return;
  }
  console.log(
    [formatEntries("Agent memory", store.memoryEntries), "", formatEntries("User memory", store.userEntries)].join("\n"),
  );
}

/**
 * Removes the first memory entry matching the provided text.
 */
export async function handleMemoryRemove(target: MemoryTarget, match: string): Promise<void> {
  const store = createStore();
  const result = await store.remove(target, match);
  console.log(result.success ? result.message ?? "Entry removed." : result.error);
}

/**
 * Replaces the first memory entry matching the provided old text.
 */
export async function handleMemoryReplace(
  target: MemoryTarget,
  oldText: string,
  content: string,
): Promise<void> {
  const store = createStore();
  const result = await store.replace(target, oldText, content);
  console.log(result.success ? result.message ?? "Entry replaced." : result.error);
}
