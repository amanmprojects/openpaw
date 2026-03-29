/**
 * Config file loading, validation, and persistence.
 */
import { existsSync } from "node:fs";
import { ensureConfigDir, getConfigPath } from "./paths";
import { parseConfigContent, stringifyConfig } from "./schema";
import type { OpenPawConfig } from "./types";

export type ConfigLoadResult =
  | { ok: true; config: OpenPawConfig }
  | { ok: false; reason: "missing" | "invalid"; message: string };

/**
 * Writes the full config to disk, replacing any existing file at {@link getConfigPath}.
 *
 * @remarks Ensures the config directory exists before writing via {@link ensureConfigDir}.
 */
export async function saveConfig(config: OpenPawConfig): Promise<void> {
  ensureConfigDir();
  await Bun.write(getConfigPath(), stringifyConfig(config));
}

/**
 * Reads, parses, and validates the YAML config file from disk.
 */
export async function loadConfigResult(): Promise<ConfigLoadResult> {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {
      ok: false,
      reason: "missing",
      message: "Config not found.",
    };
  }

  try {
    const content = await Bun.file(path).text();
    const parsed = parseConfigContent(content);
    if (!parsed.ok) {
      return {
        ok: false,
        reason: "invalid",
        message: parsed.message,
      };
    }
    return { ok: true, config: parsed.config };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Reads and validates the config file from disk. Returns null when missing or invalid.
 */
export async function loadConfig(): Promise<OpenPawConfig | null> {
  const result = await loadConfigResult();
  return result.ok ? result.config : null;
}
