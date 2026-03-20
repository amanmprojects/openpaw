import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import type { OpenPawConfig } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.openpaw');
const CONFIG_FILE = join(CONFIG_DIR, 'openpaw.json');

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}

export function getDefaultConfig(): OpenPawConfig {
  return {
    currentWorkspace: join(homedir(), '.openpaw', 'workspace'),
    ownerTelegramId: null,
    models: {
      mode: 'merge',
      providers: {}
    },
    channels: {}
  };
}

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function readConfig(): Promise<OpenPawConfig> {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as OpenPawConfig;
  } catch {
    return getDefaultConfig();
  }
}

export async function writeConfig(config: OpenPawConfig): Promise<void> {
  await ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function mergeConfig(newData: Partial<OpenPawConfig>): Promise<OpenPawConfig> {
  const existing = await readConfig();
  const merged = deepMerge(
    existing as unknown as Record<string, unknown>,
    newData as unknown as Record<string, unknown>
  ) as unknown as OpenPawConfig;
  await writeConfig(merged);
  return merged;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export async function configExists(): Promise<boolean> {
  try {
    await access(CONFIG_FILE);
    return true;
  } catch {
    return false;
  }
}
