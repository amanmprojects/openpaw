import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".openpaw");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");
const WORKSPACE_DIR = join(CONFIG_DIR, "workspace");
const SESSIONS_DIR = join(WORKSPACE_DIR, "sessions");

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

/**
 * OpenPaw workspace root, typically `~/.openpaw/workspace`.
 */
export function getWorkspaceRoot(): string {
  return WORKSPACE_DIR;
}

/**
 * Directory for persisted chat sessions, `~/.openpaw/workspace/sessions`.
 */
export function getSessionsDir(): string {
  return SESSIONS_DIR;
}

/**
 * Path for the SQLite long-term memory database, `~/.openpaw/workspace/memory.db`.
 */
export function getMemoryDbPath(): string {
  return join(WORKSPACE_DIR, "memory.db");
}

/**
 * Ensures workspace and `sessions/` exist on disk (directories only).
 */
export function ensureWorkspaceDirectories(): void {
  ensureConfigDir();
  if (!existsSync(WORKSPACE_DIR)) {
    mkdirSync(WORKSPACE_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}
