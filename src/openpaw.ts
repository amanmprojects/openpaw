#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { onboard } from './commands/onboard.js';
import { startTUI } from './commands/tui.js';
import {
  handleGatewayStart,
  handleGatewayStop,
  handleGatewayRestart,
  handleGatewayStatus,
} from './commands/gateway.js';
import { Gateway } from './gateway/index.js';

process.on('SIGINT', () => {
  console.log(chalk.dim('\nExiting...'));
  process.exit(0);
});

const program = new Command();

program
  .name('openpaw')
  .description('OpenPaw — your AI companion')
  .version('0.1.0');

program.command('onboard')
  .description('Setup model, channels, and workspace')
  .action(async () => {
    try {
      await onboard();
    } catch (error) {
      const err = error as Error & { name?: string };
      if (err.name === 'ExitPromptError') {
        console.log(chalk.dim('\nCancelled.'));
        process.exit(0);
      }
      throw error;
    }
  });

program.command('tui')
  .description('Start the TUI chat interface')
  .action(async () => {
    try {
      await startTUI();
    } catch (error) {
      const err = error as Error;
      console.error(chalk.red('TUI error:'), err.message);
      process.exit(1);
    }
  });

program.command('start')
  .description('Start the gateway headless (Telegram, etc.)')
  .action(async () => {
    try {
      const gateway = new Gateway();
      await gateway.start();

      console.log(chalk.green('\n🐾 Gateway started. Press Ctrl+C to stop.\n'));

      process.on('SIGINT', async () => {
        console.log(chalk.dim('\nShutting down...'));
        await gateway.stop();
        process.exit(0);
      });
    } catch (error) {
      const err = error as Error;
      console.error(chalk.red('Gateway error:'), err.message);
      process.exit(1);
    }
  });

program.command('kill')
  .description('Kill all running OpenPaw instances')
  .action(() => {
    try {
      const result = execSync(
        'pgrep -f "node.*(openpaw.tui|openpaw.start|openpaw.start)" | grep -v $$ | xargs -r kill 2>&1 || true',
        { encoding: 'utf-8' }
      );
      if (result.trim()) {
        console.log(result.trim());
      } else {
        console.log(chalk.green('✓ No running instances found.'));
      }
    } catch {
      console.log(chalk.green('✓ No running instances found.'));
    }
  });

const gatewayCmd = program.command('gateway')
  .description('Manage the gateway daemon');

gatewayCmd.command('start')
  .description('Start the gateway daemon')
  .action(async () => {
    await handleGatewayStart();
  });

gatewayCmd.command('stop')
  .description('Stop the gateway daemon')
  .action(async () => {
    await handleGatewayStop();
  });

gatewayCmd.command('restart')
  .description('Restart the gateway daemon')
  .action(async () => {
    await handleGatewayRestart();
  });

gatewayCmd.command('status')
  .description('Show gateway status')
  .action(async () => {
    await handleGatewayStatus();
  });

program.parse();

if (process.argv.length === 2) {
  program.outputHelp();
}
