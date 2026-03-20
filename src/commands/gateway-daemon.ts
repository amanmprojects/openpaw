#!/usr/bin/env node
import 'dotenv/config';
import { Gateway } from '../gateway/index.js';
import { writePid, getLogFilePath } from '../services/gateway-process.js';
import { createWriteStream } from 'fs';

const LOG_FILE = getLogFilePath();

const logStream = createWriteStream(LOG_FILE, { flags: 'a' });

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  logStream.write(line);
}

console.log = (...args: unknown[]) => {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  log(message);
};

console.error = (...args: unknown[]) => {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  log(`[ERROR] ${message}`);
};

async function main(): Promise<void> {
  log('[Gateway Daemon] Starting...');

  try {
    process.title = 'openpaw-gateway';
    
    if (process.pid) {
      await writePid(process.pid);
      log(`[Gateway Daemon] PID: ${process.pid}`);
    }

    const gateway = new Gateway();
    
    await gateway.start();
    log('[Gateway Daemon] Gateway started successfully');

    const shutdown = async (signal: string) => {
      log(`[Gateway Daemon] Received ${signal}, shutting down...`);
      try {
        await gateway.stop();
        log('[Gateway Daemon] Gateway stopped');
        logStream.end();
        process.exit(0);
      } catch (error) {
        const err = error as Error;
        log(`[Gateway Daemon] Error during shutdown: ${err.message}`);
        logStream.end();
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      log(`[Gateway Daemon] Uncaught exception: ${error.message}`);
      log(error.stack || '');
    });

    process.on('unhandledRejection', (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      log(`[Gateway Daemon] Unhandled rejection: ${message}`);
    });

  } catch (error) {
    const err = error as Error;
    log(`[Gateway Daemon] Fatal error: ${err.message}`);
    log(err.stack || '');
    logStream.end();
    process.exit(1);
  }
}

main();
