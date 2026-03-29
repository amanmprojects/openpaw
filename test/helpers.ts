import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates a temporary OpenPaw home directory and returns a disposer.
 */
export function withTempOpenPawHome(): { home: string; dispose: () => void } {
  const home = mkdtempSync(join(tmpdir(), "openpaw-test-"));
  process.env.OPENPAW_HOME = home;
  return {
    home,
    dispose: () => {
      rmSync(home, { recursive: true, force: true });
      delete process.env.OPENPAW_HOME;
    },
  };
}
