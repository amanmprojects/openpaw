import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Partial package metadata needed for CLI version reporting. */
type OpenPawPackageMeta = {
  version?: string;
};

/**
 * Reads package metadata from the repository/package root.
 */
function readPackageMeta(): OpenPawPackageMeta {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(cliDir, "..", "package.json");
  const raw = readFileSync(packageJsonPath, "utf8");
  return JSON.parse(raw) as OpenPawPackageMeta;
}

/**
 * Returns the CLI version from package metadata, with a safe fallback.
 */
export function getOpenPawVersion(): string {
  try {
    const version = readPackageMeta().version?.trim();
    return version && version.length > 0 ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
