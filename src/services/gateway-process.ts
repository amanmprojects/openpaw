import { homedir } from 'os';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { mkdir, readFile, writeFile, unlink, stat } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const CONFIG_DIR = join(homedir(), '.openpaw');
const PID_FILE = join(CONFIG_DIR, 'gateway.pid');
const LOG_FILE = join(CONFIG_DIR, 'gateway.log');

export function getPidFilePath(): string {
  return PID_FILE;
}

export function getLogFilePath(): string {
  return LOG_FILE;
}

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function writePid(pid: number): Promise<void> {
  await ensureConfigDir();
  await writeFile(PID_FILE, pid.toString(), 'utf-8');
}

export async function readPid(): Promise<number | null> {
  try {
    const content = await readFile(PID_FILE, 'utf-8');
    const pid = parseInt(content.trim(), 10);
    if (isNaN(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

export async function removePid(): Promise<void> {
  try {
    await unlink(PID_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

export async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function isGatewayRunning(): Promise<{ running: boolean; pid: number | null }> {
  const pid = await readPid();
  if (pid === null) {
    return { running: false, pid: null };
  }
  
  const running = await isProcessRunning(pid);
  if (!running) {
    await removePid();
  }
  
  return { running, pid };
}

export async function getGatewayUptime(): Promise<number | null> {
  try {
    const stats = await stat(PID_FILE);
    return Date.now() - stats.mtimeMs;
  } catch {
    return null;
  }
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

async function getDaemonScriptPath(): Promise<string> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  
  const distPath = join(currentDir, '../commands/gateway-daemon.js');
  if (existsSync(distPath)) {
    return distPath;
  }
  
  const srcPath = join(currentDir, '../../src/commands/gateway-daemon.ts');
  if (existsSync(srcPath)) {
    return srcPath;
  }
  
  throw new Error('Could not find gateway-daemon script');
}

export async function startGatewayDaemon(): Promise<{ success: boolean; pid?: number; error?: string }> {
  const { running, pid: existingPid } = await isGatewayRunning();
  
  if (running) {
    return { success: false, error: `Gateway is already running with PID ${existingPid}` };
  }

  await ensureConfigDir();
  
  const logStream = createWriteStream(LOG_FILE, { flags: 'a' });
  
  try {
    const daemonPath = await getDaemonScriptPath();
    const isTs = daemonPath.endsWith('.ts');
    
    const args = isTs 
      ? [daemonPath]
      : [daemonPath];
    
    const executable = isTs ? 'npx' : process.execPath;
    const finalArgs = isTs ? ['tsx', ...args] : args;
    
    const child = spawn(executable, finalArgs, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    
    await new Promise<void>((resolve) => {
      child.on('spawn', () => resolve());
      child.on('error', () => resolve());
    });

    if (child.pid) {
      await writePid(child.pid);
      child.unref();
      return { success: true, pid: child.pid };
    } else {
      return { success: false, error: 'Failed to start gateway process' };
    }
  } catch (error) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

export async function stopGateway(): Promise<{ success: boolean; error?: string }> {
  const { running, pid } = await isGatewayRunning();
  
  if (!running || pid === null) {
    return { success: true };
  }

  try {
    process.kill(pid, 'SIGTERM');
    
    const maxWait = 10000;
    const checkInterval = 500;
    let waited = 0;
    
    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      const stillRunning = await isProcessRunning(pid);
      if (!stillRunning) {
        await removePid();
        return { success: true };
      }
      waited += checkInterval;
    }
    
    process.kill(pid, 'SIGKILL');
    await new Promise(resolve => setTimeout(resolve, 100));
    await removePid();
    return { success: true };
  } catch (error) {
    const err = error as Error;
    if (err.message?.includes('ESRCH') || err.message?.includes('no such process')) {
      await removePid();
      return { success: true };
    }
    return { success: false, error: err.message };
  }
}

export async function restartGateway(): Promise<{ success: boolean; pid?: number; error?: string }> {
  const stopResult = await stopGateway();
  if (!stopResult.success) {
    return stopResult;
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return startGatewayDaemon();
}
