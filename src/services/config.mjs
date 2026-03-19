import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile, access } from 'fs/promises';

const CONFIG_DIR = join(homedir(), '.openpaw');
const CONFIG_FILE = join(CONFIG_DIR, 'openpaw.json');

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function getDefaultConfig() {
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

export async function ensureConfigDir() {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function readConfig() {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return getDefaultConfig();
  }
}

export async function writeConfig(config) {
  await ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function mergeConfig(newData) {
  const existing = await readConfig();
  const merged = deepMerge(existing, newData);
  await writeConfig(merged);
  return merged;
}

export function getConfigPath() {
  return CONFIG_FILE;
}

export async function configExists() {
  try {
    await access(CONFIG_FILE);
    return true;
  } catch {
    return false;
  }
}
