import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChannelsConfig {
  telegram?: {
    botToken: string;
  };
}

export const PERSONALITIES = ["Assistant", "Meowl", "Coder"] as const;
export type Personality = typeof PERSONALITIES[number];

export interface OpenPawConfig {
  provider: ProviderConfig;
  channels?: ChannelsConfig;
  personality: Personality;
}

const CONFIG_DIR = join(homedir(), ".openpaw");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_PATH)) {
    unlinkSync(CONFIG_PATH);
  }
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

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

export async function saveConfig(config: OpenPawConfig): Promise<void> {
  ensureConfigDir();
  await Bun.write(CONFIG_PATH, toYaml(config));
}

export async function loadConfig(): Promise<OpenPawConfig | null> {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    const file = Bun.file(CONFIG_PATH);
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

export function getConfigPath(): string {
  return CONFIG_PATH;
}
