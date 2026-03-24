import { existsSync } from "node:fs";
import { ensureConfigDir, getConfigPath } from "./paths";
import type { OpenPawConfig, Personality } from "./types";

function toYaml(config: OpenPawConfig): string {
  const lines: string[] = [];

  lines.push("provider:");
  lines.push(`  baseUrl: "${config.provider.baseUrl}"`);
  lines.push(`  apiKey: "${config.provider.apiKey}"`);
  lines.push(`  model: "${config.provider.model}"`);

  if (config.channels?.telegram) {
    lines.push("channels:");
    lines.push("  telegram:");
    lines.push(`    botToken: "${config.channels.telegram.botToken}"`);
  }

  lines.push(`personality: "${config.personality}"`);

  return lines.join("\n") + "\n";
}

/**
 * Writes the full config to disk, replacing any existing file at {@link getConfigPath}.
 *
 * @remarks Ensures the config directory exists before writing via {@link ensureConfigDir}.
 */
export async function saveConfig(config: OpenPawConfig): Promise<void> {
  ensureConfigDir();
  await Bun.write(getConfigPath(), toYaml(config));
}

/**
 * Reads and parses the YAML config file from disk.
 *
 * @returns Parsed config, or `null` if the file is missing, unreadable, or required
 *   fields (`provider.*`, `personality`) cannot be extracted with the current parser.
 */
export async function loadConfig(): Promise<OpenPawConfig | null> {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    const file = Bun.file(path);
    const content = await file.text();

    const baseUrlMatch = content.match(/baseUrl:\s*"([^"]+)"/);
    const apiKeyMatch = content.match(/apiKey:\s*"([^"]+)"/);
    const modelMatch = content.match(/model:\s*"([^"]+)"/);
    const botTokenMatch = content.match(/botToken:\s*"([^"]+)"/);
    const personalityMatch = content.match(/personality:\s*"([^"]+)"/);

    if (!baseUrlMatch?.[1] || !apiKeyMatch?.[1] || !modelMatch?.[1] || !personalityMatch?.[1]) {
      return null;
    }

    const config: OpenPawConfig = {
      provider: {
        baseUrl: baseUrlMatch[1],
        apiKey: apiKeyMatch[1],
        model: modelMatch[1],
      },
      personality: personalityMatch[1] as Personality,
    };

    if (botTokenMatch?.[1]) {
      config.channels = {
        telegram: {
          botToken: botTokenMatch[1],
        },
      };
    }

    return config;
  } catch {
    return null;
  }
}
