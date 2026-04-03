/**
 * Minimal typings for the CommonJS `proper-lockfile` package (no bundled types).
 */
declare module "proper-lockfile" {
  export function lockSync(
    file: string,
    options?: { realpath?: boolean; stale?: number },
  ): () => void;
}
