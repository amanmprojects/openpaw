/**
 * In-memory undo stacks for the file editor tool: each absolute file path maps to
 * a stack of prior UTF-8 contents, pushed before mutating operations.
 */

const editHistory = new Map<string, string[]>();

/**
 * Records the previous file contents so the next {@link popHistory} can restore it.
 */
export function pushHistory(filePath: string, previousContent: string): void {
  if (!editHistory.has(filePath)) {
    editHistory.set(filePath, []);
  }
  editHistory.get(filePath)!.push(previousContent);
}

/**
 * Removes and returns the most recent snapshot for {@link filePath}, or null if none.
 */
export function popHistory(filePath: string): string | null {
  const stack = editHistory.get(filePath);
  if (!stack || stack.length === 0) {
    return null;
  }
  return stack.pop()!;
}
