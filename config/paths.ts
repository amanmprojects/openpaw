/**
 * Filesystem path helpers for the OpenPaw home directory and workspace.
 */
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function getOpenPawHome(): string {
  return process.env.OPENPAW_HOME?.trim() || join(homedir(), ".openpaw");
}

function getGatewayDir(): string {
  return join(getOpenPawHome(), "gateway");
}

function getCronDirInternal(): string {
  return join(getOpenPawHome(), "cron");
}

/**
 * Absolute path to the YAML config file, typically `~/.openpaw/config.yaml`.
 */
export function getConfigPath(): string {
  return join(getOpenPawHome(), "config.yaml");
}

/**
 * Ensures the OpenPaw config directory exists (`~/.openpaw`), creating it if needed.
 *
 * @remarks Uses synchronous `mkdirSync` with `recursive: true`.
 */
export function ensureConfigDir(): void {
  const configDir = getOpenPawHome();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Returns whether the config file exists at {@link getConfigPath}.
 */
export function configExists(): boolean {
  return existsSync(getConfigPath());
}

/**
 * Deletes the config file if it exists. No-op when the file is absent.
 *
 * @remarks Uses synchronous `unlinkSync`.
 */
export function deleteConfig(): void {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
}

/**
 * OpenPaw workspace root, typically `~/.openpaw/workspace`.
 */
export function getWorkspaceRoot(): string {
  return join(getOpenPawHome(), "workspace");
}

/**
 * Directory for persisted chat sessions, `~/.openpaw/workspace/sessions`.
 */
export function getSessionsDir(): string {
  return join(getWorkspaceRoot(), "sessions");
}

/**
 * Legacy global turn-record directory, `~/.openpaw/workspace/turns`.
 *
 * @deprecated New turn records are stored under each session directory.
 */
export function getTurnsDir(): string {
  return join(getWorkspaceRoot(), "turns");
}

/**
 * Directory for daemon state and log files, `~/.openpaw/gateway`.
 */
export function getGatewayStateDir(): string {
  return getGatewayDir();
}

/**
 * Directory for persisted cron jobs and run logs (`~/.openpaw/cron`).
 */
export function getCronDir(): string {
  return getCronDirInternal();
}

/**
 * Path to the cron jobs manifest (`~/.openpaw/cron/jobs.json`).
 */
export function getCronJobsPath(): string {
  return join(getCronDirInternal(), "jobs.json");
}

/**
 * Directory for per-job append-only run logs (`~/.openpaw/cron/runs/`).
 */
export function getCronRunsDir(): string {
  return join(getCronDirInternal(), "runs");
}

/**
 * Ensures `~/.openpaw/cron` and `runs/` exist.
 */
export function ensureCronDirectories(): void {
  ensureConfigDir();
  const cronDir = getCronDirInternal();
  const runsDir = join(cronDir, "runs");
  if (!existsSync(cronDir)) {
    mkdirSync(cronDir, { recursive: true });
  }
  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }
}

/**
 * Ensures workspace and `sessions/` exist on disk (directories only).
 */
export function ensureWorkspaceDirectories(): void {
  ensureConfigDir();
  const workspaceDir = getWorkspaceRoot();
  const sessionsDir = getSessionsDir();
  const turnsDir = getTurnsDir();
  const gatewayDir = getGatewayStateDir();
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
  if (!existsSync(turnsDir)) {
    mkdirSync(turnsDir, { recursive: true });
  }
  if (!existsSync(gatewayDir)) {
    mkdirSync(gatewayDir, { recursive: true });
  }
}
