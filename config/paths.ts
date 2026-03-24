import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".openpaw");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

/**
 * Absolute path to the YAML config file, typically `~/.openpaw/config.yaml`.
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Ensures the OpenPaw config directory exists (`~/.openpaw`), creating it if needed.
 *
 * @remarks Uses synchronous `mkdirSync` with `recursive: true`.
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Returns whether the config file exists at {@link getConfigPath}.
 */
export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

/**
 * Deletes the config file if it exists. No-op when the file is absent.
 *
 * @remarks Uses synchronous `unlinkSync`.
 */
export function deleteConfig(): void {
  if (existsSync(CONFIG_PATH)) {
    unlinkSync(CONFIG_PATH);
  }
}
