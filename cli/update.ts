import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Minimal package metadata used for self-update command resolution. */
type OpenPawPackageMeta = {
  name?: string;
};

/** Supported global package managers for self-update behavior. */
type GlobalPackageManager = "bun" | "npm";

/**
 * Reads package metadata from the shipped `package.json` next to the project root.
 */
function readPackageMeta(): OpenPawPackageMeta {
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(cliDir, "..", "package.json");
  const raw = readFileSync(packageJsonPath, "utf8");
  return JSON.parse(raw) as OpenPawPackageMeta;
}

/**
 * Resolves the npm package id to update. Falls back to `@amanm/openpaw` if metadata is missing.
 */
function resolvePackageName(): string {
  const meta = readPackageMeta();
  const name = meta.name?.trim();
  return name && name.length > 0 ? name : "@amanm/openpaw";
}

/**
 * Ensures npm is available on PATH for update operations.
 */
function ensureNpmAvailable(): void {
  const check = spawnSync("npm", ["--version"], { stdio: "ignore" });
  if (check.status !== 0) {
    throw new Error("npm is required for `openpaw update` but was not found on PATH.");
  }
}

/**
 * Ensures Bun is available on PATH for update operations.
 */
function ensureBunAvailable(): void {
  const check = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (check.status !== 0) {
    throw new Error("Bun is required for `openpaw update` in Bun-global mode but was not found.");
  }
}

/**
 * Returns command output lines for a shell command or an empty string on failure.
 */
function readCommandStdout(command: string, args: string[]): string {
  const out = spawnSync(command, args, { encoding: "utf8" });
  if (out.status !== 0) {
    return "";
  }
  return String(out.stdout ?? "").trim();
}

/**
 * Determines whether the current global `openpaw` command resolves from Bun or npm global bin.
 */
function detectGlobalPackageManager(): GlobalPackageManager {
  const commandPath = readCommandStdout("bash", ["-lc", "command -v openpaw || command -v opaw || true"]);
  const bunGlobalBin = readCommandStdout("bun", ["pm", "bin", "-g"]);
  const npmGlobalBin = readCommandStdout("npm", ["bin", "-g"]);

  if (commandPath && bunGlobalBin && commandPath.startsWith(bunGlobalBin)) {
    return "bun";
  }
  if (commandPath && npmGlobalBin && commandPath.startsWith(npmGlobalBin)) {
    return "npm";
  }

  // Default to npm for broader compatibility if install origin cannot be inferred.
  return "npm";
}

/**
 * Updates this globally-installed package to the latest published version with the matching package manager.
 */
export function handleUpdate(): void {
  const packageName = resolvePackageName();
  const target = `${packageName}@latest`;
  const manager = detectGlobalPackageManager();

  if (manager === "bun") {
    ensureBunAvailable();
    console.log(`Updating ${target} using Bun global install ...`);
    const run = spawnSync("bun", ["install", "-g", target], {
      stdio: "inherit",
    });
    if (run.status !== 0) {
      throw new Error(`Update failed for ${target} using Bun.`);
    }
    console.log(`Updated ${packageName} to latest via Bun.`);
    return;
  }

  ensureNpmAvailable();
  console.log(`Updating ${target} using npm global install ...`);
  const run = spawnSync("npm", ["install", "-g", target], {
    stdio: "inherit",
  });
  if (run.status !== 0) {
    throw new Error(`Update failed for ${target} using npm.`);
  }

  console.log(`Updated ${packageName} to latest via npm.`);
}
